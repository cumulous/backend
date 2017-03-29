import * as auth0 from './auth0';
import { getCertificate } from './auth0';
import { envNames } from './env';
import * as jwt from './jwt';
import { authorize } from './members';
import { Callback } from './types';

describe('authorize()', () => {
  const fakeDomain = 'tenant.auth0.com';
  const fakeToken = 'ey.ab.cd';
  const fakeCert = 'FAKE_CERT ABCD';

  let fakeEvent = () => ({
    authorizationToken: fakeToken,
  });

  let spyOnGetCertificate: jasmine.Spy;
  let spyOnVerifyJwt: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.auth0Domain] = fakeDomain;

    spyOnGetCertificate = spyOn(auth0, 'getCertificate')
      .and.callFake((domain: string, callback: Callback) => callback(null, fakeCert));
    spyOnVerifyJwt = spyOn(jwt, 'verifyJwt').and.returnValue(true);
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

  it('calls verifyJWT() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnVerifyJwt).toHaveBeenCalledWith(
        fakeToken, fakeCert, { alg: ['RS256'] });
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
      callback(Error('auth0.getCertificate()')));
    testMethod((err: Error | string) => {
      expect(err).toBeTruthy();
      expect(err).not.toEqual('Unauthorized');
      expect(spyOnVerifyJwt).not.toHaveBeenCalled();
      done();
    });
  });

  describe('calls callback with "Unauthorized" if', () => {
    const testError = (done: Callback) => {
      testMethod((err: string) => {
        expect(err).toEqual('Unauthorized');
        done();
      });
    };
    it('verifyJwt() returns "false"', (done: Callback) => {
      spyOnVerifyJwt.and.returnValue(false);
      testError(done);
    });
    it('verifyJwt() throws an Error', (done: Callback) => {
      spyOnVerifyJwt.and.throwError('verifyJwt()');
      testError(done);
    });
  });
});
