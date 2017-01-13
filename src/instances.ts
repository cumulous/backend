import { EC2, S3 } from 'aws-sdk';
import { Client as SSHClient, ClientChannel as SSHClientChannel, SFTPWrapper } from 'ssh2';
import { log } from './log';
import { Callback } from './types';

export const envNames = {
  sshKeyName: 'SSH_KEY_NAME',
  sshKeyS3Bucket: 'SSH_KEY_S3_BUCKET',
  sshKeyS3Path: 'SSH_KEY_S3_PATH',
  sshUser: 'SSH_USER',
  sshRetryDelay: 'SSH_RETRY_DELAY',
  sshRetryCount: 'SSH_RETRY_COUNT',
  mountPath: 'MOUNT_PATH',
};

export const defaults = {
  sshUser: 'ec2-user',
  sshRetryDelay: 10000,
  sshRetryCount: 5,
  mountPath: '/mnt/scratch',
};

export const scriptCreateMount = 'create_mount.sh';
export const volumeType = 'gp2';

export const ec2 = new EC2();
export const s3 = new S3();

export function init(event: any, context: any, callback: Callback) {
  Promise
    .resolve(event)
    .then(validateInitEvent)
    .then(describeInstance)
    .then(initVolumes)
    .then(() => callback())
    .catch(callback);
}

function validateInitEvent(event: any) {
  if (event == null) {
    throw Error('Expected event to be defined');
  } else if (event.detail == null) {
    throw Error('Expected event to provide detail');
  } else {
    return event.detail['instance-id'];
  }
}

function describeInstance(instanceId: string) {
  log.info('Retrieving information about instance', instanceId);

  return ec2.describeInstances({
    InstanceIds: [ instanceId ],
  }).promise()
    .then(data => {
      if (data.Reservations.length === 1) {
        return data.Reservations[0].Instances[0];
      } else {
        throw Error('Unable to describe the instance');
      }
    });
}

function initVolumes(instance: EC2.Types.Instance) {
  return Promise
    .resolve(instance)
    .then(checkSSHKeyName)
    .then(calculateVolumeSizes)
    .then(checkVolumesExist.bind(this, instance.InstanceId))
    .then(createVolumes.bind(this, instance.Placement.AvailabilityZone))
    .then(waitForVolumes)
    .then(volumeIds => attachVolumes(instance.InstanceId, volumeIds)
      .catch(deleteVolumesAndExit.bind(this, volumeIds)))
    .then(deleteVolumesOnTermination.bind(this, instance.InstanceId))
    .then(createMount.bind(this, instance.PublicDnsName))
    .then(() => instance);
}

function checkSSHKeyName(instance: EC2.Types.Instance) {
  if (process.env[envNames.sshKeyName] == null) {
    throw Error(envNames.sshKeyName + ' is missing from the environment');
  } else if (process.env[envNames.sshKeyName] != instance.KeyName) {
    throw Error('Instance key name mismatch: ' + instance.KeyName + ', ' +
                'expected: ' + process.env[envNames.sshKeyName] + '.');
  }
  log.info('Instance key:', instance.KeyName);
  return instance.InstanceType;
}

function calculateVolumeSizes(instanceType: EC2.Types.InstanceType) {
  // shim to be replaced with a DB lookup
  const instances: { [instanceType: string]: number } = {
    'c4.large': 500,
    'c4.xlarge': 750,
    'c4.2xlarge': 1000,
    'c4.4xlarge': 2000,
    'c4.8xlarge': 4000,
    'r4.large': 400,
    'r4.xlarge': 800,
    'r4.2xlarge': 1600,
    'r4.4xlarge': 3000,
    'r4.8xlarge': 6000,
    'r4.16xlarge': 12000,
    'm4.large': 450,
    'm4.xlarge': 750,
    'm4.2xlarge': 1000,
    'm4.4xlarge': 2000,
    'm4.10xlarge': 4000,
    'm4.16xlarge': 10000,
  };

  log.info('Instance type:', instanceType);
  log.info('Using volumes of type:', volumeType);

  const throughput = instances[instanceType] / 8;
  const volumeCount = Math.ceil(throughput / 160); // max throughput for 'gp2' volumes
  const volumeSize = Math.floor(throughput * 1024 / 256 / 3 / volumeCount);

  const volumeSizes = Array.apply(this, Array(volumeCount)).map(() => volumeSize);

  log.info('Calculated volume sizes:', volumeSizes.join(', '));

  return volumeSizes;
}

function checkVolumesExist(instanceId: string, volumeSizes: number[]) {

  const volumeDevices = calculateVolumeDevices(volumeSizes.length);
  log.info('Calculated volume devices:', volumeDevices.join(', '));

  return ec2.describeVolumes({
    Filters: [
      {
        Name: 'attachment.instance-id',
        Values: [ instanceId ],
      },
      {
        Name: 'attachment.device',
        Values: volumeDevices,
      },
    ],
  }).promise()
    .then(data => {
      if (data.Volumes.length > 0) {
        throw Error('Volume(s) already attached');
      } else {
        return volumeSizes;
      }
    });
}

function createVolumes(availabilityZone: string, volumeSizes: number[]) {
  log.info('Creating volumes');

  return Promise.all(
    volumeSizes.map(volumeSize =>
      createVolume(availabilityZone, volumeSize)));
}

function createVolume(availabilityZone: string, volumeSize: number) {
  return ec2.createVolume({
      AvailabilityZone: availabilityZone,
      Size: volumeSize,
      VolumeType: volumeType,
    }).promise()
      .then(volume => volume.VolumeId);
}

function waitForVolumes(volumeIds: string[]) {
  return ec2.waitFor('volumeAvailable', {
      VolumeIds: volumeIds,
    }).promise()
      .then(() => volumeIds);
}

function attachVolumes(instanceId: string, volumeIds: string[]) {
  log.info('Attaching volumes');

  return Promise.all(
    calculateVolumeDevices(volumeIds.length)
      .map((volumeDevice: string, volumeIndex: number) =>
        attachVolume(instanceId, volumeIds[volumeIndex], volumeDevice)));
}

function calculateVolumeDevices(volumeCount: number) {
  return Array.apply(this, Array(volumeCount))
    .map((volume: void, volumeIndex: number) =>
      '/dev/sd' + String.fromCharCode('f'.charCodeAt(0) + volumeIndex));
}

function attachVolume(instanceId: string, volumeId: string, volumeDevice: string) {
  return ec2.attachVolume({
      InstanceId: instanceId,
      VolumeId: volumeId,
      Device: volumeDevice,
    }).promise()
      .then(() => volumeDevice);
}

function deleteVolumesAndExit(volumeIds: string[], err: Error) {
  log.info('Deleting volumes');

  return deleteVolumes(volumeIds)
    .then(() => {
      throw err;
    }, errDelete => {
      throw Error(err.message + ', ' + errDelete.message);
    });
}

function deleteVolumes(volumeIds: string[]) {
  return Promise.all(
    volumeIds.map(deleteVolume));
}

function deleteVolume(volumeId: string) {
  return ec2.deleteVolume({
      VolumeId: volumeId,
    }).promise();
}

function deleteVolumesOnTermination(instanceId: string, volumeDevices: string[]) {
  log.info('Instructing instance to delete volumes on termination');

  return ec2.modifyInstanceAttribute({
      InstanceId: instanceId,
      BlockDeviceMappings: volumeDevices.map(volumeDevice => ({
        DeviceName: volumeDevice,
        Ebs: {
          DeleteOnTermination: true,
        },
      })),
    }).promise()
      .then(() => volumeDevices);
}

function createMount(instanceAddress: string, volumeDevices: string[]) {
  return fetchKey()
    .then(key => sshRunScript(
      instanceAddress,
      key as Buffer,
      scriptCreateMount,
      commandCreateMount(volumeDevices),
    ));
}

function fetchKey() {
  const bucket = process.env[envNames.sshKeyS3Bucket];
  const path = process.env[envNames.sshKeyS3Path];

  log.info('Fetching SSH key from s3://' + bucket + '/' + path);

  return s3.getObject({
    Bucket: bucket,
    Key: path,
  }).promise()
    .then(data => data.Body);
}

function commandCreateMount(volumeDevices: string[]) {
  return 'sudo sh ' + scriptCreateMount + ' ' +
                '"' + volumeDevices.join(' ') + '"' + ' ' +
                '"' + (process.env[envNames.mountPath] || defaults.mountPath) + '"';
}

function sshRunScript(instanceAddress: string, key: Buffer, scriptFile: string, command: string) {
  return new Promise((callback: Callback, callbackError: Callback) => {
      const client = new SSHClient();
      const connect = () => sshConnect(instanceAddress, key, client);

      let retries = 0;
      const retry = (err: Error) => {
        const maxRetries = process.env[envNames.sshRetryCount] == null ?
          defaults.sshRetryCount : parseInt(process.env[envNames.sshRetryCount]);
        const retryDelay = process.env[envNames.sshRetryDelay] == null ?
          defaults.sshRetryDelay : parseInt(process.env[envNames.sshRetryDelay]);

        if (retries++ < maxRetries) {
          log.warn('Error connecting to SSH:', err.message + ', retrying');

          return setTimeout(connect, retryDelay);
        }
        callbackError(err);
      };

      client.on('ready', () =>
        client.sftp((err: Error, sftp: SFTPWrapper) => {
          if (err) return callbackError(err);

          log.info('Transferring script', scriptFile);
          sftp.fastPut(scriptFile, scriptFile, (err: Error) => {
            if (err) return callbackError(err);

            sshExec(client, command, callback, callbackError);
          });
        })
      ).on('error', retry);

      connect();
    });
}

function sshConnect(instanceAddress: string, key: Buffer, client: SSHClient, ) {
  log.info('Connecting to instance at', instanceAddress);

  client.connect({
    host: instanceAddress,
    username: process.env[envNames.sshUser] || defaults.sshUser,
    privateKey: key,
  });
}

function sshExec(client: SSHClient, command: string, callback: Callback, callbackError: Callback) {
  log.info('Executing:', command);

  client.exec(command, (err: Error, channel: SSHClientChannel) => {
    if (err) return callbackError(err);

    channel.on('close', (exitCode: number) => {
      if (exitCode) {
        return callbackError(Error('SSH exited with code ' + exitCode));
      }
      client.end();
      callback();
    }).on('data', (stdout: Buffer) => log.info(stdout.toString()))
      .stderr.on('data', (stderr: Buffer) => log.error(stderr.toString()));
  });
}