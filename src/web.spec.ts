import * as stringify from 'json-stable-stringify';

import * as aws from './aws';
import { cloudFront, s3 } from './aws';
import { Callback, Dict } from './types';
import { fakeResolve, fakeReject, testArray, testError } from './fixtures/support';
import * as web from './web';
import { getIPSetDescriptors, IPSetDescriptor } from './web';

const fakePhysicalResourceId = 'fake-physical-resource-id-1234-abcd';
const fakeRequestId = 'fake-request-1234';
const fakeIdentityComment = 'OAI for fake.example.org';
const fakeIdentityId = 'fake-oai-abcd';
const fakeETag = 'fake-ETag-1234';
const fakeCanonicalUserId = 'fake-user-1234-abcd';
const fakeIdBucket = 'fake-id-bucket';
const fakeIdPath = '/fake/Id';

describe('getIPSetDescriptors()', () => {
  const fakeIpRange1 = '192.68.0.0/16';
  const fakeIpRange2 = '10.0.0.0/8';

  let fakeEvent: () => any;
  let fakeDescriptors: IPSetDescriptor[];

  let spyOnSendCloudFormationResponse: jasmine.Spy;

  beforeEach(() => {
    fakeEvent = () => ({
      PhysicalResourceId: fakePhysicalResourceId,
      ResourceProperties: {
        CIDRs: [fakeIpRange1, fakeIpRange2],
      },
    });
    fakeDescriptors = [{
      Type: 'IPV4',
      Value: fakeIpRange1,
    },{
      Type: 'IPV4',
      Value: fakeIpRange2,
    }];

    spyOnSendCloudFormationResponse = spyOn(aws, 'sendCloudFormationResponse')
      .and.callFake((event: any, context: any, callback: Callback) => callback());
  });

  describe('calls', () => {
    describe('aws.sendCloudFormationResponse() once with', () => {
      it('correct result if valid CIDRs were supplied', (done: Callback) => {
        const callback = () => {
          expect(spyOnSendCloudFormationResponse).toHaveBeenCalledWith(Object.assign(fakeEvent(), {
            Status: 'SUCCESS',
            Data: {
              Descriptors: fakeDescriptors,
            },
          }), null, callback);
          expect(spyOnSendCloudFormationResponse).toHaveBeenCalledTimes(1);
          done();
        };
        getIPSetDescriptors(fakeEvent(), null, callback);
      });
      describe('an error response if', () => {
        let event: any;
        let fakeResponse: any;
        beforeEach(() => {
          event = fakeEvent();
          fakeResponse = Object.assign(fakeEvent(), {
            Status: 'FAILED',
            Reason: jasmine.any(String),
          });
        });
        afterEach((done: Callback) => {
          fakeResponse.ResourceProperties = event.ResourceProperties;
          const callback = () => {
            expect(spyOnSendCloudFormationResponse).toHaveBeenCalledWith(fakeResponse, null, callback);
            expect(spyOnSendCloudFormationResponse).toHaveBeenCalledTimes(1);
            done();
          };
          getIPSetDescriptors(event, null, callback);
        });
        describe('ResourceProperties is', () => {
          it('undefined', () => event.ResourceProperties = undefined);
          it('null', () => event.ResourceProperties = null);
        });
        describe('ResourceProperties.CIDRs is', () => {
          it('undefined', () => event.ResourceProperties.CIDRs = undefined);
          it('null', () => event.ResourceProperties.CIDRs = null);
          it('empty', () => event.ResourceProperties.CIDRs = []);
          it('not an array', () => event.ResourceProperties.CIDRs = { fake: 'value' });
        });
      });
    });
  });
});

const testMethod = (
      method: string,
      service: any,
      serviceMethod: string,
      fakeEvent: () => any,
      fakeRequest: () => any,
      fakeResponse?: () => any,
      expectedResponse?: any
    ) => {

  describe(`web.${method}() calls`, () => {
    let spyOnServiceMethod: jasmine.Spy;

    beforeEach(() => {
      spyOnServiceMethod = spyOn(service, serviceMethod)
        .and.returnValue(fakeResolve(fakeResponse ? fakeResponse() : undefined));
    });

    it(`${service}.${serviceMethod}() once with correct parameters`, (done: Callback) => {
      (web as any)[method](fakeEvent(), null, () => {
        expect(spyOnServiceMethod).toHaveBeenCalledWith(fakeRequest());
        expect(spyOnServiceMethod).toHaveBeenCalledTimes(1);
        done();
      });
    });

    describe('callback', () => {
      describe('with', () => {
        describe('an error if', () => {
          let event: any;
          beforeEach(() => event = fakeEvent());
          afterEach((done: Callback) => {
            testError((web as any)[method], event, done);
          });
          describe(`${service}.${serviceMethod}() returns`, () => {
            it('an error', () => {
              spyOnServiceMethod.and.returnValue(fakeReject(`${service}.${serviceMethod}()`));
            });
            if (fakeResponse) {
              it('empty data', () => {
                spyOnServiceMethod.and.returnValue(fakeResolve());
              });
            }
          });
          if (typeof fakeEvent() !== 'string') {
            describe('event is', () => {
              it('undefined', () => event = undefined);
              it('null', () => event = null);
            });
            if (fakeEvent().ResourceProperties) {
              describe('event.ResourceProperties is', () => {
                it('undefined', () => event.ResourceProperties = undefined);
                it('null', () => event.ResourceProperties = null);
              });
            }
          }
        });
        if (fakeResponse) {
          it(`correct parameters when ${service}.${serviceMethod} returns a correct response`,
              (done: Callback) => {
            (web as any)[method](fakeEvent(), null, (err: Error, data: any) => {
              expect(data).toEqual(expectedResponse);
              done();
            });
          });
        }
      });

      it(`without an error when called with correct parameters
          and ${service}.${serviceMethod}() does not return an error`, (done: Callback) => {
        testError((web as any)[method], fakeEvent(), done, false);
      });
    });
  });
};

testMethod('createOriginAccessIdentity', cloudFront, 'createCloudFrontOriginAccessIdentity', () => ({
  RequestId: fakeRequestId,
  ResourceProperties: {
    Comment: fakeIdentityComment,
  },
}), () => ({
  CloudFrontOriginAccessIdentityConfig: {
    CallerReference: fakeRequestId,
    Comment: fakeIdentityComment,
  },
}), () => ({
  CloudFrontOriginAccessIdentity: {
    Id: fakeIdentityId,
    S3CanonicalUserId: fakeCanonicalUserId,
  },
  ETag: fakeETag,
}), {
  Id: fakeIdentityId,
  S3CanonicalUserId: fakeCanonicalUserId,
  ETag: fakeETag,
});

testMethod('deleteOriginAccessIdentity', cloudFront, 'deleteCloudFrontOriginAccessIdentity', () => ({
  Id: fakeIdentityId,
  ETag: fakeETag,
}), () => ({
  Id: fakeIdentityId,
  IfMatch: fakeETag,
}));

testMethod('storeOriginAccessIdentity', s3, 'putObject', () => ({
  Data: {
    Id: fakeIdentityId,
    S3CanonicalUserId: fakeCanonicalUserId,
    ETag: fakeETag,
  },
  ResourceProperties: {
    Bucket: fakeIdBucket,
    Path: fakeIdPath,
  },
}), () => ({
  Bucket: fakeIdBucket,
  Key: fakeIdPath,
  Body: stringify({
    Id: fakeIdentityId,
    ETag: fakeETag,
  }),
}));

testMethod('retrieveOriginAccessIdentity', s3, 'getObject', () => ({
  Bucket: fakeIdBucket,
  Path: fakeIdPath,
}), () => ({
  Bucket: fakeIdBucket,
  Key: fakeIdPath,
}), () => ({
  Body: Buffer.from(stringify({
    Id: fakeIdentityId,
    ETag: fakeETag,
  })),
}), {
  Id: fakeIdentityId,
  ETag: fakeETag,
});
