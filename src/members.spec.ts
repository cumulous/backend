const jsrsasign = require('jsrsasign');

import * as auth0 from './auth0';
import { getCertificate } from './auth0';
import { envNames } from './env';
import * as members from './members';
import { authorize, verifyJwt } from './members';
import { Callback } from './types';

const fakeToken = 'ey.ab.cd';
const fakeCert = 'FAKE_CERT ABCD';

describe('authorize()', () => {
  const fakeDomain = 'tenant.auth0.com';

  let fakeEvent = () => ({
    authorizationToken: fakeToken,
  });

  let spyOnGetCertificate: jasmine.Spy;
  let spyOnVerifyJwt: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.auth0Domain] = fakeDomain;

    spyOnGetCertificate = spyOn(auth0, 'getCertificate')
      .and.callFake((domain: string, callback: Callback) =>
        callback ? callback(null, fakeCert) : null);
    spyOnVerifyJwt = spyOn(members, 'verifyJwt')
      .and.callFake((token: string, cert: string, callback: Callback) =>
        callback ? callback(): null);
  });

  const testMethod = (callback: Callback) => {
    authorize(fakeEvent(), null, callback);
  };

  it('calls auth0.getCertificate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnGetCertificate).toHaveBeenCalledWith(fakeDomain, jasmine.any(Function));
      expect(spyOnGetCertificate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls verifyJwt() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnVerifyJwt).toHaveBeenCalledWith(
        fakeToken, fakeCert, jasmine.any(Function));
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

  describe('immediately calls callback with an Error if', () => {
    const testError = (done: Callback) => (err: Error | string) => {
      expect(err).toBeTruthy();
      expect(err).not.toEqual('Unauthorized');
      expect(spyOnGetCertificate).not.toHaveBeenCalled();
      done();
    };
    describe('event is', () => {
      it('undefined', (done: Callback) => {
        authorize(undefined, null, testError(done));
      });
      it('null', (done: Callback) => {
        authorize(null, null, testError(done));
      });
    });
  });

  it('immediately calls callback with an Error if auth0.getCertificate() returns an error',
      (done: Callback) => {
    spyOnGetCertificate.and.callFake((domain: string, callback: Callback) =>
      callback ? callback(Error('auth0.getCertificate()')) : null);
    testMethod((err: Error | string) => {
      expect(err).toBeTruthy();
      expect(err).not.toEqual('Unauthorized');
      expect(spyOnVerifyJwt).not.toHaveBeenCalled();
      done();
    });
  });

  it('calls callback with "Unauthorized" keyword if verifyJwt() returns an Error',
      (done: Callback) => {
    spyOnVerifyJwt.and.callFake((token: string, cert: string, callback: Callback) =>
        callback ? callback(Error('verifyJwt()')): null);
    testMethod((err: string) => {
      expect(err).toEqual('Unauthorized');
      done();
    });
  });
});

describe('verifyJwt()', () => {

  let spyOnVerifyJWT: jasmine.Spy;

  beforeEach(() => {
    spyOnVerifyJWT = spyOn(jsrsasign.jws.JWS, 'verifyJWT')
      .and.returnValue(true);
  });

  const testMethod = (callback: Callback) => {
    verifyJwt(fakeToken, fakeCert, callback);
  };

  it('calls jsrsasign.jws.JWS.verifyJWT() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnVerifyJWT).toHaveBeenCalledWith(
        fakeToken, fakeCert, { alg: ['RS256'] });
      expect(spyOnVerifyJWT).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an Error if jsrsasign.jws.JWS.verifyJwt() returns "true"',
      (done: Callback) => {
    testMethod((err: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });

  describe('calls callback with an Error if jsrsasign.jws.JWS.verifyJwt()', () => {
    const testError = (done: Callback) => {
      testMethod((err: Error) => {
        expect(err).toBeTruthy();
        done();
      });
    };
    it('returns "false"', (done: Callback) => {
      spyOnVerifyJWT.and.returnValue(false);
      testError(done);
    });
    it('throws an Error', (done: Callback) => {
      spyOnVerifyJWT.and.throwError('verifyJwt()');
      testError(done);
    });
  });
});