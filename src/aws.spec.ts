import * as aws from './aws';
import { CloudFormationRequest, CloudFormationResponse,
         sendCloudFormationResponse, deleteS3Object, executeStateMachine,
         s3, setupCustomResource, stepFunctions } from './aws';
import { envNames } from './env';
import * as helpers from './helpers';
import { fakeReject, fakeResolve, testError } from './fixtures/support';
import * as stringify from 'json-stable-stringify';
import { Callback, Dict } from './types';

describe('sendCloudFormationResponse()', () => {
  const fakeRequestType = 'Update';
  const fakeResponseHostname = 'fake-response-endpoint.s3.amazonaws.com';
  const fakeResponsePath = '/fake/path';
  const fakeStackId = 'fake-stack';
  const fakeRequestId = 'fake-request-abcd-1234';
  const fakeResponseType = 'fake-response-type';
  const fakeLogicalResourceId = 'fake-logical-resource-id';
  const fakePhysicalResourceId = 'fake-physical-resource-id-1234-abcd';
  const fakeResponseStatus = 'FAILED';
  const fakeResponseReason = 'Fake reason';

  let fakeResponseUrl: string;
  let fakeEvent: CloudFormationRequest & CloudFormationResponse;
  let fakeResponseData: Dict<any>;
  let fakeResponse: (responseId: string) => any;

  let spyOnHttpsRequest: jasmine.Spy;

  beforeEach(() => {
    fakeResponseUrl = 'https://' + fakeResponseHostname + fakeResponsePath,
    fakeResponseData = {
      fake: 'data',
    };
    fakeEvent = {
      RequestType: fakeRequestType,
      ResponseURL: fakeResponseUrl,
      StackId: fakeStackId,
      RequestId: fakeRequestId,
      ResourceType: fakeResponseType,
      LogicalResourceId: fakeLogicalResourceId,
      PhysicalResourceId: fakePhysicalResourceId,
      ResourceProperties: {},
      OldResourceProperties: {},
      Status: fakeResponseStatus,
      Reason: fakeResponseReason,
      Data: fakeResponseData,
    };
    fakeResponse = (resourceId: string) => ({
      Status: fakeResponseStatus,
      Reason: fakeResponseReason,
      PhysicalResourceId: resourceId,
      StackId: fakeStackId,
      RequestId: fakeRequestId,
      LogicalResourceId: fakeLogicalResourceId,
      Data: fakeResponseData,
    });

    spyOnHttpsRequest = spyOn(helpers, 'httpsRequest').and.callFake(
        (Url: string, method: string, headers: Dict<string>, body: any, callback: Callback) =>
      callback());
  });

  describe('calls helpers.httpsRequest() once with correct parameters when PhysicalResourceId is', () => {
    it('defined', (done: Callback) => {
      checkPut(fakePhysicalResourceId, done);
    });
    it('undefined', (done: Callback) => {
      delete fakeEvent.PhysicalResourceId;
      checkPut(fakeLogicalResourceId, done);
    });

    function checkPut(resourceId: any, done: Callback) {
      const callback = () => {
        expect(spyOnHttpsRequest).toHaveBeenCalledWith(
          'PUT', fakeResponseUrl, null, fakeResponse(resourceId), callback);
        expect(spyOnHttpsRequest).toHaveBeenCalledTimes(1);
        done();
      };
      sendCloudFormationResponse(fakeEvent, null, callback);
    };
  });
});

describe('executeStateMachine()', () => {
  const fakeStateMachine = 'arn:aws:states:::execution:FakeStateMachine';

  let fakeEvent: any;

  let spyOnStepFunctionsStartExecution: jasmine.Spy;

  beforeEach(() => {
    fakeEvent = {
      fake: 'event',
    };

    process.env[envNames.stateMachine] = fakeStateMachine;

    spyOnStepFunctionsStartExecution = spyOn(stepFunctions, 'startExecution')
      .and.returnValue(fakeResolve());
  });

  it('calls stepFunctions.startExecution() with correct parameters', (done: Callback) => {
    executeStateMachine(fakeEvent, null, () => {
      expect(spyOnStepFunctionsStartExecution).toHaveBeenCalledWith({
        stateMachineArn: fakeStateMachine,
        input: stringify(fakeEvent),
      });
      done();
    });
  });

  it('calls callback with an error if stepFunctions.startExecution() produces an error',
      (done: Callback) => {
    spyOnStepFunctionsStartExecution.and.returnValue(
      fakeReject('stepFunctions.startExecution()'));
    testError(executeStateMachine, fakeEvent, done);
  });

  it('does not produce an error when called with correct parameters ' +
     'and stepFunctions.startExecution() does not produce an error', (done: Callback) => {
    testError(executeStateMachine, fakeEvent, done, false);
  });
});

describe('setupCustomResource()', () => {
  const fakeStateMachine = 'arn:aws:states:::execution:FakeSetupResourceStateMachine';

  let fakeRequest: any;

  let spyOnExecuteStateMachine: jasmine.Spy;
  let spyOnSendCloudFormationResponse: jasmine.Spy;

  beforeEach(() => {
    fakeRequest = {
      RequestId: 'fake-request-abcd-1234',
      ResourceProperties: {
        StateMachine: fakeStateMachine,
      },
    };

    spyOnExecuteStateMachine = spyOn(aws, 'executeStateMachine')
      .and.callFake((event: any, context: any, callback: Callback) => callback());
    spyOnSendCloudFormationResponse = spyOn(aws, 'sendCloudFormationResponse')
      .and.callFake((event: any, context: any, callback: Callback) => callback());
  });

  describe('calls', () => {
    it('executeStateMachine() once with correct parameters', (done: Callback) => {
      setupCustomResource(fakeRequest, null, () => {
        expect(spyOnExecuteStateMachine).toHaveBeenCalledWith(fakeRequest, null, jasmine.any(Function));
        expect(spyOnExecuteStateMachine).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('sendCloudFormationResponse() once with an error if ' +
        'executeStateMachine() produces an error', (done: Callback) => {
      spyOnExecuteStateMachine.and.callFake((event: any, context: any, callback: Callback) =>
        callback(Error('executeStateMachine()')));
      setupCustomResource(fakeRequest, null, () => {
        expect(spyOnSendCloudFormationResponse).toHaveBeenCalledWith(
          Object.assign({
            Status: 'FAILED',
            Reason: jasmine.any(String),
          }, fakeRequest), null, jasmine.any(Function));
        expect(spyOnSendCloudFormationResponse).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('callback with an error if executeStateMachine() produces an error', (done: Callback) => {
      spyOnExecuteStateMachine.and.callFake((event: any, context: any, callback: Callback) =>
        callback(Error('executeStateMachine()')));
      setupCustomResource(fakeRequest, null, (err: Error) => {
        expect(err).toBeTruthy();
        done();
      });
    });
  });

  it('does not call callback without an error when called with correct parameters', (done: Callback) => {
    setupCustomResource(fakeRequest, null, (err: Error) => {
        expect(err).toBeFalsy();
        done();
      });
  });
});

describe('deleteS3Object()', () => {
  const fakeBucket = 'fake-bucket';
  const fakePath = 'fake/path';

  let fakeEvent: any;

  let spyOnS3DeleteObject: jasmine.Spy;

  beforeEach(() => {
    fakeEvent = {
      Bucket: fakeBucket,
      Path: fakePath,
    };

    spyOnS3DeleteObject = spyOn(s3, 'deleteObject')
      .and.returnValue(fakeResolve());
  });

  it('calls s3.deleteObject() with correct parameters', (done: Callback) => {
    deleteS3Object(fakeEvent, null, () => {
      expect(spyOnS3DeleteObject).toHaveBeenCalledWith({
        Bucket: fakeBucket,
        Key: fakePath,
      });
      done();
    });
  });

  describe('calls callback with an error if', () => {
    it('s3.deleteObject() produces an error', () => {
      spyOnS3DeleteObject.and.returnValue(fakeReject('s3.deleteObject()'));
    });

    describe('event is', () => {
      it('null', () => fakeEvent = null);
      it('undefined', () => fakeEvent = undefined);
    });

    afterEach((done: Callback) => {
      testError(deleteS3Object, fakeEvent, done);
    });
  });

  it('does not produce an error when called with correct parameters ' +
     'and s3.deleteObject() does not produce an error', (done: Callback) => {
    testError(deleteS3Object, fakeEvent, done, false);
  });
});