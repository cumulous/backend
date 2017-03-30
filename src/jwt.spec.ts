import * as jsonwebtoken from 'jsonwebtoken';

import { envNames } from './env';
import * as jwt from './jwt';
import { authenticate, getCertificate } from './jwt';
import { Callback, Dict } from './types';

describe('getCertificate()', () => {
  const fakeAuth0Domain = 'example.auth0.com';
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
    return getCertificate(fakeAuth0Domain, fakeKid);
  };

  it('calls jwksClient() once with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnJwksClient).toHaveBeenCalledWith({
        jwksUri: `https://${fakeAuth0Domain}/.well-known/jwks.json`,
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
  const fakeApiDomain = 'api.example.org';
  const fakeAuth0Domain = 'tenant.auth0.com';
  const fakeToken = 'ey.ab.cd';
  const fakeKid = 'FAKE_KID';
  const fakeCert = 'FAKE_CERT ABCD';

  let fakePayload: () => Dict<string>;

  let spyOnDecodeJwt: jasmine.Spy;
  let spyOnGetCertificate: jasmine.Spy;
  let spyOnVerifyJwt: jasmine.Spy;

  beforeEach(() => {
    fakePayload = () => ({
      sub: '1234',
    });

    process.env[envNames.apiDomain] = fakeApiDomain;

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
    return authenticate(fakeAuth0Domain, fakeToken);
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
      expect(spyOnGetCertificate).toHaveBeenCalledWith(fakeAuth0Domain, fakeKid);
      expect(spyOnGetCertificate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls jsonwebtoken.verify() with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnVerifyJwt).toHaveBeenCalledWith(
        fakeToken, fakeCert, {
          algorithms: ['RS256'],
          audience: fakeApiDomain,
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
