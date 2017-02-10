import * as https from 'https';

import { Request, Response, sendResponse } from './cloudformation';
import { testError} from './fixtures/support';
import * as stringify from 'json-stable-stringify';
import { Callback, Dict } from './types';

describe('sendResponse()', () => {
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

  let fakeEvent: Request & Response;
  let fakeResponseData: Dict<any>;
  let fakeResponse: (responseId: string) => string;

  let spyOnHttpsRequest: jasmine.Spy;
  let spyOnHttpsRequestConstructor: jasmine.Spy;

  beforeEach(() => {
    fakeResponseData = {
      fake: 'data',
    };
    fakeEvent = {
      RequestType: fakeRequestType,
      ResponseURL: 'https://' + fakeResponseHostname + fakeResponsePath,
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
    fakeResponse = (resourceId: string) => stringify({
      Status: fakeResponseStatus,
      Reason: fakeResponseReason,
      PhysicalResourceId: resourceId,
      StackId: fakeStackId,
      RequestId: fakeRequestId,
      LogicalResourceId: fakeLogicalResourceId,
      Data: fakeResponseData,
    });

    spyOnHttpsRequest = jasmine.createSpyObj('spyOnHttpsRequest', ['on', 'end']);
    (spyOnHttpsRequest as any).end
      .and.callFake((response: string, encoding: string, callback: Callback) => callback());
    spyOnHttpsRequestConstructor = spyOn(https, 'request')
      .and.returnValue(spyOnHttpsRequest);
  });

  describe('calls', () => {
    it('https.request() once with correct parameters', (done: Callback) => {
      const callback = () => {
        expect(spyOnHttpsRequestConstructor).toHaveBeenCalledWith({
          hostname: fakeResponseHostname,
          path: fakeResponsePath,
          method: 'PUT',
          headers: {
            'content-length': fakeResponse(fakePhysicalResourceId).length,
          }
        });
        expect(spyOnHttpsRequestConstructor).toHaveBeenCalledTimes(1);
        done();
      };
      sendResponse(fakeEvent, null, callback);
    });

    describe('https.request().end() once with correct parameters when PhysicalResourceId is', () => {
      it('defined', (done: Callback) => {
        checkPut(fakePhysicalResourceId, done);
      });
      it('undefined', (done: Callback) => {
        delete fakeEvent.PhysicalResourceId;
        checkPut(fakeLogicalResourceId, done);
      });

      function checkPut(resourceId: any, done: Callback) {
        const callback = () => {
          expect((spyOnHttpsRequest as any).end).toHaveBeenCalledWith(
            fakeResponse(resourceId), 'utf8', callback);
          expect((spyOnHttpsRequest as any).end).toHaveBeenCalledTimes(1);
          done();
        };
        sendResponse(fakeEvent, null, callback);
      };
    });

    it('https.request().on() with correct parameters', (done: Callback) => {
      const callback = () => {
        expect((spyOnHttpsRequest as any).on).toHaveBeenCalledWith('error', callback);
        expect((spyOnHttpsRequest as any).on).toHaveBeenCalledTimes(1);
        done();
      };
      sendResponse(fakeEvent, null, callback);
    });
  });
});