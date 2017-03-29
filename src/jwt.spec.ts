import * as helpers from './helpers';
import { getCertificate, verifyJwt } from './jwt';
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
