import { Client as SSHClient } from 'ssh2';
import { ec2, s3, init, volumeType, scriptCreateMount, envNames, defaults } from './instances';
import { log as log } from './log';
import { Callback, TestCallback } from './types';

if (!process.env['LOG_LEVEL']) {
  log.remove(log.transports.Console);
}

const fakeRequest = (value?: any) => ({
  promise : () => Promise.resolve(value),
});

describe('init()', () => {
  const fakeAvailabilityZone = 'us-east-1a';
  const fakeInstanceId = 'i-abcd1234';
  const fakeInstanceType = 'r4.2xlarge';
  const fakeVolumeSize = 133; // specific to fakeInstanceType
  const fakeInstanceAddress = 'EC2-fake.compute-1.amazonaws.com';
  const fakeSSHKeyName = 'fake-ssh-key';
  const fakeSSHKeyS3Bucket = 'fake-ssh-key-bucket';
  const fakeSSHKeyS3Path = 'fake-ssh-key-path/key.pem';
  const fakeSSHUser = 'fake-user';
  const fakeSSHRetryDelay = 1;
  const fakeSSHRetryCount = 3;
  const fakeMountPath = '/mnt/testmount';

  let fakeEvent: any;
  let fakeInstance: any;
  let fakeVolumes: any[];
  let fakeSSHKey: any;

  let spyOnDescribeInstances: jasmine.Spy;
  let spyOnDescribeVolumes: jasmine.Spy;
  let spyOnCreateVolume: jasmine.Spy;
  let spyOnWaitFor: jasmine.Spy;
  let spyOnAttachVolume: jasmine.Spy;
  let spyOnDeleteVolume: jasmine.Spy;
  let spyOnModifyInstanceAttribute: jasmine.Spy;
  let spyOnS3GetObject: jasmine.Spy;
  let spyOnSSHClientEvent: jasmine.Spy;
  let spyOnSSHClientConnect: jasmine.Spy;
  let spyOnSSHClientSftp: jasmine.Spy;
  let spyOnSSHSftpWrapper: jasmine.Spy;
  let spyOnSSHClientExec: jasmine.Spy;
  let spyOnSSHClientChannel: jasmine.Spy;
  let spyOnSSHClientEnd: jasmine.Spy;

  beforeEach(() => {
    fakeEvent = {
      detail: {
        'instance-id': fakeInstanceId,
        'state': 'running',
      },
    };

    fakeInstance = {
      Reservations: [{
        Instances: [{
          InstanceId: fakeInstanceId,
          InstanceType: fakeInstanceType,
          Placement: {
            AvailabilityZone: fakeAvailabilityZone,
          },
          KeyName: fakeSSHKeyName,
          PublicDnsName: fakeInstanceAddress,
        }],
      }],
    };

    fakeVolumes = [ // count is specific to fakeInstanceType
      {
        VolumeId: 'vol-abcd01',
        Device: '/dev/sdf',
      },
      {
        VolumeId: 'vol-abcd10',
        Device: '/dev/sdg',
      }
    ];

    fakeSSHKey = {
      Body: new Buffer(256),
    };

    process.env[envNames.sshKeyName] = fakeSSHKeyName;
    process.env[envNames.sshKeyS3Bucket] = fakeSSHKeyS3Bucket;
    process.env[envNames.sshKeyS3Path] = fakeSSHKeyS3Path;
    process.env[envNames.sshUser] = fakeSSHUser;
    process.env[envNames.sshRetryDelay] = fakeSSHRetryDelay;
    process.env[envNames.sshRetryCount] = fakeSSHRetryCount;
    process.env[envNames.mountPath] = fakeMountPath;

    spyOnDescribeInstances = spyOn(ec2, 'describeInstances')
      .and.returnValue(fakeRequest(fakeInstance));

    spyOnDescribeVolumes = spyOn(ec2, 'describeVolumes')
      .and.returnValue(fakeRequest({ Volumes: [] }));

    spyOnCreateVolume = spyOn(ec2, 'createVolume')
      .and.returnValues.apply(this, fakeVolumes.map(fakeRequest));

    spyOnWaitFor = spyOn(ec2, 'waitFor')
      .and.returnValue(fakeRequest());

    spyOnAttachVolume = spyOn(ec2, 'attachVolume')
      .and.returnValue(fakeRequest());

    spyOnDeleteVolume = spyOn(ec2, 'deleteVolume')
      .and.returnValue(fakeRequest());

    spyOnModifyInstanceAttribute = spyOn(ec2, 'modifyInstanceAttribute')
      .and.returnValue(fakeRequest());

    spyOnS3GetObject = spyOn(s3, 'getObject')
      .and.returnValue(fakeRequest(fakeSSHKey));

    spyOnSSHClientEvent = spyOn(SSHClient.prototype, 'on')
      .and.callFake(function(event: 'ready', callback: (data: any) => void) {
        if (event === 'ready') {
          this.ready = callback;
        }
        return this;
      });

    spyOnSSHClientConnect = spyOn(SSHClient.prototype, 'connect')
      .and.callFake(function() { this.ready(); });

    spyOnSSHClientSftp = spyOn(SSHClient.prototype, 'sftp')
      .and.callFake((callback: Callback) => callback(null, spyOnSSHSftpWrapper));

    spyOnSSHSftpWrapper = jasmine.createSpyObj('spyOnSSHSftpWrapper', ['fastPut']);
    (spyOnSSHSftpWrapper as any).fastPut
      .and.callFake((localPath: string, remotePath: string, callback: Callback) => callback());

    spyOnSSHClientExec = spyOn(SSHClient.prototype, 'exec')
      .and.callFake((command: string, callback: Callback) =>
        callback(null, spyOnSSHClientChannel));

    spyOnSSHClientChannel = jasmine.createSpyObj('spyOnSSHClientChannelOn', ['on']);
    (spyOnSSHClientChannel as any).on
      .and.callFake(function(event: string, callback: (data: any) => void) {
        if (event === 'close') {
          callback(0);
        } else if (event == 'data') {
          callback('Fake STDOUT');
        }
        return this;
      });
    (spyOnSSHClientChannel as any).stderr =
      jasmine.createSpyObj('spyOnSSHClientChannelStderr', ['on']);
    (spyOnSSHClientChannel as any).stderr.on
      .and.callFake(function(event: 'data', callback: (data: any) => void) {
        callback('Fake STDERR');
        return this;
      });

    spyOnSSHClientEnd = spyOn(SSHClient.prototype, 'end');
  });

  describe('calls', () => {
    it('EC2.describeInstances() once with correct parameters', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect(spyOnDescribeInstances).toHaveBeenCalledWith({
          InstanceIds: [ fakeInstanceId ]
        });
        expect(spyOnDescribeInstances).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('S3.getObject() once with correct parameters', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect(spyOnS3GetObject).toHaveBeenCalledWith({
          Bucket: process.env[envNames.sshKeyS3Bucket],
          Key: process.env[envNames.sshKeyS3Path],
        });
        expect(spyOnS3GetObject).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('EC2.describeVolumes() once with correct parameters', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect(spyOnDescribeVolumes).toHaveBeenCalledWith({
          Filters: [
            {
              Name: 'attachment.instance-id',
              Values: [ fakeInstanceId ],
            },
            {
              Name: 'attachment.device',
              Values: fakeVolumes.map(volume => volume.Device),
            },
          ],
        });
        expect(spyOnDescribeVolumes).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('EC2.createVolume() with correct parameters, once for each volume', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect(spyOnCreateVolume).toHaveBeenCalledWith({
          AvailabilityZone: fakeAvailabilityZone,
          Size: fakeVolumeSize,
          VolumeType: volumeType,
        });
        expect(spyOnCreateVolume).toHaveBeenCalledTimes(fakeVolumes.length);
        done();
      });
    });

    it('EC2.waitFor("volumeAvailable") once with correct parameters', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect(spyOnWaitFor).toHaveBeenCalledWith('volumeAvailable', {
          VolumeIds: fakeVolumes.map(volume => volume.VolumeId),
        });
        expect(spyOnWaitFor).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('EC2.attachVolume() with correct parameters, once for each volume', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        for (const fakeVolume of fakeVolumes) {
          expect(spyOnAttachVolume).toHaveBeenCalledWith({
            InstanceId: fakeInstanceId,
            VolumeId: fakeVolume.VolumeId,
            Device: fakeVolume.Device,
          });
        }
        expect(spyOnAttachVolume).toHaveBeenCalledTimes(fakeVolumes.length);
        done();
      });
    });

    it('EC2.deleteVolume() with correct parameters if attachVolume() returns an error, ' +
       'once for each volume, even if one of deleteVolume() itself returns an error',
        (done: TestCallback) => {
      const causeError = (source: string, spy: jasmine.Spy,) => {
        const fakeRequests = fakeVolumes.map(fakeRequest);
        fakeRequests[0] = {
          promise : () => Promise.reject(Error(source)),
        };
        spy.and.returnValues.apply(this, fakeRequests);
      };
      causeError('EC2.attachVolume()', spyOnAttachVolume);
      causeError('EC2.deleteVolume()', spyOnDeleteVolume);
      init(fakeEvent, null, () => {
        for (const fakeVolume of fakeVolumes) {
          expect(spyOnDeleteVolume).toHaveBeenCalledWith({
            VolumeId: fakeVolume.VolumeId,
          });
        }
        expect(spyOnDeleteVolume).toHaveBeenCalledTimes(fakeVolumes.length);
        done();
      });
    });

    it('EC2.modifyInstanceAttribute() once with correct parameters', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect(spyOnModifyInstanceAttribute).toHaveBeenCalledWith({
          InstanceId: fakeInstanceId,
          BlockDeviceMappings: fakeVolumes.map(volume => ({
            DeviceName: volume.Device,
            Ebs: {
              DeleteOnTermination: true,
            },
          })),
        });
        expect(spyOnModifyInstanceAttribute).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('ssh2.Client.on() once with correct parameters', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect(spyOnSSHClientEvent).toHaveBeenCalledWith('ready', jasmine.any(Function));
        expect(spyOnSSHClientEvent).toHaveBeenCalledWith('error', jasmine.any(Function));
        expect(spyOnSSHClientEvent).toHaveBeenCalledTimes(2);
        done();
      });
    });

    describe('ssh2.Client.connect() once with correct parameters if SSH_USER is', () => {
      const testConnect = (user: string, done: TestCallback) => {
        init(fakeEvent, null, () => {
          expect(spyOnSSHClientConnect).toHaveBeenCalledWith({
            host: fakeInstanceAddress,
            username: user,
            privateKey: fakeSSHKey.Body,
          });
          expect(spyOnSSHClientConnect).toHaveBeenCalledTimes(1);
          done();
        });
      };
      it('set', (done: TestCallback) => {
        testConnect(fakeSSHUser, done);
      });
      it('not set', (done: TestCallback) => {
        delete process.env[envNames.sshUser];
        testConnect(defaults.sshUser, done);
      });
    });

    describe('ssh2.Client.connect() multiple times with', () => {
      const testConnect = (timeout: number, retries: number, done: TestCallback) => {
        spyOnSSHClientConnect.and.callFake(function() {
          this.error(Error('SSH_connect'));
        });
        spyOnSSHClientEvent.and.callFake(function(event: string, callback: (data: any) => void) {
          if (event === 'ready') {
            this.ready = callback;
          } else if (event === 'error') {
            this.error = callback;
          }
          return this;
        });
        spyOn(global, 'setTimeout').and.callFake((callback: () => void, delay: number) => {
          expect(delay).toEqual(timeout);
          callback();
        });
        init(fakeEvent, null, () => {
          expect(spyOnSSHClientConnect).toHaveBeenCalledTimes(1 + retries);
          done();
        });
      };
      it('correct parameters, if a client error occurs each time and parameters are set',
          (done: TestCallback) => {
        testConnect(fakeSSHRetryDelay, fakeSSHRetryCount, done);
      });
      it('default parameters, if a client error occurs each time and parameters are not set',
          (done: TestCallback) => {
        delete process.env[envNames.sshRetryDelay];
        delete process.env[envNames.sshRetryCount];
        testConnect(defaults.sshRetryDelay, defaults.sshRetryCount, done);
      });
    });

    it('ssh2.Client.sftp() once with correct parameters', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect(spyOnSSHClientSftp).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('ssh2.SFTPWrapper.fastPut() once with correct parameters', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect((spyOnSSHSftpWrapper as any).fastPut).toHaveBeenCalledWith(
          scriptCreateMount, scriptCreateMount, jasmine.any(Function));
        expect((spyOnSSHSftpWrapper as any).fastPut).toHaveBeenCalledTimes(1);
        done();
      });
    });

    describe('ssh2.Client.exec() once with', () => {
      const testExec = (mountPath: string, done: TestCallback) => {
        init(fakeEvent, null, () => {
          expect(spyOnSSHClientExec).toHaveBeenCalledWith(
            'sudo sh ' + scriptCreateMount + ' ' +
               '"' + fakeVolumes.map(volume => volume.Device).join(' ') + '"' + ' ' +
               '"' + mountPath + '"',
            jasmine.any(Function)
          );
          expect(spyOnSSHClientExec).toHaveBeenCalledTimes(1);
          done();
        });
      };
      it('correct parameters', (done: TestCallback) => {
        testExec(fakeMountPath, done);
      });
      it('default parameters, if parameters are not set', (done: TestCallback) => {
        delete process.env[envNames.mountPath];
        testExec(defaults.mountPath, done);
      });
    });

    it('ssh2.ClientChannel.on() with correct parameters', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect((spyOnSSHClientChannel as any).on).toHaveBeenCalledWith('close', jasmine.any(Function));
        expect((spyOnSSHClientChannel as any).on).toHaveBeenCalledWith('data', jasmine.any(Function));
        expect((spyOnSSHClientChannel as any).on).toHaveBeenCalledTimes(2);
        done();
      });
    });

    // it('ssh2.ClientChannel.on("data") callback with correct parameters', (done: TestCallback) => {
    //   (spyOnSSHClientChannel as any).on.
    //   init(fakeEvent, null, () => {
    //     expect((spyOnSSHClientChannel as any).on).toHaveBeenCalledWith('close', jasmine.any(Function));
    //     expect((spyOnSSHClientChannel as any).on).toHaveBeenCalledWith('data', jasmine.any(Function));
    //     expect((spyOnSSHClientChannel as any).on).toHaveBeenCalledTimes(2);
    //     done();
    //   });
    // });

    it('ssh2.ClientChannel.stderr.on("data") once with correct parameters', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect((spyOnSSHClientChannel as any).stderr.on).toHaveBeenCalledWith('data', jasmine.any(Function));
        expect((spyOnSSHClientChannel as any).stderr.on).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('ssh2.Client.end() once', (done: TestCallback) => {
      init(fakeEvent, null, () => {
        expect(spyOnSSHClientEnd).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  describe('stops execution and calls callback with an error if', () => {

    const testError = (source: string, spyOnCall: jasmine.Spy,
                     spyOnNextCall: jasmine.Spy, done: TestCallback) => {
      if (source) {
        spyOnCall.and.returnValue({
          promise: () => Promise.reject(Error(source)),
        });
      }
      init(fakeEvent, null, (err: Error) => {
        log.error(err.message);
        log.debug(err.stack);

        if (spyOnCall) {
          expect(spyOnCall).toHaveBeenCalled();
        }
        expect(err).toBeTruthy();
        if (spyOnNextCall) {
          expect(spyOnNextCall).not.toHaveBeenCalled();
        }
        done();
      });
    };

    describe('event', () => {
      afterEach((done: TestCallback) => {
        testError(null, null, spyOnDescribeInstances, done);
      });

      it('is null', () => {
        fakeEvent = null;
      });

      it('is undefined', () => {
        fakeEvent = undefined;
      });

      describe('detail', () => {
        it('is null', () => {
          fakeEvent.detail = null;
        });

        it('is undefined', () => {
          delete fakeEvent.detail;
        });
      });
    });

    it('EC2.describeInstances() produces an error', (done: TestCallback) => {
      testError('EC2.describeInstances()', spyOnDescribeInstances, spyOnDescribeVolumes, done);
    });

    it('instance reservation has ended', (done: TestCallback) => {
      spyOnDescribeInstances.and.returnValue(fakeRequest({
          Reservations: [],
        }));
      testError(null, spyOnDescribeInstances, spyOnDescribeVolumes, done);
    });

    describe('SSH key name', () => {
      afterEach((done: TestCallback) => {
        testError(null, spyOnDescribeInstances, spyOnDescribeVolumes, done);
      });

      const testInstanceKey = () => {
        it('missing', () => {
          delete fakeInstance.Reservations[0].Instances[0].KeyName;
        });

        it('incorrect', () => {
          fakeInstance.Reservations[0].Instances[0].KeyName = fakeSSHKeyName + '-incorrect';
        });
      };

      describe('is missing from the environment, and the instance key is', () => {
        beforeEach(() => {
          delete process.env[envNames.sshKeyName];
        });

        testInstanceKey();
        it('correct', () => {});
      });

      describe('is provided by the environment, but the instance key is', () => {
        testInstanceKey();
      });
    });

    it('EC2.describeVolumes() produces an error', (done: TestCallback) => {
      testError('EC2.describeVolumes()', spyOnDescribeVolumes, spyOnCreateVolume, done);
    });

    it('volume(s) already exist', (done: TestCallback) => {
      spyOnDescribeVolumes.and.returnValue(fakeRequest({
        Volumes: [{
          Attachments: [{
            Device: '/dev/sdf',
          }],
        }],
      }));
      testError(null, spyOnDescribeVolumes, spyOnCreateVolume, done);
    });

    it('EC2.createVolume() produces an error', (done: TestCallback) => {
      testError('EC2.createVolume()', spyOnCreateVolume, spyOnWaitFor, done);
    });

    it('EC2.waitFor() produces an error', (done: TestCallback) => {
      testError('EC2.waitFor()', spyOnWaitFor, spyOnAttachVolume, done);
    });

    it('EC2.attachVolume() produces an error', (done: TestCallback) => {
      testError('EC2.attachVolume()', spyOnAttachVolume, spyOnModifyInstanceAttribute, done);
    });

    it('EC2.modifyInstanceAttribute() produces an error', (done: TestCallback) => {
      testError('EC2.modifyInstanceAttribute()', spyOnModifyInstanceAttribute, spyOnS3GetObject, done);
    });

    it('S3.getObject() produces an error', (done: TestCallback) => {
      testError('S3.getObject()', spyOnS3GetObject, spyOnSSHClientExec, done);
    });

    it('ssh2.Client.connect() has exceeded the number of retries', (done: TestCallback) => {
      spyOnSSHClientConnect.and.callFake(function() {
        this.error(Error('SSH_connect'));
      });
      spyOnSSHClientEvent.and.callFake(function(event: string, callback: (data: any) => void) {
        if (event === 'ready') {
          this.ready = callback;
        } else if (event === 'error') {
          this.error = callback;
        }
        return this;
      });
      testError(null, spyOnSSHClientConnect, spyOnSSHClientSftp, done);
    });

    it('ssh2.Client.sftp() produces an error', (done: TestCallback) => {
      spyOnSSHClientSftp.and.callFake((callback: Callback) => {
        callback(Error('ssh2.Client.sftp()'), spyOnSSHSftpWrapper);
      });
      testError(null, spyOnSSHClientSftp, (spyOnSSHSftpWrapper as any).fastPut, done);
    });

    it('ssh2.SFTPWrapper.fastPut() produces an error', (done: TestCallback) => {
      (spyOnSSHSftpWrapper as any).fastPut.and.callFake(
        (localPath: string, remotePath: string, callback: Callback) =>
          callback(Error('ssh2.SFTPWrapper.fastPut()')));
      testError(null, (spyOnSSHSftpWrapper as any).fastPut, spyOnSSHClientExec, done);
    });

    it('ssh2.Client.exec() produces an error', (done: TestCallback) => {
      spyOnSSHClientExec.and.callFake((command: string, callback: Callback) => {
        callback(Error('ssh2.Client.exec()'));
      });
      testError(null, spyOnSSHClientExec, (spyOnSSHClientChannel as any).on, () => {
        expect((spyOnSSHClientChannel as any).on).not.toHaveBeenCalled();
        done();
      });
    });

    it('ssh2.ClientChannel.on("close") event returns a non-zero exit code', (done: TestCallback) => {
      (spyOnSSHClientChannel as any).on
        .and.callFake(function(event: string, callback: (data: number) => any) {
          if (event === 'close') {
            callback(1);
          }
          return this;
        });
      testError(null, (spyOnSSHClientChannel as any).on, null, done);
    });
  });

  describe('does not', () => {
    it('call ec2.deleteVolume() when called with correct parameters and ec2.attachVolume() was successful',
        (done: TestCallback) => {
      init(fakeEvent, null, (err: Error) => {
        expect(spyOnDeleteVolume).not.toHaveBeenCalled();
        done();
      });
    });

    it('produce an error when called with correct parameters and AWS does not return errors',
        (done: TestCallback) => {
      init(fakeEvent, null, (err: Error) => {
        expect(err).toBeFalsy();
        done();
      });
    });
  });
});