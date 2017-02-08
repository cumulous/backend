import * as requestPromise from 'request-promise';

import { CloudFormationRequest, sendCloudFormationResponse } from './cloudformation';
import { testError} from './fixtures/support';
import { Callback, Dict } from './types';

describe('sendCloudFormationResponse()', () => {
  const fakeRequestType = 'Update';
  const fakeResponseUri = 'https://pre-signed-S3-url-for-fake-response';
  const fakeStackId = 'fake-stack';
  const fakeRequestId = 'fake-request-abcd-1234';
  const fakeResponseType = 'fake-response-type';
  const fakeLogicalResourceId = 'fake-logical-resource-id';
  const fakePhysicalResourceId = 'fake-physical-resource-id-1234-abcd';
  const fakeResponseStatus = 'FAILED';
  const fakeResponseReason = 'Fake reason';

  let fakeRequest: CloudFormationRequest;
  let fakeResponseData: Dict<any>;

  let spyOnRequestPromisePost: jasmine.Spy;

  beforeEach(() => {
    fakeResponseData = {
      fake: 'data',
    };
    fakeRequest = {
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

    spyOnRequestPromisePost = spyOn(requestPromise, 'post')
      .and.returnValue(Promise.resolve());
  });

  describe('calls', () => {
    it('requestPromise.post() once with correct parameters', (done: Callback) => {
      sendCloudFormationResponse(fakeRequest, null, () => {
        expect(spyOnRequestPromisePost).toHaveBeenCalledWith({
          uri: fakeResponseUri,
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
        expect(spyOnRequestPromisePost).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('callback with an error if requestPromise.post() returns an error', (done: Callback) => {
      spyOnRequestPromisePost.and.returnValue(Promise.reject('requestPromise.post()'));
      testError(sendCloudFormationResponse, fakeRequest, done);
    });
  });

  it('does not produce an error when called with correct parameters ' +
     'and requestPromise.post() does not return an error', (done: Callback) => {
    testError(sendCloudFormationResponse, fakeRequest, done, false);
  });
});