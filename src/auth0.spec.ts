import * as auth0 from './auth0';
import { Auth0ClientConfig, authenticate,
         manage, rotateAndStoreClientSecret } from './auth0';
import { s3 } from './aws';
import { testError } from './fixtures/support';
import * as helpers from './helpers';
import { Callback, Dict } from './types';

const fakeDomain = 'account.auth0.com';
const fakeCloudFormationClientId = '012345abcdEFGH';
const fakeCloudFormationClientSecret = 'fak3-s3cr3t';
const fakeCloudFormationToken = 'ey.12.34';

describe('authenticate', () => {
  let fakeBaseUrl: string;
  let fakeClientConfig: Auth0ClientConfig;
  let fakeResponse: () => any;
  let spyOnJsonRequest: jasmine.Spy;

  beforeEach(() => {
    fakeBaseUrl = 'https://' + fakeDomain;
    fakeClientConfig = {
      Domain: fakeDomain,
      ID: fakeCloudFormationClientId,
      Secret: {
        Value: fakeCloudFormationClientSecret,
      },
    };
    fakeResponse = () => ({
      access_token: fakeCloudFormationToken,
    });

    spyOnJsonRequest = spyOn(helpers, 'jsonRequest').and.callFake(
        (method: 'POST', Url: string, headers: Dict<string>, body: any, callback: Callback) =>
      callback(null, fakeResponse()));
  });

  describe('calls', () => {
    it('jsonRequest() with correct parameters', (done: Callback) => {
      const callback = () => {
        expect(spyOnJsonRequest).toHaveBeenCalledWith(
          'POST', fakeBaseUrl + '/oauth/token', {
            'Content-Type': 'application/json',
          }, {
            grant_type: 'client_credentials',
            audience: fakeBaseUrl,
            client_id: fakeCloudFormationClientId,
            client_secret: fakeCloudFormationClientSecret,
          }, jasmine.any(Function));
        expect(spyOnJsonRequest).toHaveBeenCalledTimes(1);
        done();
      };
      authenticate(fakeClientConfig, fakeBaseUrl, callback);
    });
    describe('callback with an error if', () => {
      it('jsonRequest() returns an error', (done: Callback) => {
        spyOnJsonRequest.and.callFake(
            (method: string, Url: string, headers: Dict<string>, body: any, callback: Callback) =>
          callback(Error('jsonRequest()')));
        authenticate(fakeClientConfig, fakeBaseUrl, (err: Error) => {
          expect(err).toBeTruthy();
          done();
        });
      });
      describe('response is', () => {
        let response: any;
        afterEach((done: Callback) => {
          spyOnJsonRequest.and.callFake(
              (method: string, Url: string, headers: Dict<string>, body: any, callback: Callback) =>
            callback(null, response));
          authenticate(fakeClientConfig, fakeBaseUrl, (err: Error) => {
            expect(err).toBeTruthy();
            done();
          });
        });
        it('undefined', () => response = undefined);
        it('null', () => response = null);
        it('missing access_token', () => response = { error: 'invalid_request' });
      });

      describe('client', () => {
        afterEach((done: Callback) => {
          authenticate(fakeClientConfig, fakeBaseUrl, (err: Error) => {
            expect(err).toBeTruthy();
            done();
          });
        });
        describe('is', () => {
          it('undefined', () => {
            fakeClientConfig = undefined;
          });
          it('null', () => {
            fakeClientConfig = null;
          });
        });
        describe('secret config is', () => {
          it('undefined', () => {
            delete fakeClientConfig.Secret;
          });
          it('null', () => {
            fakeClientConfig.Secret = null;
          });
        });
      });
    });
  });
});

describe('manage', () => {
  const fakeManageMethod = 'POST';
  const fakeManageEndpoint = '/clients';

  let fakeBaseUrl: string;
  let fakeClientConfig: () => Auth0ClientConfig;
  let fakeManagePayload: () => any;

  let spyOnAuthenticate: jasmine.Spy;
  let spyOnJsonRequest: jasmine.Spy;

  beforeEach(() => {
    fakeBaseUrl = 'https://' + fakeDomain + '/api/v2';
    fakeClientConfig = () => ({
      Domain: fakeDomain,
      ID: fakeCloudFormationClientId,
      Secret: {
        Value: fakeCloudFormationClientSecret,
      },
    });
    fakeManagePayload = () => ({
      fake: 'input',
    });

    spyOnAuthenticate = spyOn(auth0, 'authenticate').and.callFake(
        (client: Auth0ClientConfig, audience: string, callback: Callback) =>
      callback(null, fakeCloudFormationToken));
    spyOnJsonRequest = spyOn(helpers, 'jsonRequest').and.callFake(
        (method: string, Url: string, headers: Dict<string>, body: any, callback: Callback) =>
      callback());
  });

  const testManage = (callback: Callback) => {
    manage(fakeClientConfig(), fakeManageMethod, fakeManageEndpoint, fakeManagePayload(), callback);
  };

  describe('calls', () => {
    it('authenticate() with correct parameters', (done: Callback) => {
      const callback = () => {
        expect(spyOnAuthenticate).toHaveBeenCalledWith(
          fakeClientConfig(), fakeBaseUrl + '/', jasmine.any(Function));
        expect(spyOnAuthenticate).toHaveBeenCalledTimes(1);
        done();
      };
      testManage(callback);
    });
    it('callback with an error if authenticate() returns an error', (done: Callback) => {
      spyOnAuthenticate.and.callFake((client: Auth0ClientConfig, audience: string, callback: Callback) =>
        callback(Error('authenticate()')));
      const callback = (err: Error) => {
        expect(err).toBeTruthy();
        done();
      };
      testManage(callback);
    });
    it('jsonRequest() with correct parameters', (done: Callback) => {
      const callback = (err: Error) => {
        expect(spyOnJsonRequest).toHaveBeenCalledWith(
          fakeManageMethod, fakeBaseUrl + fakeManageEndpoint, {
            Authorization: 'Bearer ' + fakeCloudFormationToken,
          }, fakeManagePayload(), callback);
        expect(spyOnJsonRequest).toHaveBeenCalledTimes(1);
        done();
      };
      testManage(callback);
    });
  });
});

describe('rotateAndStoreClientSecret', () => {
  const fakeSecretBucket = 'fake-bucket';
  const fakeSecretPath = 'auth0/fake.key';
  const fakeSecretValue = 'fAkEs3cr3t';
  const fakeEncryptionKeyId = 'fake-encryption-key-1234';

  let fakeClientConfig: () => Auth0ClientConfig;
  let fakeClientResponse: () => { client_secret: string };

  let spyOnManage: jasmine.Spy;
  let spyOnS3PutObject: jasmine.Spy;

  beforeEach(() => {
    fakeClientConfig = () => ({
      Domain: fakeDomain,
      ID: fakeCloudFormationClientId,
      Secret: {
        Value: fakeCloudFormationClientSecret,
        Bucket: fakeSecretBucket,
        Path: fakeSecretPath,
        EncryptionKeyId: fakeEncryptionKeyId,
      },
    });
    fakeClientResponse = () => ({
      client_secret: fakeSecretValue,
    });

    spyOnManage = spyOn(auth0, 'manage').and.callFake(
        (client: Auth0ClientConfig, method: string, endpoint: string, payload: any, callback: Callback) =>
      callback(null, fakeClientResponse()));
    spyOnS3PutObject = spyOn(s3, 'putObject')
      .and.callFake((params: any, callback: Callback) => callback());
  });

  const testMethod = (callback: Callback) => {
    rotateAndStoreClientSecret(fakeClientConfig(), null, callback);
  };

  describe('calls', () => {
    it('manage() with correct parameters', (done: Callback) => {
      const callback = () => {
        expect(spyOnManage).toHaveBeenCalledWith(fakeClientConfig(), 'POST',
          '/clients/' + fakeCloudFormationClientId + '/rotate-secret', null, jasmine.any(Function));
        expect(spyOnManage).toHaveBeenCalledTimes(1);
        done();
      };
      testMethod(callback);
    });
    it('s3.putObject() with correct parameters', (done: Callback) => {
      const callback = () => {
        expect(spyOnS3PutObject).toHaveBeenCalledWith({
          Bucket: fakeSecretBucket,
          Key: fakeSecretPath,
          Body: fakeSecretValue,
          SSEKMSKeyId: fakeEncryptionKeyId,
          ServerSideEncryption: 'aws:kms',
        }, callback);
        expect(spyOnS3PutObject).toHaveBeenCalledTimes(1);
        done();
      };
      testMethod(callback);
    });
    describe('callback with an error if', () => {
      it('manage() returns an error', (done: Callback) => {
        spyOnManage.and.callFake(
            (client: Auth0ClientConfig, method: string, endpoint: string, payload: any, callback: Callback) =>
          callback(Error('authenticate()')));
        const callback = (err: Error) => {
          expect(err).toBeTruthy();
          done();
        };
        testMethod(callback);
      });
      describe('manage() response is', () => {
        it('undefined', () => {
          fakeClientResponse = () => undefined;
        });
        it('null', () => {
          fakeClientResponse = () => null;
        });
        afterEach((done: Callback) => {
          testError(rotateAndStoreClientSecret, fakeClientConfig(), done);
        });
      });
    });
  });
});
