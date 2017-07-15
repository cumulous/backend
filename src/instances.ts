import * as stringify from 'json-stable-stringify';
import { Client as SSHClient, ClientChannel as SSHClientChannel, SFTPWrapper } from 'ssh2';

import { ec2, s3 } from './aws';
import { log } from './log';
import { AWSError, Callback } from './types';
import { assertNonEmptyArray } from './util';

// shim to be replaced with a DB lookup
const instanceTypes = require('./instance-types.json');

export const volumeType = 'gp2';
export const sshUser = 'ec2-user';
export const initScriptFile = 'init.sh';
export const mountPath = '/mnt/scratch';

export function describeInstance(instanceId: string, context: any, callback: Callback) {
  ec2.describeInstances({
    InstanceIds: [ instanceId ],
  }).promise()
    .then(instances =>
      callback(null, instances.Reservations[0].Instances[0]))
    .catch(callback);
}

interface SSHKeyConfig {
  Name: string;
  Bucket: string;
  Path: string;
  EncryptionKeyId?: string;
}

export function createSSHKey(request: SSHKeyConfig, context: any, callback: Callback) {
  Promise.resolve()
    .then(() => createKeyPair(request.Name))
    .then(key => putSSHKey(key, request.Bucket, request.Path, request.EncryptionKeyId))
    .then(() => callback())
    .catch((err: AWSError) =>
      callback(err.code === 'InvalidKeyPair.Duplicate' ? null : err));
}

function createKeyPair(name: string) {
  return ec2.createKeyPair({
    KeyName: name,
  }).promise()
    .then(data => data.KeyMaterial);
}

function putSSHKey(key: string, bucket: string, path: string, encryptionKeyId: string) {
  return s3.putObject({
    Bucket: bucket,
    Key: path,
    Body: key,
    SSEKMSKeyId: encryptionKeyId,
    ServerSideEncryption: 'aws:kms',
  }).promise();
}

export function deleteSSHKey(request: SSHKeyConfig, context: any, callback: Callback) {
  Promise.resolve()
    .then(() => deleteKeyPair(request.Name))
    .then(() => deleteSSHKeyObject(request.Bucket, request.Path))
    .then(() => callback())
    .catch((err: AWSError) =>
      callback(err.code === 'InvalidKeyPair.NotFound' ? null : err));
}

function deleteKeyPair(name: string) {
  return ec2.deleteKeyPair({
    KeyName: name,
  }).promise();
}

function deleteSSHKeyObject(bucket: string, path: string) {
  return s3.deleteObject({
    Bucket: bucket,
    Key: path,
  }).promise();
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
  assertNonEmptyArray(event.volumeSizes, 'event.volumeSizes');
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
  assertNonEmptyArray(volumeIds, 'volumeIds');
  callback(null, Array.apply(this, Array(volumeIds.length))
    .map((volume: void, volumeIndex: number) =>
      '/dev/sd' + String.fromCharCode('f'.charCodeAt(0) + volumeIndex)));
}

export function attachVolumes(event: {volumeIds: string[], volumeDevices: string[], InstanceId: string},
                            context: any, callback: Callback) {
  assertNonEmptyArray(event.volumeIds, 'event.volumeIds');
  assertNonEmptyArray(event.volumeDevices, 'event.volumeDevices');

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
  assertNonEmptyArray(volumeIds, 'volumeIds');
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
  assertNonEmptyArray(event.volumeDevices, 'event.volumeDevices');
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

export interface SSHConfig {
  PrivateIpAddress: string;
  bucket: string;
  path: string;
  volumeDevices?: string[];
}

export function transferInitScript(request: SSHConfig, context: any, callback: Callback) {
  sshRun(request, sshTransfer, initScriptFile, callback)
    .catch(callback);
}

export function executeInitScript(request: SSHConfig, context: any, callback: Callback) {
  Promise.resolve()
    .then(() => initCommand(request.volumeDevices))
    .then(command => sshRun(request, sshExecute, command, callback))
    .catch(callback);
}

function sshRun(request: SSHConfig,
                action: (client: SSHClient, args: any, callback: Callback) => void,
                args: any,
                callback: Callback) {
  return Promise.resolve()
    .then(() => fetchSSHKey(request.bucket, request.path))
    .then(key => {
      const client = new SSHClient();
      client.on('ready', () => action(client, args, callback))
            .on('error', callback);
      sshConnect(client, request.PrivateIpAddress, key as Buffer);
    });
}

function fetchSSHKey(bucket: string, path: string) {
  return s3.getObject({
    Bucket: bucket,
    Key: path,
  }).promise()
    .then(data => data.Body);
}

function sshConnect(client: SSHClient, instanceAddress: string, sshKey: Buffer) {
  client.connect({
    host: instanceAddress,
    username: sshUser,
    privateKey: sshKey,
  });
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

function initCommand(volumeDevices: string[]) {
  return `sudo sh ${initScriptFile} "${volumeDevices.join(' ')}" "${mountPath}"`;
}
