import { AWSError } from 'aws-sdk/lib/error';
import { EC2, S3, StepFunctions } from 'aws-sdk';
import * as stringify from 'json-stable-stringify';
import { Client as SSHClient, ClientChannel as SSHClientChannel, SFTPWrapper } from 'ssh2';

import * as cloudformation from './cloudformation';
import { envNames } from './env';
import { createStateMachine, executeStateMachine } from './states';
import { log } from './log';
import { testEmpty } from './helpers';
import { Callback } from './types';

// shim to be replaced with a DB lookup
const instanceTypes = require('./instance-types.json');

const initDefinition = require('./instances-init.json');
const setupSSHKeyDefinition = require('./instances-setup-ssh-key.json');

export const defaults = {
  sshUser: 'ec2-user',
  mountPath: '/mnt/scratch',
};

export const initScriptFile = 'init.sh';
export const volumeType = 'gp2';

export const ec2 = new EC2();
export const s3 = new S3();
export const stepFunctions = new StepFunctions();

export function setupInstancesInit(request: cloudformation.Request, context: any, callback: Callback) {
  log.info(stringify(request));
  createStateMachine(initDefinition, null, (err?: Error) =>
    cloudformation.sendOnError(request, err, callback));
}

export function init(event: any, context: any, callback: Callback) {
  executeStateMachine({
    logicalName: initDefinition.Comment,
    input: event,
  }, context, callback);
}

export function describeInstance(instanceId: string, context: any, callback: Callback) {
  ec2.describeInstances({
    InstanceIds: [ instanceId ],
  }).promise()
    .then(instances =>
      callback(null, instances.Reservations[0].Instances[0]))
    .catch(callback);
}

export function setupSSHKey(request: cloudformation.Request, context: any, callback: Callback) {
  log.info(stringify(request));
  createStateMachine(setupSSHKeyDefinition, null, (err?: Error) => {
    if (err) return cloudformation.sendOnError(request, err, callback);
    executeStateMachine({
      logicalName: setupSSHKeyDefinition.Comment,
      input: request,
    }, null, (err?: Error) =>
      cloudformation.sendOnError(request, err, callback));
  });
}

export function createSSHKey(event: any, context: any, callback: Callback) {
  createKeyPair()
    .then(putSSHKey)
    .then(() => callback())
    .catch((err: AWSError) =>
      callback(err.code === 'InvalidKeyPair.Duplicate' ? null : err));
}

function createKeyPair() {
  return ec2.createKeyPair({
    KeyName: process.env[envNames.sshKeyName],
  }).promise()
    .then(data => data.KeyMaterial);
}

function putSSHKey(key: string) {
  return s3.putObject({
    Bucket: process.env[envNames.sshKeyS3Bucket],
    Key: process.env[envNames.sshKeyS3Path],
    Body: key,
    SSEKMSKeyId: process.env[envNames.encryptionKeyId],
    ServerSideEncryption: 'aws:kms',
  }).promise();
}

export function deleteSSHKey(event: any, context: any, callback: Callback) {
  deleteKeyPair()
    .then(deleteSSHKeyObject)
    .then(() => callback())
    .catch((err: AWSError) =>
      callback(err.code === 'InvalidKeyPair.NotFound' ? null : err));
}

function deleteKeyPair() {
  return ec2.deleteKeyPair({
    KeyName: process.env[envNames.sshKeyName],
  }).promise();
}

function deleteSSHKeyObject() {
  return s3.deleteObject({
    Bucket: process.env[envNames.sshKeyS3Bucket],
    Key: process.env[envNames.sshKeyS3Path],
  }).promise();
}

export function checkSSHKeyName(keyName: string, context: any, callback: Callback) {
  if (process.env[envNames.sshKeyName] == null) {
    callback(Error(envNames.sshKeyName + ' is missing from the environment'));
  } else if (process.env[envNames.sshKeyName] != keyName) {
    callback(Error('Instance key name mismatch: ' + keyName + ', ' +
                   'expected: ' + process.env[envNames.sshKeyName] + '.'));
  } else {
    callback();
  }
}

export function calculateVolumeSizes(instanceType: string, context: any, callback: Callback) {
  if (instanceTypes[instanceType]) {
    const throughput = instanceTypes[instanceType] / 8; // MB/s
    const volumeCount = Math.ceil(throughput / 160); // max throughput for 'gp2' volumes
    const volumeSize = Math.floor(throughput * 1024 / 256 / 3 / volumeCount);

    const volumeSizes = Array.apply(this, Array(volumeCount)).map(() => volumeSize);

    callback(null, volumeSizes);
  } else {
    callback(Error('Unrecognized volume type: ' + instanceType + ', ' +
                   'expected: ' + Object.keys(instanceTypes).join(', ')));
  }
}

export function createVolumes(event: { volumeSizes: number[], Placement: { AvailabilityZone: string }},
                            context: any, callback: Callback) {
  testEmpty(event.volumeSizes, 'event.volumeSizes');
  Promise.all(event.volumeSizes
    .map(volumeSize => createVolume(volumeSize, event.Placement.AvailabilityZone)))
    .then(volumeIds => callback(null, volumeIds))
    .catch(callback);
}

function createVolume(volumeSize: number, availabilityZone: string) {
  return ec2.createVolume({
      AvailabilityZone: availabilityZone,
      Size: volumeSize,
      VolumeType: volumeType,
    }).promise()
      .then(volume => volume.VolumeId);
}

export function waitForVolumesAvailable(volumeIds: string[], context: any, callback: Callback) {
  ec2.waitFor('volumeAvailable', {
    VolumeIds: volumeIds,
  }).promise()
    .then(() => callback())
    .catch(callback);
}

export function calculateVolumeDevices(volumeIds: string[], context: any, callback: Callback) {
  testEmpty(volumeIds, 'volumeIds');
  callback(null, Array.apply(this, Array(volumeIds.length))
    .map((volume: void, volumeIndex: number) =>
      '/dev/sd' + String.fromCharCode('f'.charCodeAt(0) + volumeIndex)));
}

export function attachVolumes(event: {volumeIds: string[], volumeDevices: string[], InstanceId: string},
                            context: any, callback: Callback) {
  testEmpty(event.volumeIds, 'event.volumeIds');
  testEmpty(event.volumeDevices, 'event.volumeDevices');

  if (event.volumeIds.length !== event.volumeDevices.length) {
    throw Error('Expected volumeIds[] and volumeDevices[] of equal length');
  } else {
    Promise.all(event.volumeDevices
      .map((volumeDevice: string, volumeIndex: number) =>
        attachVolume(event.volumeIds[volumeIndex], volumeDevice, event.InstanceId)))
      .then(() => callback())
      .catch(callback);
  }
}

function attachVolume(volumeId: string, volumeDevice: string, instanceId: string) {
  return ec2.attachVolume({
      VolumeId: volumeId,
      Device: volumeDevice,
      InstanceId: instanceId,
    }).promise();
}

export function detachVolumes(volumeIds: string[], context: any, callback: Callback) {
  cleanupVolumes(volumeIds, 'detachVolume', callback);
}

export function deleteVolumes(volumeIds: string[], context: any, callback: Callback) {
  cleanupVolumes(volumeIds, 'deleteVolume', callback);
}

function cleanupVolumes(volumeIds: string[], action: string, callback: Callback) {
  testEmpty(volumeIds, 'volumeIds');
  Promise.all(volumeIds
    .map(volumeId => cleanupVolume(volumeId, action)))
    .then(() => callback());
}

function cleanupVolume(volumeId: string, action: string) {
  return (ec2 as any)[action]({
      VolumeId: volumeId,
    }).promise()
      .catch((err: Error) => log.error(err.message));
}

export function deleteVolumesOnTermination(event: {volumeDevices: string[], InstanceId: string},
                                         context: any, callback: Callback) {
  testEmpty(event.volumeDevices, 'event.volumeDevices');
  ec2.modifyInstanceAttribute({
    InstanceId: event.InstanceId,
    BlockDeviceMappings: event.volumeDevices.map(volumeDevice => ({
      DeviceName: volumeDevice,
      Ebs: {
        DeleteOnTermination: true,
      },
    })),
  }).promise()
    .then(() => callback())
    .catch(callback);
}

export function transferInitScript(instanceAddress: string, context: any, callback: Callback) {
  sshRun(instanceAddress, sshTransfer, initScriptFile, callback);
}

function sshTransfer(client: SSHClient, scriptFile: string, callback: Callback) {
  client.sftp((err: Error, sftp: SFTPWrapper) => {
    if (err) return callback(err);

    sftp.fastPut(scriptFile, scriptFile, err => {
      if (err) return callback(err);

      client.end();
      callback();
    });
  });
}

function sshRun(instanceAddress: string,
                action: (client: SSHClient, args: any, callback: Callback) => void,
                args: any,
                callback: Callback) {
  fetchSSHKey().then(key => {
    const client = new SSHClient();
    client.on('ready', () => action(client, args, callback))
          .on('error', callback);
    sshConnect(client, instanceAddress, key as Buffer);
  }).catch(callback);
}

function fetchSSHKey() {
  return s3.getObject({
    Bucket: process.env[envNames.sshKeyS3Bucket],
    Key: process.env[envNames.sshKeyS3Path],
  }).promise()
    .then(data => data.Body);
}

function sshConnect(client: SSHClient, instanceAddress: string, sshKey: Buffer) {
  client.connect({
    host: instanceAddress,
    username: process.env[envNames.sshUser] || defaults.sshUser,
    privateKey: sshKey,
  });
}

export function executeInitScript(event: {volumeDevices: string[], PublicDnsName: string},
                                context: any, callback: Callback) {
  sshRun(event.PublicDnsName, sshExecute, initCommand(event.volumeDevices), callback);
}

function initCommand(volumeDevices: string[]) {
  return 'sudo sh ' + initScriptFile + ' ' +
                '"' + volumeDevices.join(' ') + '"' + ' ' +
                '"' + (process.env[envNames.mountPath] || defaults.mountPath) + '"';
}

function sshExecute(client: SSHClient, command: string, callback: Callback) {
  client.exec(command, (err: Error, channel: SSHClientChannel) => {
    if (err) return callback(err);

    channel.on('close', (exitCode: number) => {
      if (exitCode) {
        return callback(Error('SSH exited with code ' + exitCode));
      }
      client.end();
      callback();
    }).on('data', (stdout: Buffer) => log.info(stdout.toString()))
      .stderr.on('data', (stderr: Buffer) => log.error(stderr.toString()));
  });
}