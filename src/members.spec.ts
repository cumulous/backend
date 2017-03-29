import * as jwt from './jwt';
import { envNames } from './env';
import { authorize } from './members';
import { Callback } from './types';

describe('authorize()', () => {
  const fakeDomain = 'tenant.auth0.com';
  const fakeToken = 'ey.ab.cd';

  let fakeEvent = () => ({
    authorizationToken: fakeToken,
  });

  let spyOnAuthenticate: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.auth0Domain] = fakeDomain;

    spyOnAuthenticate = spyOn(jwt, 'authenticate')
      .and.callFake((domain: string, token: string, callback: Callback) =>
        callback ? callback(): null);
  });

  const testMethod = (callback: Callback) => {
    authorize(fakeEvent(), null, callback);
  };

  it('calls jwt.authenticate() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnAuthenticate).toHaveBeenCalledWith(
        fakeDomain, fakeToken, jasmine.any(Function));
      expect(spyOnAuthenticate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error if jwt.authenticate() does not return an error',
      (done: Callback) => {
    testMethod((err: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });

  describe('immediately calls callback with an Error if', () => {
    const testError = (done: Callback) => (err: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      expect(spyOnAuthenticate).not.toHaveBeenCalled();
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

  it('calls callback with an Error if jwt.authenticate() returns an Error',
      (done: Callback) => {
    spyOnAuthenticate.and.callFake((domain: string, token: string, callback: Callback) =>
      callback ? callback(Error('jwt.authenticate()')) : null);
    testMethod((err: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      done();
    });
  });

  it('calls callback with "Unauthorized" response if jwt.authenticate() returns "Unauthorized"',
      (done: Callback) => {
    spyOnAuthenticate.and.callFake((domain: string, token: string, callback: Callback) =>
        callback ? callback('Unauthorized'): null);
    testMethod((err: string) => {
      expect(err).toEqual('Unauthorized');
      done();
    });
  });
});
