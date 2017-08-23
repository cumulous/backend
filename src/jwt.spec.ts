import * as jsonwebtoken from 'jsonwebtoken';

import { envNames } from './env';
import * as jwt from './jwt';
import { authenticate, getCertificate } from './jwt';
import { Callback, Dict } from './types';

const fakeAuthDomain = 'cognito-idp.us-east-1.amazonaws.com/us-east-1_abcd';

describe('getCertificate()', () => {
  const fakeKid = 'FAKE_KEY_ID';
  const fakeKey = 'FAKE_KEY';

  let spyOnGetSigningKey: jasmine.Spy;
  let spyOnJwksClient: jasmine.Spy;

  beforeEach(() => {
    spyOnGetSigningKey = jasmine.createSpy('getSigningKey')
      .and.callFake((kid: string, callback: Callback) =>
        callback ? callback(null, { publicKey: fakeKey }) : null);
    spyOnJwksClient = spyOn(jwt, 'jwksClient')
      .and.returnValue({ getSigningKey: spyOnGetSigningKey });
  });

  const testMethod = () => {
    return getCertificate(fakeAuthDomain, fakeKid);
  };

  it('calls jwksClient() once with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnJwksClient).toHaveBeenCalledWith({
        jwksUri: `https://${fakeAuthDomain}/.well-known/jwks.json`,
        cache: true,
        rateLimit: true,
      });
      expect(spyOnJwksClient).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls JwksClient.getSigningKey() once with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnGetSigningKey).toHaveBeenCalledWith(fakeKid, jasmine.any(Function));
      expect(spyOnGetSigningKey).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('returns correct output if JwksClient.getSigningKey() response contains', () => {
    let keyResponse: any;
    afterEach((done: Callback) => {
      spyOnGetSigningKey.and.callFake((kid: string, callback: Callback) =>
        callback ? callback(null, keyResponse) : null);
      testMethod().then((key: string) => {
        expect(key).toEqual(fakeKey);
        done();
      });
    });
    it('publicKey', () => keyResponse = { publicKey: fakeKey });
    it('rsaPublicKey', () => keyResponse = { rsaPublicKey: fakeKey });
  });

  describe('produces an error if', () => {
    afterEach((done: Callback) => {
      testMethod().catch(err => {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    });
    it('jwksClient() throws an error', () => {
      spyOnJwksClient.and.throwError('jwksClient()');
    });
    describe('JwksClient.getSigningKey() produces', () => {
      it('an error', () => {
        spyOnGetSigningKey.and.callFake((kid: string, callback: Callback) =>
            callback ? callback(Error('JwksClient.getSigningKey()')) : null);
      });
      it('an undefined response', () => {
        spyOnGetSigningKey.and.callFake((kid: string, callback: Callback) =>
            callback ? callback(null, undefined) : null);
      });
      it('a null response', () => {
        spyOnGetSigningKey.and.callFake((kid: string, callback: Callback) =>
            callback ? callback(null, null) : null);
      });
    });
  });
});

describe('authenticate()', () => {
  const fakeToken = 'ey.ab.cd';
  const fakeKid = 'FAKE_KID';
  const fakeCert = 'FAKE_CERT ABCD';
  const fakeTokenLifetime = 3600;

  let fakePayload: () => Dict<string>;

  let spyOnDecodeJwt: jasmine.Spy;
  let spyOnGetCertificate: jasmine.Spy;
  let spyOnVerifyJwt: jasmine.Spy;

  beforeEach(() => {
    fakePayload = () => ({
      sub: '1234',
    });

    process.env[envNames.authTokenLifetime] = fakeTokenLifetime;

    spyOnDecodeJwt = spyOn(jsonwebtoken, 'decode')
      .and.returnValue({
        header: {
          kid: fakeKid,
        },
      });
    spyOnGetCertificate = spyOn(jwt, 'getCertificate')
      .and.returnValue(Promise.resolve(fakeCert));
    spyOnVerifyJwt = spyOn(jsonwebtoken, 'verify')
      .and.returnValue(Promise.resolve(fakePayload()));
  });

  const testMethod = () => {
    return authenticate(fakeAuthDomain, fakeToken);
  };

  it('calls jsonwebtoken.decode() once with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnDecodeJwt).toHaveBeenCalledWith(fakeToken, {complete: true});
      expect(spyOnDecodeJwt).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls getCertificate() once with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnGetCertificate).toHaveBeenCalledWith(fakeAuthDomain, fakeKid);
      expect(spyOnGetCertificate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls jsonwebtoken.verify() with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnVerifyJwt).toHaveBeenCalledWith(
        fakeToken, fakeCert, {
          algorithms: ['RS256'],
          issuer: `https://${fakeAuthDomain}`,
          maxAge: fakeTokenLifetime + 's',
          ignoreExpiration: true,
        });
      expect(spyOnVerifyJwt).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('returns correct response if JWT is valid', (done: Callback) => {
    testMethod().then(payload => {
      expect(payload).toEqual(fakePayload());
      done();
    });
  });

  describe('immediately produces an error if', () => {
    const testError = (last: () => void, done: Callback) => {
      testMethod().catch(err => {
        expect(err).toEqual(jasmine.any(Error));
        last();
        done();
      });
    };
    describe('jsonwebtoken.decode() returns', () => {
      let decoded: any;
      afterEach((done: Callback) => {
        spyOnDecodeJwt.and.returnValue(decoded);
        testError(() => expect(spyOnGetCertificate).not.toHaveBeenCalled(), done);
      });
      it('"null"', () => decoded = null);
      it('"undefined"', () => decoded = undefined);
      it('response with an undefined header', () => decoded = {});
      it('response with an null header', () => decoded = { header: null });
    });
    it('getCertificate() returns an error', (done: Callback) => {
      spyOnGetCertificate.and.returnValue(Promise.reject(Error('getCertificate()')));
      testError(() => expect(spyOnVerifyJwt).not.toHaveBeenCalled(), done);
    });
    it('jsonwebtoken.verify() returns an Error', (done: Callback) => {
      spyOnVerifyJwt.and.returnValue(Promise.reject(Error('jsonwebtoken.verify()')));
      testError(() => {}, done);
    });
  });
});
