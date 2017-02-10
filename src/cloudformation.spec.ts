import * as requestPromise from 'request-promise';

import { Request, Response, sendResponse } from './cloudformation';
import { testError} from './fixtures/support';
import { Callback, Dict } from './types';

describe('sendResponse()', () => {
  const fakeRequestType = 'Update';
  const fakeResponseUri = 'https://pre-signed-S3-url-for-fake-response';
  const fakeStackId = 'fake-stack';
  const fakeRequestId = 'fake-request-abcd-1234';
  const fakeResponseType = 'fake-response-type';
  const fakeLogicalResourceId = 'fake-logical-resource-id';
  const fakePhysicalResourceId = 'fake-physical-resource-id-1234-abcd';
  const fakeResponseStatus = 'FAILED';
  const fakeResponseReason = 'Fake reason';

  let fakeEvent: Request & Response;
  let fakeResponseData: Dict<any>;

  let spyOnRequestPromisePut: jasmine.Spy;

  beforeEach(() => {
    fakeResponseData = {
      fake: 'data',
    };
    fakeEvent = {
      RequestType: fakeRequestType,
      ResponseURL: fakeResponseUri,
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

    spyOnRequestPromisePut= spyOn(requestPromise, 'put')
      .and.returnValue(Promise.resolve());
  });

  describe('calls', () => {
    it('requestPromise.put() once with correct parameters', (done: Callback) => {
      sendResponse(fakeEvent, null, () => {
        expect(spyOnRequestPromisePut).toHaveBeenCalledWith(fakeResponseUri, {
          body: {
            Status: fakeResponseStatus,
            Reason: fakeResponseReason,
            PhysicalResourceId: fakePhysicalResourceId,
            StackId: fakeStackId,
            RequestId: fakeRequestId,
            LogicalResourceId: fakeLogicalResourceId,
            Data: fakeResponseData,
          },
        });
        expect(spyOnRequestPromisePut).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('callback with an error if requestPromise.put() returns an error', (done: Callback) => {
      spyOnRequestPromisePut.and.returnValue(Promise.reject('requestPromise.put()'));
      testError(sendResponse, fakeEvent, done);
    });
  });

  it('does not produce an error when called with correct parameters ' +
     'and requestPromise.put() does not return an error', (done: Callback) => {
    testError(sendResponse, fakeEvent, done, false);
  });
});