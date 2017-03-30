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
  let fakePayload = () => ({
    sub: 'abcd',
  });

  let spyOnAuthenticate: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.auth0Domain] = fakeDomain;

    spyOnAuthenticate = spyOn(jwt, 'authenticate')
      .and.returnValue(Promise.resolve(fakePayload()));
  });

  const testMethod = (callback: Callback) => {
    authorize(fakeEvent(), null, callback);
  };

  it('calls jwt.authenticate() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnAuthenticate).toHaveBeenCalledWith(fakeDomain, fakeToken);
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

  describe('immediately calls callback with "Unauthorized" response if', () => {
    const testError = (done: Callback) => (err: string) => {
      expect(err).toEqual('Unauthorized');
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

  it('calls callback with "Unauthorized" response if jwt.authenticate() produces an error',
      (done: Callback) => {
    spyOnAuthenticate.and.returnValue(Promise.reject(Error('jwt.authenticate()')));
    testMethod(err => {
      expect(err).toEqual('Unauthorized');
      done();
    });
  });
});
