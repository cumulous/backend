import * as helpers from './helpers';
import * as jwt from './jwt';
import { authenticate, getCertificate, verifyJwt } from './jwt';
import { Callback, Dict } from './types';

const jsrsasign = require('jsrsasign');

describe('getCertificate()', () => {
  const fakeDomain = 'tenant.auth0.com';

  it('calls spyOnHttpsRequest() with correct parameters', (done: Callback) => {
    const spyOnHttpsRequest = spyOn(helpers, 'httpsRequest').and.callFake(
        (method: string, Url: string, headers: Dict<string>, body: any, callback: Callback) =>
      callback(null, 'FAKE_CERT 1234'));

    const callback = () => {
      expect(spyOnHttpsRequest).toHaveBeenCalledWith(
        'GET', `https://${fakeDomain}/cer`, null, null, callback);
      expect(spyOnHttpsRequest).toHaveBeenCalledTimes(1);
      done();
    };

    getCertificate(fakeDomain, callback);
  });
});

describe('verifyJwt()', () => {
  const fakeToken = 'ey.ab.cd';
  const fakeCert = 'FAKE_CERT ABCD';

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

describe('authenticate()', () => {
  const fakeDomain = 'tenant.auth0.com';
  const fakeToken = 'ey.ab.cd';
  const fakeCert = 'FAKE_CERT ABCD';

  let spyOnGetCertificate: jasmine.Spy;
  let spyOnVerifyJwt: jasmine.Spy;

  beforeEach(() => {
    spyOnGetCertificate = spyOn(jwt, 'getCertificate')
      .and.callFake((domain: string, callback: Callback) =>
        callback ? callback(null, fakeCert) : null);
    spyOnVerifyJwt = spyOn(jwt, 'verifyJwt')
      .and.callFake((token: string, cert: string, callback: Callback) =>
        callback ? callback(): null);
  });

  const testMethod = (callback: Callback) => {
    authenticate(fakeDomain, fakeToken, callback);
  };

  it('calls jwt.getCertificate() once with correct parameters', (done: Callback) => {
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

  it('immediately calls callback with an Error if jwt.getCertificate() returns an error',
      (done: Callback) => {
    spyOnGetCertificate.and.callFake((domain: string, callback: Callback) =>
      callback ? callback(Error('jwt.getCertificate()')) : null);
    testMethod((err: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      expect(spyOnVerifyJwt).not.toHaveBeenCalled();
      done();
    });
  });

  it('calls callback with "Unauthorized" response if verifyJwt() returns an Error',
      (done: Callback) => {
    spyOnVerifyJwt.and.callFake((token: string, cert: string, callback: Callback) =>
        callback ? callback(Error('verifyJwt()')): null);
    testMethod((err: string) => {
      expect(err).toEqual('Unauthorized');
      done();
    });
  });
});
