import * as child_process from 'child_process';
import * as cloudFrontTypes from 'aws-sdk/clients/cloudfront';
import * as stringify from 'json-stable-stringify';

import * as apig from './apig';
import * as aws from './aws';
import { cloudFront, s3 } from './aws';
import { envNames } from './env';
import { Callback, Dict } from './types';
import { fakeResolve, fakeReject, testArray, testError } from './fixtures/support';
import * as web from './web';
import { createAndExportSigningKey, generateSignedCookies } from './web';

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

const fakeSigningKeyBucket = 'fake-secrets-bucket';
const fakeSigningKeyPath = 'fake/key.pem';
const fakeEncryptionKeyId = 'fake-encryption-key-1234';

describe('createAndExportSigningKey()', () => {

  const fakeKeySize = 2048;

  let fakeSigningKey: () => Buffer;
  let fakeSigningPubKey: () => Buffer;

  let spyOnExecSync: jasmine.Spy;
  let spyOnS3PutObject: jasmine.Spy;

  beforeEach(() => {
    fakeSigningKey = () => Buffer.from('FAKE RSA_KEY');
    fakeSigningPubKey = () => Buffer.from('FAKE PUBKEY');

    spyOnExecSync = spyOn(child_process, 'execSync')
      .and.returnValues(fakeSigningKey(), fakeSigningPubKey());
    spyOnS3PutObject = spyOn(s3, 'putObject')
      .and.returnValue(fakeResolve());
  });

  const testMethod = (callback: Callback) => {
    createAndExportSigningKey({
      Bucket: fakeSigningKeyBucket,
      Path: fakeSigningKeyPath,
      EncryptionKeyId: fakeEncryptionKeyId,
      Size: fakeKeySize,
    }, null, callback);
  };

  it('calls child_process.execSync() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnExecSync).toHaveBeenCalledWith(`openssl genrsa ${fakeKeySize}`);
      expect(spyOnExecSync).toHaveBeenCalledWith('openssl rsa -pubout', {input: fakeSigningKey()});
      expect(spyOnExecSync).toHaveBeenCalledTimes(2);
      done();
    });
  });

  it('calls s3.putObject() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnS3PutObject).toHaveBeenCalledWith({
        Bucket: fakeSigningKeyBucket,
        Key: fakeSigningKeyPath,
        Body: fakeSigningKey(),
        SSEKMSKeyId: fakeEncryptionKeyId,
        ServerSideEncryption: 'aws:kms',
      });
      expect(spyOnS3PutObject).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback with correct parameters', (done: Callback) => {
    testMethod((err: Error, pubkey: string) => {
      expect(err).toBeFalsy();
      expect(pubkey).toEqual(fakeSigningPubKey().toString());
      done();
    });
  });

  describe('immediately calls callback with an error if', () => {
    describe('event is', () => {
      let event: any;
      afterEach((done: Callback) => {
        createAndExportSigningKey(event, null, (err: Error) => {
          expect(err).toEqual(jasmine.any(Error));
          expect(spyOnExecSync).not.toHaveBeenCalled();
          done();
        });
      });
      it('undefined', () => event = undefined);
      it('null', () => event = null);
    });
    const testError = (last: Callback, done: Callback) => {
      testMethod((err: Error) => {
        expect(err).toEqual(jasmine.any(Error));
        last();
        done();
      });
    };
    describe('child_process.execSync() throws an error when', () => {
      it('generating the key', (done: Callback) => {
        spyOnExecSync.and.throwError('child_process.execSync()');
        testError(() => expect(spyOnS3PutObject).not.toHaveBeenCalled(), done);
      });
      it('extracting the public key', (done: Callback) => {
        let execCount = 1;
        spyOnExecSync.and.callFake(() => {
          if (execCount--) return fakeResolve(fakeSigningKey());
          else throw Error('child_process.execSync(): pubout');
        });
        testError(() => expect(spyOnExecSync).toHaveBeenCalledTimes(2), done);
      });
    });
    it('s3.putObject() produces an error', (done: Callback) => {
      spyOnS3PutObject.and.returnValue(fakeReject('s3.putObject()'));
      testError(() => expect(spyOnExecSync).toHaveBeenCalledTimes(1), done);
    });
    it('child_process.execSync() throws an error when ', (done: Callback) => {
      spyOnS3PutObject.and.returnValue(fakeReject('s3.putObject()'));
      testError(() => expect(spyOnExecSync).toHaveBeenCalledTimes(1), done);
    });
  });
});

describe('generateSignedCookies()', () => {
  const fakeDistributionId = 'distrib-1234';
  const fakeKeyPairId = 'fake-key-pair-abcd';
  const fakeWebDomain = 'example.org';
  const fakeExpiresAt = 1483228800;

  const fakeRequest = () => ({
    requestContext: {
      authorizer: {
        expiresAt: String(fakeExpiresAt),
      },
    },
  });
  const fakeSigningKey = () => Buffer.from('FAKE RSA_KEY');
  const fakeCookieParams = (): Dict<string> => ({
    'CloudFront-Policy': stringify({
      Statement: { fake: 'policy' },
    }),
    'CloudFront-Key-Pair-Id': '1234ABCD',
    'CloudFront-Signature': 'abcd1234',
  });

  let spyOnValidate: jasmine.Spy;
  let spyOnGetDistribution: jasmine.Spy;
  let spyOnS3GetObject: jasmine.Spy;
  let spyOnSignerConstructor: jasmine.Spy;
  let spyOnSigner: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.webDomain] = fakeWebDomain;
    process.env[envNames.webDistributionId] = fakeDistributionId;
    process.env[envNames.webSigningKeyBucket] = fakeSigningKeyBucket;
    process.env[envNames.webSigningKeyPath] = fakeSigningKeyPath;

    spyOnValidate = spyOn(apig, 'validate')
      .and.returnValue(Promise.resolve());
    spyOnGetDistribution = spyOn(cloudFront, 'getDistribution')
      .and.returnValue(fakeResolve({
        Distribution: {
          ActiveTrustedSigners: {
            Items: [{
              KeyPairIds: {
                Items: [fakeKeyPairId],
              },
            }],
          },
        },
      }));
    spyOnS3GetObject = spyOn(s3, 'getObject')
      .and.returnValue(fakeResolve({Body: fakeSigningKey()}));
    spyOnSigner = jasmine.createSpyObj('signer', ['getSignedCookie']);
    spyOnSignerConstructor = spyOn(cloudFrontTypes, 'Signer')
      .and.returnValue(spyOnSigner);
    (spyOnSigner as any).getSignedCookie
      .and.returnValue(fakeCookieParams());
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  const testMethod = (callback: Callback) => {
    generateSignedCookies(fakeRequest(), null, callback);
  };

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'GET', '/weblogin');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls cloudFront.getDistribution() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnGetDistribution).toHaveBeenCalledWith({
        Id: fakeDistributionId,
      });
      expect(spyOnGetDistribution).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls s3.getObject() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnS3GetObject).toHaveBeenCalledWith({
        Bucket: fakeSigningKeyBucket,
        Key: fakeSigningKeyPath,
      });
      expect(spyOnS3GetObject).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('constructs cloudFront.Signer() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnSignerConstructor).toHaveBeenCalledWith(
        fakeKeyPairId, fakeSigningKey().toString());
      expect(spyOnSignerConstructor).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls Signer.getSignedCookie() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect((spyOnSigner as any).getSignedCookie).toHaveBeenCalledWith({
        policy: stringify({
          Statement: [{
            Resource: `https://${fakeWebDomain}/*`,
            Condition: {
              DateLessThan: { 'AWS:EpochTime': fakeExpiresAt },
            },
          }],
        }),
      });
      expect((spyOnSigner as any).getSignedCookie).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls respond() with correct parameters', (done: Callback) => {
    const cookieSuffix = `Domain=${fakeWebDomain}; Path=/; Secure; HttpOnly`;
    const cookieParams = fakeCookieParams();
    const cookieContent: string[] = [];
    for (let cookie in cookieParams) {
      cookieContent.push(`${cookie}=${cookieParams[cookie]}; ${cookieSuffix}`);
    }
    const headers: Dict<string> = {};
    headers['Set-Cookie'] = cookieContent[0];
    headers['Set-cookie'] = cookieContent[1];
    headers['set-cookie'] = cookieContent[2];

    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(
        callback, fakeRequest(), undefined, 200, headers);
      done();
    };
    testMethod(callback);
  });

  describe('calls respondWithError() immediately with an error if', () => {
    describe('event', () => {
      let event: any;
      beforeEach(() => {
        event = fakeRequest();
      });
      afterEach((done: Callback) => {
        const callback = () => {
          expect(spyOnRespondWithError).toHaveBeenCalledWith(callback, event, jasmine.any(Error));
          expect(spyOnGetDistribution).not.toHaveBeenCalled();
          done();
        };
        generateSignedCookies(event, null, callback);
      });
      it('is undefined', () => event = undefined);
      it('is null', () => event = null);
      it('requestContext is undefined', () => event.requestContext = undefined);
      it('requestContext is null', () => event.requestContext = null);
      it('authorizer is undefined', () => event.requestContext.authorizer = undefined);
      it('authorizer is null', () => event.requestContext.authorizer = null);
      it('expiresAt is undefined', () => event.requestContext.authorizer.expiresAt = undefined);
      it('expiresAt is null', () => event.requestContext.authorizer.expiresAt = null);
      it('expiresAt is not a stringified number', () => event.requestContext.authorizer.expiresAt = '1M');
      it('does not pass validation', () => spyOnValidate.and.returnValue(Promise.reject(Error('validate()'))));
    });
    const testError = (last: Callback, done: Callback) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(callback, fakeRequest(), jasmine.any(Error));
        last();
        done();
      };
      testMethod(callback);
    };
    describe('cloudFront.getDistribution()', () => {
      let data: any;
      afterEach((done: Callback) => {
        spyOnGetDistribution.and.returnValue(data);
        testError(() => expect(spyOnS3GetObject).not.toHaveBeenCalled(), done);
      });
      it('produces an error', () => data = fakeReject('cloudFront.getDistribution()'));
      it('data is undefined', () => data = fakeResolve(undefined));
      it('data is null', () => data = fakeResolve(null));
      it('data.Distribution is undefined', () => data = fakeResolve({}));
      it('data.Distribution is null', () => data = fakeResolve({Distribution: null}));
      it('data.Distribution.ActiveTrustedSigners is undefined', () =>
        data = fakeResolve({Distribution: {}}));
      it('data.Distribution.ActiveTrustedSigners is null', () =>
        data = fakeResolve({Distribution: {ActiveTrustedSigners: null}}));
      it('data.Distribution.ActiveTrustedSigners.Items is undefined', () =>
        data = fakeResolve({Distribution: {ActiveTrustedSigners: {}}}));
      it('data.Distribution.ActiveTrustedSigners.Items is null', () =>
        data = fakeResolve({Distribution: {ActiveTrustedSigners: {Items: null}}}));
      it('data.Distribution.ActiveTrustedSigners.Items is empty', () =>
        data = fakeResolve({Distribution: {ActiveTrustedSigners: {Items: []}}}));
      it('data.Distribution.ActiveTrustedSigners.Items[0].KeyPairIds is undefined', () =>
        data = fakeResolve({Distribution: {ActiveTrustedSigners: {Items: [{}]}}}));
      it('data.Distribution.ActiveTrustedSigners.Items[0].KeyPairIds is null', () =>
        data = fakeResolve({Distribution: {ActiveTrustedSigners: {Items: [{KeyPairIds: null}]}}}));
      it('data.Distribution.ActiveTrustedSigners.Items[0].KeyPairIds.Items is undefined', () =>
        data = fakeResolve({Distribution: {ActiveTrustedSigners: {Items: [{KeyPairIds: {}}]}}}));
      it('data.Distribution.ActiveTrustedSigners.Items[0].KeyPairIds.Items is null', () =>
        data = fakeResolve({Distribution: {ActiveTrustedSigners: {Items: [{KeyPairIds: {Items: null}}]}}}));
    });
    describe('s3.getObject()', () => {
      let data: any;
      afterEach((done: Callback) => {
        spyOnS3GetObject.and.returnValue(data);
        testError(() => expect(spyOnSignerConstructor).not.toHaveBeenCalled(), done);
      });
      it('produces an error', () => data = fakeReject('s3.getObject()'));
      it('data is undefined', () => data = fakeResolve(undefined));
      it('data is null', () => data = fakeResolve(null));
      it('data.Body is undefined', () => data = fakeResolve({}));
      it('data.Body is null', () => data = fakeResolve({Body: null}));
    });
  });
});
