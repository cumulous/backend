import * as request from 'request-promise-native';

import * as auth0 from './auth0';
import { Auth0ClientConfig, Auth0ClientPayload, Auth0Request,
         authenticate, createClient, HttpMethod,
         manage, manageClient, rotateAndStoreClientSecret } from './auth0';
import { s3 } from './aws';
import { envNames } from './env';
import { fakeReject, fakeResolve, testError } from './fixtures/support';
import { Callback, Dict } from './types';

const fakeDomain = 'account.auth0.com';
const fakeClientId = '012345abcdEFGH';
const fakeClientSecret = 'fak3-s3cr3t';
const fakeToken = 'ey.12.34';

describe('authenticate()', () => {
  let fakeBaseUrl = 'https://' + fakeDomain;
  let fakeClientConfig = () => ({
    Domain: fakeDomain,
    ID: fakeClientId,
    Secret: fakeClientSecret,
  });
  let fakeResponse = () => ({
    access_token: fakeToken,
  });

  let spyOnPostRequest: jasmine.Spy;

  beforeEach(() => {
    spyOnPostRequest = spyOn(request, 'post')
      .and.returnValue(Promise.resolve(fakeResponse()));
  });

  const testMethod = () => authenticate(fakeClientConfig(), fakeBaseUrl);

  it('calls request.post() with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnPostRequest).toHaveBeenCalledWith(
        fakeBaseUrl + '/oauth/token', {
          json: true,
          body: {
            grant_type: 'client_credentials',
            audience: fakeBaseUrl,
            client_id: fakeClientId,
            client_secret: fakeClientSecret,
          },
        });
      expect(spyOnPostRequest).toHaveBeenCalledTimes(1);
      done();
    });
  });
  it('returns correct response extracted from request.post()', (done: Callback) => {
    testMethod().then(token => {
      expect(token).toEqual(fakeToken);
      done();
    });
  });
  describe('returns an error if', () => {
    it('request.post() returns an error', (done: Callback) => {
      spyOnPostRequest.and.returnValue(Promise.reject(Error('request.post()')));
      testMethod().catch(err => {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    });
    describe('request.post() response is', () => {
      let response: any;
      afterEach((done: Callback) => {
        spyOnPostRequest.and.returnValue(Promise.resolve(response));
        testMethod().catch(err => {
          expect(err).toEqual(jasmine.any(Error));
          done();
        });
      });
      it('undefined', () => response = undefined);
      it('null', () => response = null);
    });

    describe('client', () => {
      let fakeConfig: any;
      beforeEach(() => {
        fakeConfig = fakeClientConfig();
      });
      afterEach((done: Callback) => {
        authenticate(fakeConfig, fakeBaseUrl).catch(err => {
          expect(err).toEqual(jasmine.any(Error));
          done();
        });
      });
      describe('is', () => {
        it('undefined', () =>  fakeConfig = undefined);
        it('null', () => fakeConfig = null);
      });
    });
  });
});

describe('manage()', () => {
  const fakeSecretBucket = 'fake-secrets-bucket';
  const fakeSecretPath = 'auth0/secret.key';
  const fakeManageMethod: HttpMethod = 'GET';
  const fakeManageEndpoint = () => ['/clients', '1234abcd'];
  const fakeDataKey = 'data';
  const fakeDataValue = 'value';
  const fakeDataPath = `$.${fakeDataKey}`;

  const fakePayload = () => ({
    fake: 'payload',
  });

  const fakeEvent = () => ({
    method: fakeManageMethod,
    endpoint: fakeManageEndpoint(),
    payload: fakePayload(),
    datapath: fakeDataPath,
  });

  const fakeResponse = () => {
    const response: any = {};
    response[fakeDataKey] = fakeDataValue;
    return response;
  };

  let spyOnS3GetObject: jasmine.Spy;
  let spyOnManageClient: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.auth0Domain] = fakeDomain;
    process.env[envNames.auth0ClientId] = fakeClientId;
    process.env[envNames.auth0SecretBucket] = fakeSecretBucket;
    process.env[envNames.auth0SecretPath] = fakeSecretPath;

    spyOnS3GetObject = spyOn(s3, 'getObject')
      .and.returnValue(fakeResolve({
        Body: Buffer.from(fakeClientSecret),
      }));
    spyOnManageClient = spyOn(auth0, 'manageClient')
      .and.returnValue(Promise.resolve(fakeResponse()));
  });

  const testMethod = (callback: Callback) => manage(fakeEvent(), null, callback);

  it('calls s3.getObject() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnS3GetObject).toHaveBeenCalledWith({
        Bucket: fakeSecretBucket,
        Key: fakeSecretPath,
      });
      expect(spyOnS3GetObject).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls manageClient() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnManageClient).toHaveBeenCalledWith({
        Domain: fakeDomain,
        ID: fakeClientId,
        Secret: fakeClientSecret,
      }, fakeManageMethod, fakeManageEndpoint().join('/'), fakePayload());
      expect(spyOnManageClient).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls callback with correct parameters when "datapath" is', () => {
    it('defined', (done: Callback) => {
      testMethod((err: Error, data: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual(fakeDataValue);
        done();
      });
    });
    it('omitted', (done: Callback) => {
      const event = Object.assign(fakeEvent(), {datapath: undefined});
      manage(event, null, (err: Error, data: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual(fakeResponse());
        done();
      });
    });
  });

  describe('immediately calls callback with an error if', () => {
    describe('event', () => {
      let event: any;
      afterEach((done: Callback) => {
        manage(event, null, err => {
          expect(err).toEqual(jasmine.any(Error));
          expect(spyOnS3GetObject).not.toHaveBeenCalled();
          done();
        });
      });
      it('is undefined', () => event = undefined);
      it('is null', () => event = null);
      it('endpoint is undefined', () => event = {});
      it('endpoint is null', () => event = { endpoint: null });
      it('endpoint is not an array', () => event = { endpoint: {} });
    });
    describe('s3.getObject()', () => {
      let data: any;
      afterEach((done: Callback) => {
        spyOnS3GetObject.and.returnValue(data);
        testMethod(err => {
          expect(err).toEqual(jasmine.any(Error));
          expect(spyOnManageClient).not.toHaveBeenCalled();
          done();
        });
      });
      it('produces and error', () => data = fakeReject('s3.getObject()'));
      describe('data', () => {
        it('is undefined', () => data = fakeResolve(undefined));
        it('is null', () => data = fakeResolve(null));
        it('Body is undefined', () => data = fakeResolve({}));
        it('Body is null', () => data = fakeResolve({Body: null}));
      });
    });
    it('manageClient() produces and error', (done: Callback) => {
      spyOnManageClient.and.returnValue(Promise.reject(Error('manageClient()')));
      testMethod(err => {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    });
    it('datapath does not conform to JSONPath syntax', (done: Callback) => {
      manage(Object.assign(fakeEvent(), {datapath: '%'}), null, err => {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    });
  });
});

describe('manageClient()', () => {
  const fakeManageMethod = 'POST';
  const fakeManageEndpoint = '/clients';

  let fakeBaseUrl = 'https://' + fakeDomain + '/api/v2';
  let fakeClientConfig = () => ({
    Domain: fakeDomain,
    ID: fakeClientId,
    Secret: fakeClientSecret,
  });
  let fakePayload = () => ({
    fake: 'input',
  });
  let fakeResponse = () => ({
    fake: 'output',
  });

  let spyOnAuthenticate: jasmine.Spy;
  let spyOnRequest: jasmine.Spy;

  beforeEach(() => {
    spyOnAuthenticate = spyOn(auth0, 'authenticate')
      .and.returnValue(Promise.resolve(fakeToken));
    spyOnRequest = spyOn(auth0, 'request')
      .and.returnValue(Promise.resolve(fakeResponse()));
  });

  const testMethod = () =>
    manageClient(fakeClientConfig(), fakeManageMethod, fakeManageEndpoint, fakePayload());

  it('calls authenticate() with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnAuthenticate).toHaveBeenCalledWith(
        fakeClientConfig(), fakeBaseUrl + '/');
      expect(spyOnAuthenticate).toHaveBeenCalledTimes(1);
      done();
    });
  });
  it('request() with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnRequest).toHaveBeenCalledWith(fakeBaseUrl + fakeManageEndpoint, {
          method: fakeManageMethod,
          headers: {
            Authorization: `Bearer ${fakeToken}`,
          },
          json: true,
          body: fakePayload(),
        });
      expect(spyOnRequest).toHaveBeenCalledTimes(1);
      done();
    });
  });
  describe('immediately returns with an error if', () => {
    it('authenticate() produces an error', (done: Callback) => {
      spyOnAuthenticate.and.returnValue(Promise.reject(Error('authenticate()')));
      testMethod().catch(err => {
        expect(err).toEqual(jasmine.any(Error));
        expect(spyOnRequest).not.toHaveBeenCalled();
        done();
      });
    });
    describe('client config is', () => {
      let config: any;
      afterEach((done: Callback) => {
        manageClient(config, fakeManageMethod, fakeManageEndpoint, fakePayload()).catch(err => {
          expect(err).toEqual(jasmine.any(Error));
          expect(spyOnRequest).not.toHaveBeenCalled();
          done();
        });
      });
      it('undefined', () => config = undefined);
      it('null', () => config = null);
    });
  });
  it('returns with an error if request() produces an error', (done: Callback) => {
    spyOnRequest.and.returnValue(Promise.reject(Error('request()')));
    testMethod().catch(err => {
      expect(err).toEqual(jasmine.any(Error));
      done();
    });
  });
});

describe('rotateAndStoreClientSecret()', () => {
  const fakeSecretBucket = 'fake-bucket';
  const fakeSecretPath = 'auth0/fake.key';
  const fakeSecretValue = 'fAkEs3cr3t';
  const fakeEncryptionKeyId = 'fake-encryption-key-1234';

  let fakeClientConfig = () => ({
    Domain: fakeDomain,
    ID: fakeClientId,
    Secret: fakeClientSecret,
  });
  let fakeClientResponse = () => ({
    client_secret: fakeSecretValue,
  });

  let spyOnManage: jasmine.Spy;
  let spyOnS3PutObject: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.auth0Domain] = fakeDomain;
    process.env[envNames.auth0ClientId] = fakeClientId;
    process.env[envNames.auth0SecretBucket] = fakeSecretBucket;
    process.env[envNames.auth0SecretPath] = fakeSecretPath;
    process.env[envNames.encryptionKeyId] = fakeEncryptionKeyId;

    spyOnManage = spyOn(auth0, 'manageClient')
      .and.returnValue(Promise.resolve(fakeClientResponse()));
    spyOnS3PutObject = spyOn(s3, 'putObject')
      .and.returnValue(fakeResolve());
  });

  const testMethod = (callback: Callback) => {
    rotateAndStoreClientSecret(fakeClientSecret, null, callback);
  };

  it('calls manageClient() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnManage).toHaveBeenCalledWith(
        fakeClientConfig(), 'POST', `/clients/${fakeClientId}/rotate-secret`);
      expect(spyOnManage).toHaveBeenCalledTimes(1);
      done();
    });
  });
  it('calls s3.putObject() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnS3PutObject).toHaveBeenCalledWith({
        Bucket: fakeSecretBucket,
        Key: fakeSecretPath,
        Body: fakeSecretValue,
        SSEKMSKeyId: fakeEncryptionKeyId,
        ServerSideEncryption: 'aws:kms',
      });
      expect(spyOnS3PutObject).toHaveBeenCalledTimes(1);
      done();
    });
  });
  describe('immediately calls callback with an error if', () => {;
    describe('manageClient()', () => {
      afterEach((done: Callback) => {
        testMethod((err: Error) => {
          expect(err).toEqual(jasmine.any(Error));
          expect(spyOnS3PutObject).not.toHaveBeenCalled();
          done();
        });
      });
      it('returns an error', () => {
        spyOnManage.and.returnValue(Promise.reject(Error('manageClient()')));
      });
      describe('response is', () => {
        it('undefined', () => {
          spyOnManage.and.returnValue(Promise.resolve(undefined));
        });
        it('null', () => {
          spyOnManage.and.returnValue(Promise.resolve(null));
        });
      });
    });
  });
  it('s3.putObject() produces an error', (done: Callback) => {
    spyOnS3PutObject.and.returnValue(fakeReject('s3.putObject()'));
    testMethod((err: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      done();
    });
  });
});

describe('createClient()', () => {
  const fakeSecretBucket = 'fake-bucket';
  const fakeSecretPath = 'auth0/fake.key';
  const fakeSecretValue = 'fAkEs3cr3t';
  const fakeEncryptionKeyId = 'fake-encryption-key-1234';

  let fakePayload = (): Auth0ClientPayload => ({
    name: 'fake client',
    app_type: 'spa',
    callbacks: [
      'https://example.org',
    ],
    jwt_configuration: {
      lifetime_in_seconds: 7200,
      alg: 'RS256',
    },
    resource_servers: [
      'https://api.example.org',
    ],
  });
  let fakeSecret = () => ({
    Bucket: fakeSecretBucket,
    Path: fakeSecretPath,
    EncryptionKeyId: fakeEncryptionKeyId,
  });

  let spyOnManage: jasmine.Spy;
  let spyOnS3PutObject: jasmine.Spy;

  beforeEach(() => {
    spyOnManage = spyOn(auth0, 'manage')
      .and.callFake((event: Auth0Request, context: any, callback: Callback) =>
        callback(null, { client_id: fakeClientId, client_secret: fakeSecretValue }));
    spyOnS3PutObject = spyOn(s3, 'putObject')
      .and.returnValue(fakeResolve());
  });

  const testMethod = (callback: Callback) => {
    createClient({
      Payload: fakePayload(),
      Secret: fakeSecret(),
    }, null, callback);
  };

  it('calls manage() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnManage).toHaveBeenCalledWith({
        method: 'POST',
        endpoint: ['/clients'],
        payload: fakePayload(),
      }, null, jasmine.any(Function));
      expect(spyOnManage).toHaveBeenCalledTimes(1);
      done();
    });
  });
  it('calls s3.putObject() with correct parameters if Secret is present', (done: Callback) => {
    testMethod(() => {
      expect(spyOnS3PutObject).toHaveBeenCalledWith({
        Bucket: fakeSecretBucket,
        Key: fakeSecretPath,
        Body: fakeSecretValue,
        SSEKMSKeyId: fakeEncryptionKeyId,
        ServerSideEncryption: 'aws:kms',
      });
      expect(spyOnS3PutObject).toHaveBeenCalledTimes(1);
      done();
    });
  });
  it('does not call s3.putObject() if Secret is absent', (done: Callback) => {
    createClient({
      Payload: fakePayload(),
    }, null, () => {
      expect(spyOnS3PutObject).not.toHaveBeenCalled();
      done();
    });
  });
  describe('calls callback with correct parameters if Secret is', () => {
    let secret: any;
    afterEach((done: Callback) => {
      createClient({
        Payload: fakePayload(),
        Secret: secret,
      }, null, (err?: Error, client_id?: string) => {
        expect(err).toBeFalsy();
        expect(client_id).toEqual(fakeClientId);
        done();
      });
    });
    it('present', () => secret = fakeSecret());
    it('absent', () => {});
  });
  describe('immediately calls callback with an error if', () => {;
    describe('manage()', () => {
      afterEach((done: Callback) => {
        testMethod((err: Error) => {
          expect(err).toEqual(jasmine.any(Error));
          expect(spyOnS3PutObject).not.toHaveBeenCalled();
          done();
        });
      });
      it('returns an error', () => {
        spyOnManage.and.callFake(
          (event: Auth0Request, context: any, callback: Callback) => callback(Error('manage()')));
      });
      describe('response is', () => {
        it('undefined', () => {
          spyOnManage.and.callFake(
            (event: Auth0Request, context: any, callback: Callback) => callback());
        });
        it('null', () => {
          spyOnManage.and.callFake(
            (event: Auth0Request, context: any, callback: Callback) => callback(null, null));
        });
      });
    });
  });
  it('s3.putObject() produces an error', (done: Callback) => {
    spyOnS3PutObject.and.returnValue(fakeReject('s3.putObject()'));
    testMethod((err: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      done();
    });
  });
  describe('event is', () => {
    let event: any;
    afterEach((done: Callback) => {
      createClient(event, null, (err: Error) => {
        expect(err).toEqual(jasmine.any(Error));
        expect(spyOnManage).not.toHaveBeenCalled();
        done();
      });
    });
    it('undefined', () => event = undefined);
    it('null', () => event = null);
  });
});
