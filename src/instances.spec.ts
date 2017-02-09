import * as stringify from 'json-stable-stringify';
import { Client as SSHClient } from 'ssh2';

import { envNames } from './env';
import { ec2, s3, stepFunctions, defaults, volumeType, initScriptFile,
         init, describeInstance, checkSSHKeyName, calculateVolumeSizes,
         createVolumes, waitForVolumesAvailable, calculateVolumeDevices, attachVolumes,
         detachVolumes, deleteVolumes, deleteVolumesOnTermination,
         transferInitScript, executeInitScript } from './instances';
import * as states from './states';
import { log as log } from './log';
import { fakeResolve, fakeReject, testError, testArray } from './fixtures/support';
import { Callback } from './types';

if (!process.env['LOG_LEVEL']) {
  log.remove(log.transports.Console);
}

const statesDefinition = require('./instances-init.json');

const fakeInstanceId = 'i-abcd1234';
const fakeInstanceType = 'r4.2xlarge';
const fakeInstanceAddress = 'EC2-fake.compute-1.amazonaws.com';
const fakeAvailabilityZone = 'us-east-1a';
const fakeSSHKeyName = 'fake-ssh-key';
const fakeSSHKeyS3Bucket = 'fake-ssh-key-bucket';
const fakeSSHKeyS3Path = 'fake-ssh-key-path/key.pem';
const fakeSSHUser = 'fake-user';
const fakeMountPath = '/mnt/testmount';

let fakeEvent: any;
let fakeVolumeSizes: number[];
let fakeVolumeIds: string[];
let fakeVolumeDevices: string[];

beforeEach(() => {
  // numbers specific to fakeInstanceType
  fakeVolumeSizes = [133, 133];
  fakeVolumeIds = ['vol-abcd01', 'vol-abcd10'];
  fakeVolumeDevices = ['/dev/sdf', '/dev/sdg'];
});

describe('init()', () => {
  const fakeAccount = '1098765432';
  const fakeRegion = 'us-east-1';
  const fakeResourceSuffix = '-fakeSuffix';

  let spyOnExecuteStateMachine: jasmine.Spy;

  beforeEach(() => {
    fakeEvent = {
      detail: {
        'instance-id': fakeInstanceId,
        'state': 'running',
      },
    };

    process.env[envNames.AWSRegion] = fakeRegion;
    process.env[envNames.AWSAccount] = fakeAccount;

    spyOnExecuteStateMachine = spyOn(states, 'executeStateMachine')
      .and.callFake((event: any, context: any, callback: Callback) => callback());
  });

  it('calls states.executeStateMachine() with correct parameters', (done: Callback) => {
    init(fakeEvent, null, () => {
      expect(spyOnExecuteStateMachine).toHaveBeenCalledWith({
        logicalName: statesDefinition.Comment,
        input: fakeEvent,
      }, null, jasmine.any(Function));
      done();
    });
  });

  it('calls callback with an error if states.executeStateMachine() returns an error',
      (done: Callback) => {
    spyOnExecuteStateMachine.and.callFake((event: any, context: any, callback: Callback) =>
      callback(Error('states.executeStateMachine()')));
    testError(init, fakeEvent, done);
  });

  it('does not produce an error when called with correct parameters ' +
     'and StepFunctions.startExecution() does not return an error', (done: Callback) => {
    testError(init, fakeEvent, done, false);
  });
});

describe('describeInstance()', () => {
  let fakeInstance: any;

  let spyOnDescribeInstances: jasmine.Spy;

  beforeEach(() => {
    fakeInstance = {
      Reservations: [{
        Instances: [{
          InstanceId: fakeInstanceId,
        }],
      }],
    };

    spyOnDescribeInstances = spyOn(ec2, 'describeInstances')
      .and.returnValue(fakeResolve(fakeInstance));
  });

  it('calls EC2.describeInstances() with correct parameters', (done: Callback) => {
    describeInstance(fakeInstanceId, null, () => {
      expect(spyOnDescribeInstances).toHaveBeenCalledWith({
        InstanceIds: [ fakeInstanceId ],
      });
      done();
    });
  });

  describe('calls callback with an error if', () => {
    afterEach((done: Callback) => {
      testError(describeInstance, fakeInstanceId, done);
    });
    it('EC2.describeInstances() returns an error', () => {
      spyOnDescribeInstances.and.returnValue(
        fakeReject('EC2.describeInstances()'));
    });
    it('EC2.describeInstances() returns an empty list', () => {
      delete fakeInstance.Reservations[0];
    });
  });

  it('does not produce an error when called with correct parameters ' +
     'and EC2.describeInstances() returns non-empty list', (done: Callback) => {
    testError(describeInstance, fakeInstanceId, done, false);
  });
});

describe('checkSSHKeyName()', () => {
  beforeEach(() => {
    process.env[envNames.sshKeyName] = fakeSSHKeyName;
  });

  describe('calls callback with an error if SSH key name', () => {
    let sshKeyName: string;

    beforeEach(() => {
      sshKeyName = fakeSSHKeyName;
    });

    const testInstanceKey = () => {
      it('undefined', () => {
        sshKeyName = undefined;
      });

      it('null', () => {
        sshKeyName = null;
      });

      it('incorrect', () => {
        sshKeyName += '-incorrect';
      });
    };

    afterEach((done: Callback) => {
      testError(checkSSHKeyName, sshKeyName, done);
    });

    describe('is missing from the environment, and the instance key is', () => {
      beforeEach(() => {
        delete process.env[envNames.sshKeyName];
      });

      testInstanceKey();
      it('correct', () => null);
    });

    describe('is provided by the environment, but the instance key is', () => {
      testInstanceKey();
    });
  });

  it('does not produce an error when called with correct parameters',
      (done: Callback) => {
    testError(checkSSHKeyName, fakeSSHKeyName, done, false);
  });
});

describe('calculateVolumeSizes()', () => {
  it('correctly determines volume sizes when called with correct parameters',
      (done: Callback) => {
    calculateVolumeSizes(fakeInstanceType, null, (err: Error, volumeSizes: number[]) => {
      expect(volumeSizes).toEqual(fakeVolumeSizes);
      done();
    });
  });

  describe('calls callback with an error if instance type is', () => {
    let instanceType: string;

    afterEach((done: Callback) => {
      testError(calculateVolumeSizes, instanceType, done);
    });

    it('undefined', () => {
      instanceType = undefined;
    });
    it('null', () => {
      instanceType = null;
    });
    it('unrecognized', () => {
      instanceType = 't2.nano';
    });
  });

  it('does not produce an error when called with correct parameters',
      (done: Callback) => {
    testError(calculateVolumeSizes, fakeInstanceType, done, false);
  });
});

describe('createVolumes()', () => {
  let spyOnCreateVolume: jasmine.Spy;

  beforeEach(() => {
    fakeEvent = {
      volumeSizes: fakeVolumeSizes,
      Placement: {
        AvailabilityZone: fakeAvailabilityZone,
      }
    };

    spyOnCreateVolume = spyOn(ec2, 'createVolume')
      .and.returnValue(fakeResolve({}));
  });

  it('calls EC2.createVolume() with correct parameters', (done: Callback) => {
    createVolumes(fakeEvent, null, () => {
      expect(spyOnCreateVolume).toHaveBeenCalledWith({
        AvailabilityZone: fakeAvailabilityZone,
        Size: fakeVolumeSizes[0],
        VolumeType: volumeType,
      });
      expect(spyOnCreateVolume).toHaveBeenCalledTimes(fakeVolumeSizes.length);
      done();
    });
  });

  it('calls callback with an error if EC2.createVolume() returns an error', (done: Callback) => {
    spyOnCreateVolume.and.returnValue(
      fakeReject('EC2.createVolume()'));
    testError(createVolumes, fakeEvent, done);
  });

  describe('throws an error if', () => {
    testArray(createVolumes, () => fakeEvent, 'volumeSizes', false);
  });

  it('does not produce an error when called with correct parameters ' +
     'and EC2.createVolume() does not return an error', (done: Callback) => {
    testError(createVolumes, fakeEvent, done, false);
  });
});

describe('waitForVolumesAvailable()', () => {
  let spyOnWaitFor: jasmine.Spy;

  beforeEach(() => {
    spyOnWaitFor = spyOn(ec2, 'waitFor')
      .and.returnValue(fakeResolve());
  });

  it('calls EC2.waitFor() with correct parameters', (done: Callback) => {
    waitForVolumesAvailable(fakeVolumeIds, null, () => {
      expect(spyOnWaitFor).toHaveBeenCalledWith('volumeAvailable', {
        VolumeIds: fakeVolumeIds,
      });
      done();
    });
  });

  it('calls callback with an error if EC2.waitFor() returns an error',
      (done: Callback) => {
    spyOnWaitFor.and.returnValue(
      fakeReject('EC2.waitFor()'));
    testError(waitForVolumesAvailable, fakeVolumeIds, done);
  });

  it('does not produce an error when called with correct parameters ' +
     'and EC2.waitFor() does not return an error', (done: Callback) => {
    testError(waitForVolumesAvailable, fakeVolumeIds, done, false);
  });
});

describe('calculateVolumeDevices()', () => {
  it('correctly determines volume devices when called with correct parameters',
      (done: Callback) => {
    calculateVolumeDevices(fakeVolumeIds, null, (err: Error, volumeDevices: string[]) => {
      expect(volumeDevices).toEqual(fakeVolumeDevices);
      done();
    });
  });

  describe('calls callback with an error if volume count is', () => {
    testArray(calculateVolumeDevices, () => fakeVolumeIds, 'volumeIds', false);
  });

  it('does not produce an error when called with correct parameters',
      (done: Callback) => {
    testError(calculateVolumeDevices, fakeVolumeIds, done, false);
  });
});

describe('attachVolumes()', () => {
  let spyOnAttachVolume: jasmine.Spy;

  beforeEach(() => {
    fakeEvent = {
      volumeIds: fakeVolumeIds,
      volumeDevices: fakeVolumeDevices,
      InstanceId: fakeInstanceId,
    };
    spyOnAttachVolume = spyOn(ec2, 'attachVolume')
      .and.returnValue(fakeResolve());
  });

  it('calls EC2.attachVolume() with correct parameters, once for each volume', (done: Callback) => {
    attachVolumes(fakeEvent, null, () => {
      for (const v in fakeVolumeIds) {
        expect(spyOnAttachVolume).toHaveBeenCalledWith({
          VolumeId: fakeVolumeIds[v],
          Device: fakeVolumeDevices[v],
          InstanceId: fakeInstanceId,
        });
      }
      expect(spyOnAttachVolume).toHaveBeenCalledTimes(fakeVolumeIds.length);
      done();
    });
  });

  it('calls callback with error if EC2.attachVolume() reports an error', (done: Callback) => {
    spyOnAttachVolume.and.returnValue(
      fakeReject('EC2.attachVolume()'));
    testError(attachVolumes, fakeEvent, done);
  });

  describe('throws an error if', () => {
    testArray(attachVolumes, () => fakeEvent, 'volumeIds', false);
    testArray(attachVolumes, () => fakeEvent, 'volumeDevices', false);

    it('event.volumeIds.length != event.volumeDevices.length', () => {
      fakeEvent.volumeDevices = [ fakeVolumeDevices[0] ];
      testError(attachVolumes, fakeEvent, null);
    });
  });

  it('does not produce an error when called with correct parameters ' +
     'and EC2.attachVolume() does not return an error', (done: Callback) => {
    testError(attachVolumes, fakeEvent, done, false);
  });
});

const testVolumeCleanup = (lambda: Function, lambdaName: string, spyOnFunctionName: string) => {
  describe(lambdaName + '()', () => {
    let spy: jasmine.Spy;

    beforeEach(() => {
      spy = spyOn(ec2, spyOnFunctionName)
        .and.returnValue(fakeResolve());
    });

    it('calls EC2.' + lambdaName + '() with correct parameters', (done: Callback) => {
      lambda(fakeVolumeIds, null, () => {
        fakeVolumeIds.map(volumeId => {
          expect(spy).toHaveBeenCalledWith({
            VolumeId: volumeId,
          });
        });
        expect(spy).toHaveBeenCalledTimes(fakeVolumeIds.length);
        done();
      });
    });

    describe('throws an error if', () => {
      testArray(lambda, () => fakeVolumeIds, 'volumeIds', false);
    });

    describe('does not produce an error when called with correct parameters ' +
             'and EC2.' + lambdaName + '()', () => {
      afterEach((done: Callback) => {
        testError(lambda, fakeVolumeIds, done, false);
      });
      it('does not return an error', () => {});
      it('returns an error', () => {
        spy.and.returnValue(
          fakeReject('EC2.' + lambdaName + '()'));
      });
    });
  });
};

testVolumeCleanup(detachVolumes, 'detachVolumes', 'detachVolume');
testVolumeCleanup(deleteVolumes, 'deleteVolumes', 'deleteVolume');

describe('deleteVolumesOnTermination()', () => {
  let spyOnModifyInstanceAttribute: jasmine.Spy;

  beforeEach(() => {
    fakeEvent = {
      volumeDevices: fakeVolumeDevices,
      InstanceId: fakeInstanceId,
    };

    spyOnModifyInstanceAttribute = spyOn(ec2, 'modifyInstanceAttribute')
      .and.returnValue(fakeResolve());
  });

  it('calls EC2.modifyInstanceAttribute() with correct parameters', (done: Callback) => {
    deleteVolumesOnTermination(fakeEvent, null, (err) => {
      expect(spyOnModifyInstanceAttribute).toHaveBeenCalledWith({
        InstanceId: fakeInstanceId,
        BlockDeviceMappings: fakeVolumeDevices.map(volumeDevice => ({
          DeviceName: volumeDevice,
          Ebs: {
            DeleteOnTermination: true,
          },
        })),
      });
      done();
    });
  });

  it('calls callback with an error if EC2.modifyInstanceAttribute() returns an error',
      (done: Callback) => {
    spyOnModifyInstanceAttribute.and.returnValue(
      fakeReject('EC2.modifyInstanceAttribute()'));
    testError(deleteVolumesOnTermination, fakeEvent, done);
  });

  describe('throws an error if', () => {
    testArray(deleteVolumesOnTermination, () => fakeEvent, 'volumeDevices', false);
  });

  it('does not produce an error when called with correct parameters', (done: Callback) => {
    testError(deleteVolumesOnTermination, fakeEvent, done, false);
  });
});

describe('', () => {
  let fakeSSHKey: any;

  let spyOnGetSSHKey: jasmine.Spy;
  let spyOnSSHClientEvent: jasmine.Spy;
  let spyOnSSHClientConnect: jasmine.Spy;
  let spyOnSSHClientEnd: jasmine.Spy;

  beforeEach(() => {
    fakeSSHKey = {
      Body: new Buffer(16),
    };

    process.env[envNames.sshKeyS3Bucket] = fakeSSHKeyS3Bucket;
    process.env[envNames.sshKeyS3Path] = fakeSSHKeyS3Path;
    process.env[envNames.sshUser] = fakeSSHUser;

    spyOnGetSSHKey = spyOn(s3, 'getObject')
      .and.returnValue(fakeResolve(fakeSSHKey));

    spyOnSSHClientEvent = spyOn(SSHClient.prototype, 'on')
      .and.callFake(function(event: 'ready', callback: (data: any) => void) {
        if (event === 'ready') {
          this.ready = callback;
        }
        return this;
      });

    spyOnSSHClientConnect = spyOn(SSHClient.prototype, 'connect')
      .and.callFake(function() { this.ready(); });

    spyOnSSHClientEnd = spyOn(SSHClient.prototype, 'end');
  });

  const testSSHRun = (lambda: Function) => {
    describe('calls', () => {
      it('S3.getObject() once with correct parameters', (done: Callback) => {
        lambda(fakeEvent, null, () => {
          expect(spyOnGetSSHKey).toHaveBeenCalledWith({
            Bucket: fakeSSHKeyS3Bucket,
            Key: fakeSSHKeyS3Path,
          });
          expect(spyOnGetSSHKey).toHaveBeenCalledTimes(1);
          done();
        });
      });
      it('ssh2.Client.on() with correct parameters', (done: Callback) => {
        lambda(fakeEvent, null, () => {
          expect(spyOnSSHClientEvent).toHaveBeenCalledWith('ready', jasmine.any(Function));
          expect(spyOnSSHClientEvent).toHaveBeenCalledWith('error', jasmine.any(Function));
          expect(spyOnSSHClientEvent).toHaveBeenCalledTimes(2);
          done();
        });
      });
      it('ssh2.Client.end() once', (done: Callback) => {
        lambda(fakeEvent, null, () => {
          expect(spyOnSSHClientEnd).toHaveBeenCalledTimes(1);
          done();
        });
      });

      describe('ssh2.Client.connect() once with correct parameters if SSH_USER is', () => {
        const testConnect = (user: string, done: Callback) => {
          lambda(fakeEvent, null, () => {
            expect(spyOnSSHClientConnect).toHaveBeenCalledWith({
              host: fakeInstanceAddress,
              username: user,
              privateKey: fakeSSHKey.Body,
            });
            expect(spyOnSSHClientConnect).toHaveBeenCalledTimes(1);
            done();
          });
        };
        it('set', (done: Callback) => {
          testConnect(fakeSSHUser, done);
        });
        it('not set', (done: Callback) => {
          delete process.env[envNames.sshUser];
          testConnect(defaults.sshUser, done);
        });
      });

      describe('callback with an error if', () => {
        afterEach((done: Callback) => {
          testError(lambda, fakeEvent, done);
        });

        it('S3.getObject() returns an error', () => {
          spyOnGetSSHKey.and.returnValue(
            fakeReject('S3.getObject()'));
        });
        it('ssh2.Client.connect() returns an error', () => {
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
        });
      });
    });

    it('does not produce an error when called with correct parameters', (done: Callback) => {
      testError(lambda, fakeEvent, done, false);
    });
  };

  describe('transferInitScript()', () => {
    let spyOnSSHClientSftp: jasmine.Spy;
    let spyOnSSHSftpWrapper: jasmine.Spy;

    beforeEach(() => {
      fakeEvent = fakeInstanceAddress;

      spyOnSSHClientSftp = spyOn(SSHClient.prototype, 'sftp')
        .and.callFake((callback: Callback) => callback(null, spyOnSSHSftpWrapper));

      spyOnSSHSftpWrapper = jasmine.createSpyObj('spyOnSSHSftpWrapper', ['fastPut']);

      (spyOnSSHSftpWrapper as any).fastPut
        .and.callFake((localPath: string, remotePath: string, callback: Callback) => callback());
    });

    testSSHRun(transferInitScript);

    describe('calls', () => {
      it('ssh2.Client.sftp() once', (done: Callback) => {
        transferInitScript(fakeInstanceAddress, null, () => {
          expect(spyOnSSHClientSftp).toHaveBeenCalledTimes(1);
          done();
        });
      });
      it('ssh2.SFTPWrapper.fastPut() once with correct parameters', (done: Callback) => {
        transferInitScript(fakeInstanceAddress, null, () => {
          expect((spyOnSSHSftpWrapper as any).fastPut).toHaveBeenCalledWith(
            initScriptFile, initScriptFile, jasmine.any(Function));
          expect((spyOnSSHSftpWrapper as any).fastPut).toHaveBeenCalledTimes(1);
          done();
        });
      });

      describe('callback with an error if', () => {
        afterEach((done: Callback) => {
          testError(transferInitScript, fakeInstanceAddress, done);
        });
        it('ssh2.Client.sftp() returns an error', () => {
          spyOnSSHClientSftp.and.callFake((callback: Callback) =>
            callback(Error('ssh2.Client.sftp()')));
        });
        it('ssh2.SFTPWrapper.fastPut() returns an error', () => {
          (spyOnSSHSftpWrapper as any).fastPut
            .and.callFake((localPath: string, remotePath: string, callback: Callback) =>
              callback(Error('ssh2.SFTPWrapper.fastPut()')));
        });
      });
    });
  });

  describe('executeInitScript()', () => {
    let spyOnSSHClientExec: jasmine.Spy;
    let spyOnSSHClientChannel: jasmine.Spy;

    beforeEach(() => {
      fakeEvent = {
        PublicDnsName: fakeInstanceAddress,
        volumeDevices: fakeVolumeDevices,
      };

      process.env[envNames.mountPath] = fakeMountPath;

      spyOnSSHClientExec = spyOn(SSHClient.prototype, 'exec')
        .and.callFake((command: string, callback: Callback) =>
          callback(null, spyOnSSHClientChannel));

      spyOnSSHClientChannel = jasmine.createSpyObj('spyOnSSHClientChannelOn', ['on']);
      (spyOnSSHClientChannel as any).on
        .and.callFake(function(event: string, callback: (data: any) => void) {
          if (event === 'close') {
            process.nextTick(callback, 0);
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
    });

    testSSHRun(executeInitScript);

    describe('calls', () => {
      describe('ssh2.Client.exec() once with', () => {
        const testExec = (mountPath: string, done: Callback) => {
          executeInitScript(fakeEvent, null, () => {
            expect(spyOnSSHClientExec).toHaveBeenCalledWith(
              'sudo sh ' + initScriptFile + ' ' +
                 '"' + fakeVolumeDevices.join(' ') + '"' + ' ' +
                 '"' + mountPath + '"',
              jasmine.any(Function)
            );
            expect(spyOnSSHClientExec).toHaveBeenCalledTimes(1);
            done();
          });
        };
        it('correct parameters', (done: Callback) => {
          testExec(fakeMountPath, done);
        });
        it('default parameters, if parameters are not set', (done: Callback) => {
          delete process.env[envNames.mountPath];
          testExec(defaults.mountPath, done);
        });
      });

      it('ssh2.ClientChannel.on() with correct parameters', (done: Callback) => {
        executeInitScript(fakeEvent, null, () => {
          expect((spyOnSSHClientChannel as any).on).toHaveBeenCalledWith('close', jasmine.any(Function));
          expect((spyOnSSHClientChannel as any).on).toHaveBeenCalledWith('data', jasmine.any(Function));
          expect((spyOnSSHClientChannel as any).on).toHaveBeenCalledTimes(2);
          done();
        });
      });

      it('ssh2.ClientChannel.stderr.on("data") once with correct parameters', (done: Callback) => {
        executeInitScript(fakeEvent, null, () => {
          expect((spyOnSSHClientChannel as any).stderr.on).toHaveBeenCalledWith('data', jasmine.any(Function));
          expect((spyOnSSHClientChannel as any).stderr.on).toHaveBeenCalledTimes(1);
          done();
        });
      });

      it('ssh2.Client.end() once', (done: Callback) => {
        executeInitScript(fakeEvent, null, () => {
          expect(spyOnSSHClientEnd).toHaveBeenCalledTimes(1);
          done();
        });
      });

      describe('callback with an error if', () => {
        afterEach((done: Callback) => {
          testError(executeInitScript, fakeEvent, done);
        });
        it('ssh2.Client.exec() produces an error', () => {
          spyOnSSHClientExec.and.callFake((command: string, callback: Callback) => {
            callback(Error('ssh2.Client.exec()'));
          });
        });
        it('ssh2.ClientChannel.on("close") event returns a non-zero exit code', () => {
          (spyOnSSHClientChannel as any).on
            .and.callFake(function(event: string, callback: (data: number) => any) {
              if (event === 'close') {
                callback(1);
              }
              return this;
            });
        });
      });
    });
  });
});