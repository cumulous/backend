import * as request from 'request-promise-native';

import * as aws from './aws';
import { CloudFormationRequest, CloudFormationResponse,
         sendCloudFormationResponse, deleteS3Object, executeStateMachine,
         s3, setupCustomResource, stepFunctions } from './aws';
import { envNames } from './env';

import { fakeReject, fakeResolve, testError } from './fixtures/support';
import * as stringify from 'json-stable-stringify';
import { Callback, Dict } from './types';

describe('sendCloudFormationResponse()', () => {
  const fakeRequestType = 'Update';
  const fakeResponseUrl = 'https://fake-response-endpoint.s3.amazonaws.com/fake/path';
  const fakeStackId = 'fake-stack';
  const fakeRequestId = 'fake-request-abcd-1234';
  const fakeResponseType = 'fake-response-type';
  const fakeLogicalResourceId = 'fake-logical-resource-id';
  const fakePhysicalResourceId = 'fake-physical-resource-id-1234-abcd';
  const fakeResponseStatus = 'FAILED';
  const fakeResponseReason = 'Fake reason';

  let fakeEvent: CloudFormationRequest & CloudFormationResponse;
  let fakeResponseData: Dict<any>;
  let fakeResponse: (responseId: string) => any;

  let spyOnPutRequest: jasmine.Spy;

  beforeEach(() => {
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

    spyOnPutRequest = spyOn(request, 'put')
      .and.returnValue(Promise.resolve());
  });

  describe('calls request.put() once with correct parameters when PhysicalResourceId is', () => {
    it('defined', (done: Callback) => {
      checkPut(fakePhysicalResourceId, done);
    });
    it('undefined', (done: Callback) => {
      delete fakeEvent.PhysicalResourceId;
      checkPut(fakeLogicalResourceId, done);
    });

    const checkPut = (resourceId: any, done: Callback) => {
      const callback = () => {
        expect(spyOnPutRequest).toHaveBeenCalledWith(fakeResponseUrl, {
          body: stringify(fakeResponse(resourceId)),
        });
        expect(spyOnPutRequest).toHaveBeenCalledTimes(1);
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

const testS3Method = (
      method: string,
      serviceMethod: string,
      fakeEvent: () => any,
      fakeRequest: () => any,
      fakeResponse?: () => any,
      expectedResponse?: any
    ) => {

  describe(`${method}()`, () => {
    let spyOnS3Method: jasmine.Spy;

    beforeEach(() => {
      spyOnS3Method = spyOn(s3, serviceMethod as any)
        .and.returnValue(fakeResolve(fakeResponse ? fakeResponse() : undefined));
    });

    it(`calls s3.${serviceMethod}() once with correct parameters`, (done: Callback) => {
      (aws as any)[method](fakeEvent(), null, () => {
        expect(spyOnS3Method).toHaveBeenCalledWith(fakeRequest());
        expect(spyOnS3Method).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it(`calls callback with correct parameters`, (done: Callback) => {
      (aws as any)[method](fakeEvent(), null, (err: Error, response: any) => {
        expect(err).toBeFalsy();
        expect(response).toEqual(expectedResponse);
        done();
      });
    });

    describe('calls callback with an error if', () => {
      let event: any;
      beforeEach(() => {
        event = fakeEvent();
      });

      it(`s3.${serviceMethod}() produces an error`, () => {
        spyOnS3Method.and.returnValue(fakeReject(`s3.${serviceMethod}()`));
      });

      describe('event is', () => {
        it('null', () => event = null);
        it('undefined', () => event = undefined);
      });

      afterEach((done: Callback) => {
        testError((aws as any)[method], event, done);
      });
    });
  });
};

const fakeBucket = 'fake-bucket';
const fakePath = 'fake/path';
const fakeBody = () => ({
  fake: 'body',
});

testS3Method('putS3Object', 'putObject', () => ({
  Bucket: fakeBucket,
  Path: fakePath,
  Body: fakeBody(),
}), () => ({
  Bucket: fakeBucket,
  Key: fakePath,
  Body: stringify(fakeBody()),
}));

testS3Method('getS3Object', 'getObject', () => ({
  Bucket: fakeBucket,
  Path: fakePath,
}), () => ({
  Bucket: fakeBucket,
  Key: fakePath,
}), () => ({
  Body: Buffer.from(stringify(fakeBody())),
}), stringify(fakeBody()));

testS3Method('deleteS3Object', 'deleteObject', () => ({
  Bucket: fakeBucket,
  Path: fakePath,
}), () => ({
  Bucket: fakeBucket,
  Key: fakePath,
}));
