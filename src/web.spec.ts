import * as stringify from 'json-stable-stringify';

import { cloudFront, s3 } from './aws';
import { envNames } from './env';
import { Callback } from './types';
import { fakeResolve, fakeReject, testError } from './fixtures/support';
import * as web from './web';

const fakePhysicalResourceId = 'fake-physical-resource-id-1234-abcd';
const fakeResourceId = 'fake-request-1234';
const fakeIdentityComment = 'OAI for fake.example.org';
const fakeIdentityId = 'fake-oai-abcd';
const fakeETag = 'fake-ETag-1234';
const fakeCanonicalUserId = 'fake-user-1234-abcd';
const fakeIdBucket = 'fake-id-bucket';
const fakeIdPath = '/fake/Id';

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
  StackId: fakeResourceId,
  ResourceProperties: {
    Comment: fakeIdentityComment,
  },
}), () => ({
  CloudFrontOriginAccessIdentityConfig: {
    CallerReference: fakeResourceId,
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

testMethod('updateOriginAccessIdentity', cloudFront, 'updateCloudFrontOriginAccessIdentity', () => ({
  StackId: fakeResourceId,
  ResourceProperties: {
    Comment: fakeIdentityComment,
  },
  Data: {
    Id: fakeIdentityId,
    ETag: fakeETag,
  },
}), () => ({
  CloudFrontOriginAccessIdentityConfig: {
    CallerReference: fakeResourceId,
    Comment: fakeIdentityComment,
  },
  Id: fakeIdentityId,
  IfMatch: fakeETag,
}), () => ({
  CloudFrontOriginAccessIdentity: {
    Id: fakeIdentityId,
    S3CanonicalUserId: fakeCanonicalUserId,
  },
  ETag: `${fakeETag}-new`,
}), {
  Id: fakeIdentityId,
  S3CanonicalUserId: fakeCanonicalUserId,
  ETag: `${fakeETag}-new`,
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
