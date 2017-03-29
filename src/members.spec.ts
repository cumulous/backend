import * as auth0 from './auth0';
import { getCertificate } from './auth0';
import { envNames } from './env';
import { authorize } from './members';
import { Callback } from './types';
import * as fixtures from './fixtures/values';

describe('authorize()', () => {
  const fakeDomain = 'tenant.auth0.com';

  let fakeEvent = () => ({
    authorizationToken: fixtures.token(),
  });

  let spyOnGetCertificate: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.auth0Domain] = fakeDomain;

    spyOnGetCertificate = spyOn(auth0, 'getCertificate')
      .and.callFake((domain: string, callback: Callback) =>
        callback(null, fixtures.certificate()));
  });

  const testMethod = (callback: Callback) => {
    authorize(fakeEvent(), null, callback);
  };

  it('calls auth0.getCertificate() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnGetCertificate).toHaveBeenCalledWith(fakeDomain, jasmine.any(Function));
      done();
    });
  });
});