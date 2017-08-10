import * as crypto from 'crypto';
import * as request from 'request-promise-native';

import * as aws from './aws';
import { CloudFormationRequest, CloudFormationResponse,
         sendCloudFormationResponse, setupCustomResource,
         s3, listObjects, hashObjects, tagObjects,
         executeStateMachine, stepFunctions } from './aws';
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
}), fakeBody());

testS3Method('deleteS3Object', 'deleteObject', () => ({
  Bucket: fakeBucket,
  Path: fakePath,
}), () => ({
  Bucket: fakeBucket,
  Key: fakePath,
}));

describe('aws.listObjects()', () => {
  const fakeBucket = 'fake-bucket';
  const fakePrefix = 'fake-prefix/';

  const fakeRequest = () => ({
    Bucket: fakeBucket,
    Prefix: fakePrefix,
  });

  const testMethod = () =>
    listObjects(fakeRequest());

  const fakeContinuationToken = (index: number) =>
    'fake-continuation-token-' + index;

  const fakeObjects = (index: number) => [{
    Key: fakePrefix + 'fake-object-A-' + index,
    ETag: 'fake-etag-A-' + index,
  }, {
    Key: fakePrefix + 'fake-object-B-' + index,
    ETag: 'fake-etag-B-' + index,
  }];

  const fakeListResponse = (index: number, truncated = true) => Object.assign({
    Contents: fakeObjects(index),
  }, truncated ? {
    NextContinuationToken: fakeContinuationToken(index),
    IsTruncated: true,
  } : {
    IsTruncated: false,
  });

  let spyOnListObjects: jasmine.Spy;

  beforeEach(() => {
    spyOnListObjects = spyOn(s3, 'listObjectsV2')
      .and.returnValues(
        fakeResolve(fakeListResponse(1)),
        fakeResolve(fakeListResponse(2)),
        fakeResolve(fakeListResponse(3, false)),
      );
  });

  it('calls s3.listObjectsV2() multiple times with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnListObjects.calls.argsFor(0)).toEqual([{
        Bucket: fakeBucket,
        Prefix: fakePrefix,
      }]);
      expect(spyOnListObjects.calls.argsFor(1)).toEqual([{
        Bucket: fakeBucket,
        Prefix: fakePrefix,
        ContinuationToken: fakeContinuationToken(1),
      }]);
      expect(spyOnListObjects.calls.argsFor(2)).toEqual([{
        Bucket: fakeBucket,
        Prefix: fakePrefix,
        ContinuationToken: fakeContinuationToken(2),
      }]);
      expect(spyOnListObjects).toHaveBeenCalledTimes(3);
      done();
    });
  });

  it('resolves correct response', (done: Callback) => {
    testMethod().then(data => {
      expect(data).toEqual(fakeObjects(1).concat(fakeObjects(2)).concat(fakeObjects(3)));
      done();
    });
  });

  describe('responds immediately with an error if s3.listObjectsV2() produces the error', () => {
    const err = Error('s3.listObjectsV2()');
    let calls: number;
    afterEach((done: Callback) => {
      testMethod().catch(e => {
        expect(e).toEqual(err);
        expect(spyOnListObjects).toHaveBeenCalledTimes(calls);
        done();
      });
    });
    it('in the initial call', () => {
      spyOnListObjects.and.returnValues(
        fakeReject(err),
        fakeResolve(fakeListResponse(2)),
        fakeResolve(fakeListResponse(3, false)),
      );
      calls = 1;
    });
    it('in a subsequent call', () => {
      spyOnListObjects.and.returnValues(
        fakeResolve(fakeListResponse(1)),
        fakeReject(err),
        fakeResolve(fakeListResponse(3, false)),
      );
      calls = 2;
    });
    it('in the last call', () => {
      spyOnListObjects.and.returnValues(
        fakeResolve(fakeListResponse(1)),
        fakeResolve(fakeListResponse(2)),
        fakeReject(err),
      );
      calls = 3;
    });
  });
});

describe('aws.hashObjects()', () => {
  const fakeBucket = 'fake-bucket';
  const fakePrefix = 'fake-prefix/';

  const fakeKey = (index: number) =>
    fakePrefix + 'fake-object-' + index;

  const fakeETag = (index: number) =>
    'fake-etag-' + index;

  const fakeObject = (index: number) => ({
    Key: fakeKey(index),
    ETag: fakeETag(index),
  });

  const fakeObjects = () => [
    fakeObject(1),
    fakeObject(2),
  ];

  const fakeRequest = () => ({
    Bucket: fakeBucket,
    Prefix: fakePrefix,
  });

  const testMethod = (callback: Callback) =>
    hashObjects(fakeRequest(), null, callback);

  let spyOnListObjects: jasmine.Spy;

  beforeEach(() => {
    spyOnListObjects = spyOn(aws, 'listObjects')
      .and.returnValue(Promise.resolve((fakeObjects())));
  });

  it('calls aws.listObjects() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnListObjects).toHaveBeenCalledWith(fakeRequest());
      expect(spyOnListObjects).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback with correct parameters', (done: Callback) => {
    testMethod((err?: Error, data?: any) => {
      const hash = crypto.createHash('md5');
      hash.update(fakeKey(1));
      hash.update(fakeETag(1));
      hash.update(fakeKey(2));
      hash.update(fakeETag(2));
      expect(err).toBeFalsy();
      expect(data).toEqual(hash.digest('hex'));
      done();
    });
  });

  describe('returns immediately with an error if', () => {
    let err: any;
    let after: () => void;

    let spyOnCreateHash: jasmine.Spy;
    let spyOnUpdateHash: jasmine.Spy;
    let spyOnDigestHash: jasmine.Spy;

    beforeEach(() => {
      err = jasmine.any(Error);
      after = () => {};

      const hash = crypto.createHash('md5');
      spyOnCreateHash = spyOn(crypto, 'createHash')
        .and.returnValue(hash);
      spyOnUpdateHash = spyOn(hash, 'update')
        .and.callThrough();
      spyOnDigestHash = spyOn(hash, 'digest')
        .and.callThrough();
    });
    afterEach((done: Callback) => {
      testMethod(e => {
        expect(e).toEqual(err);
        after();
        done();
      });
    });
    it('aws.listObjects() responds with the error', () => {
      err = Error('aws.listObjects()');
      spyOnListObjects.and.returnValue(Promise.reject(err));
      after = () => {
        expect(spyOnCreateHash).not.toHaveBeenCalled();
      };
    });
    it('hash.update() throws an error', () => {
      err = Error('hash.update()');
      spyOnUpdateHash.and.throwError(err.message);
      after = () => {
        expect(spyOnDigestHash).not.toHaveBeenCalled();
      };
    });
    it('hash.digest() throws an error', () => {
      err = Error('hash.digest()');
      spyOnDigestHash.and.throwError(err.message);
    });
  });
});

describe('aws.tagObjects()', () => {
  const fakeBucket = 'fake-bucket';
  const fakePrefix = 'fake-prefix/';

  const fakeTagKey = (index: number) =>
    'fake-tag-key-' + index;

  const fakeTagValue = (index: number) =>
    'fake-tag-value-' + index;

  const fakeTag = (index: number) => ({
    Key: fakeTagKey(index),
    Value: fakeTagValue(index),
  });

  const fakeRequest = () => ({
    Bucket: fakeBucket,
    Prefix: fakePrefix,
    Tags: [
      fakeTag(1),
      fakeTag(2),
    ],
  });

  const testMethod = (callback: Callback) =>
    tagObjects(fakeRequest(), null, callback);

  const fakeKey = (index: number) =>
    fakePrefix + 'fake-object-' + index;

  const fakeObject = (index: number) => ({
    Key: fakeKey(index),
  });

  const fakeObjects = () => [
    fakeObject(1),
    fakeObject(2),
  ];

  let spyOnListObjects: jasmine.Spy;
  let spyOnPutObjectTagging: jasmine.Spy;

  beforeEach(() => {
    spyOnListObjects = spyOn(aws, 'listObjects')
      .and.returnValue(Promise.resolve((fakeObjects())));
    spyOnPutObjectTagging = spyOn(s3, 'putObjectTagging')
      .and.returnValue(fakeResolve());
  });

  it('calls aws.listObjects() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnListObjects).toHaveBeenCalledWith(fakeRequest());
      expect(spyOnListObjects).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls s3.putObjectTagging() for each object', (done: Callback) => {
    testMethod(() => {
      const fakeTagging = () => ({
        TagSet: [{
          Key: fakeTagKey(1),
          Value: fakeTagValue(1),
        }, {
          Key: fakeTagKey(2),
          Value: fakeTagValue(2),
        }],
      });
      expect(spyOnPutObjectTagging).toHaveBeenCalledWith({
        Bucket: fakeBucket,
        Key: fakeKey(1),
        Tagging: fakeTagging(),
      });
      expect(spyOnPutObjectTagging).toHaveBeenCalledWith({
        Bucket: fakeBucket,
        Key: fakeKey(2),
        Tagging: fakeTagging(),
      });
      expect(spyOnPutObjectTagging).toHaveBeenCalledTimes(2);
      done();
    });
  });

  it('calls callback with correct parameters', (done: Callback) => {
    testMethod((err?: Error, data?: any) => {
      expect(err).toBeFalsy();
      expect(data).toBeFalsy();
      done();
    });
  });

  describe('responds immediately with an error if', () => {
    let err: any;
    let after: () => void;
    beforeEach(() => {
      err = jasmine.any(Error);
      after = () => {};
    });
    afterEach((done: Callback) => {
      testMethod(e => {
        expect(e).toEqual(err);
        after();
        done();
      });
    });
    it('aws.listObjects() produces the error', () => {
      err = Error('aws.listObjects()');
      spyOnListObjects.and.returnValue(Promise.reject(err));
      after = () => {
        expect(spyOnPutObjectTagging).not.toHaveBeenCalled();
      };
    });
    it('s3.putObjectTagging() produces the error', () => {
      err = Error('s3.putObjectTagging()');
      spyOnPutObjectTagging.and.returnValues(fakeResolve(), fakeReject(err));
    });
  });
});
