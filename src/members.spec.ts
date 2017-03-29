const jsrsasign = require('jsrsasign');

import * as jwt from './jwt';
import { getCertificate, verifyJwt } from './jwt';
import { envNames } from './env';
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

    spyOnGetCertificate = spyOn(jwt, 'getCertificate')
      .and.callFake((domain: string, callback: Callback) =>
        callback ? callback(null, fakeCert) : null);
    spyOnVerifyJwt = spyOn(jwt, 'verifyJwt')
      .and.callFake((token: string, cert: string, callback: Callback) =>
        callback ? callback(): null);
  });

  const testMethod = (callback: Callback) => {
    authorize(fakeEvent(), null, callback);
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

  it('immediately calls callback with an Error if jwt.getCertificate() returns an error',
      (done: Callback) => {
    spyOnGetCertificate.and.callFake((domain: string, callback: Callback) =>
      callback ? callback(Error('jwt.getCertificate()')) : null);
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
