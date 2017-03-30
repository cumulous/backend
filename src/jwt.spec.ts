import * as jsonwebtoken from 'jsonwebtoken';

import * as jwt from './jwt';
import { authenticate, getCertificate } from './jwt';
import { Callback, Dict } from './types';

describe('getCertificate()', () => {
  const fakeDomain = 'example.auth0.com';
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

  const testMethod = (callback: Callback) => {
    getCertificate(fakeDomain, fakeKid, callback);
  };

  it('calls jwksClient() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnJwksClient).toHaveBeenCalledWith({
        jwksUri: `https://${fakeDomain}/.well-known/jwks.json`,
        cache: true,
        rateLimit: true,
      });
      expect(spyOnJwksClient).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls JwksClient.getSigningKey() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnGetSigningKey).toHaveBeenCalledWith(fakeKid, jasmine.any(Function));
      expect(spyOnGetSigningKey).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls callback with correct parameters ' +
           'if JwksClient.getSigningKey() response contains', () => {
    let keyResponse: any;
    afterEach((done: Callback) => {
      spyOnGetSigningKey.and.callFake((kid: string, callback: Callback) =>
        callback ? callback(null, keyResponse) : null);
      testMethod((err: Error, key: string) => {
        expect(err).toBeFalsy();
        expect(key).toEqual(fakeKey);
        done();
      });
    });
    it('publicKey', () => keyResponse = { publicKey: fakeKey });
    it('rsaPublicKey', () => keyResponse = { rsaPublicKey: fakeKey });
  });

  it('calls callback immediately with an error if jwksClient() throws an error', (done: Callback) => {
    spyOnJwksClient.and.throwError('jwksClient()');
    testMethod((err: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      done();
    });
  });

  describe('calls callback with an error if JwksClient.getSigningKey() produces', () => {
    afterEach((done: Callback) => {
      testMethod((err: Error) => {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    });
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

describe('authenticate()', () => {
  const fakeDomain = 'tenant.auth0.com';
  const fakeToken = 'ey.ab.cd';
  const fakeKid = 'FAKE_KID';
  const fakeCert = 'FAKE_CERT ABCD';

  let spyOnDecodeJwt: jasmine.Spy;
  let spyOnGetCertificate: jasmine.Spy;
  let spyOnVerifyJwt: jasmine.Spy;

  beforeEach(() => {
    spyOnDecodeJwt = spyOn(jsonwebtoken, 'decode')
      .and.returnValue({
        header: {
          kid: fakeKid,
        },
      });
    spyOnGetCertificate = spyOn(jwt, 'getCertificate')
      .and.callFake((domain: string, kid: string, callback: Callback) =>
        callback ? callback(null, fakeCert) : null);
    spyOnVerifyJwt = spyOn(jsonwebtoken, 'verify')
      .and.callFake((token: string, cert: string, options: Dict<string>, callback: Callback) =>
        callback ? callback(): null);
  });

  const testMethod = (callback: Callback) => {
    authenticate(fakeDomain, fakeToken, callback);
  };

  it('calls jsonwebtoken.decode() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDecodeJwt).toHaveBeenCalledWith(fakeToken, {complete: true});
      expect(spyOnDecodeJwt).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls getCertificate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnGetCertificate).toHaveBeenCalledWith(fakeDomain, fakeKid, jasmine.any(Function));
      expect(spyOnGetCertificate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls jsonwebtoken.verify() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnVerifyJwt).toHaveBeenCalledWith(
        fakeToken, fakeCert, { algorithms: ['RS256'] }, jasmine.any(Function));
      expect(spyOnVerifyJwt).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error if JWT is valid', (done: Callback) => {
    testMethod((err: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });

  describe('immediately calls callback with "Unauthorized" response if', () => {
    const testError = (last: () => void, done: Callback) => {
      testMethod((err: string) => {
        expect(err).toEqual('Unauthorized');
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
      spyOnGetCertificate.and.callFake((domain: string, kid: string, callback: Callback) =>
        callback ? callback(Error('getCertificate()')) : null);
      testError(() => expect(spyOnVerifyJwt).not.toHaveBeenCalled(), done);
    });
    it('jsonwebtoken.verify() returns an Error', (done: Callback) => {
      spyOnVerifyJwt.and.callFake(
        (token: string, cert: string, options: Dict<string>, callback: Callback) =>
          callback ? callback(Error('jsonwebtoken.verify()')): null);
      testError(() => {}, done);
    });
  });
});
