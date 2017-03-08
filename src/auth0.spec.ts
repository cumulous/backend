import * as auth0 from './auth0';
import { Auth0ClientConfig, authenticate, manage } from './auth0';
import { fakeResolve } from './fixtures/support';
import * as helpers from './helpers';
import { Callback, Dict } from './types';

const fakeDomain = 'account.auth0.com';
const fakeCloudFormationClientId = '012345abcdEFGH';
const fakeCloudFormationClientSecret = 'fak3-s3cr3t';
const fakeCloudFormationToken = 'ey.12.34';

describe('authenticate', () => {
  let fakeBaseUrl: string;
  let fakeClientConfig: Auth0ClientConfig;

  let spyOnHttpsRequest: jasmine.Spy;

  beforeEach(() => {
    fakeBaseUrl = 'https://' + fakeDomain;
    fakeClientConfig = {
      Domain: fakeDomain,
      ID: fakeCloudFormationClientId,
      Secret: {
        Value: fakeCloudFormationClientSecret,
      },
    };

    spyOnHttpsRequest = spyOn(helpers, 'httpsRequest').and.callFake(
        (method: 'POST', Url: string, headers: Dict<string>, body: any, callback: Callback) =>
      callback());
  });

  describe('calls', () => {
    it('httpsRequest() with correct parameters', (done: Callback) => {
      const callback = () => {
        expect(spyOnHttpsRequest).toHaveBeenCalledWith(
          'POST', fakeBaseUrl + '/oauth/token', {
            'Content-Type': 'application/json',
          }, {
            grant_type: 'client_credentials',
            audience: fakeBaseUrl,
            client_id: fakeCloudFormationClientId,
            client_secret: fakeCloudFormationClientSecret,
          }, callback);
        expect(spyOnHttpsRequest).toHaveBeenCalledTimes(1);
        done();
      };
      authenticate(fakeClientConfig, fakeBaseUrl, callback);
    });
    describe('callback with an error if client', () => {
      afterEach((done: Callback) => {
        authenticate(fakeClientConfig, fakeBaseUrl, (err: Error) => {
          expect(err).toBeTruthy();
          done();
        });
      });
      describe('is', () => {
        it('undefined', () => {
          fakeClientConfig = undefined;
        });
        it('null', () => {
          fakeClientConfig = null;
        });
      });
      describe('secret config is', () => {
        it('undefined', () => {
          delete fakeClientConfig.Secret;
        });
        it('null', () => {
          fakeClientConfig.Secret = null;
        });
      });
    });
  });
});

describe('manage', () => {
  const fakeManageMethod = 'POST';
  const fakeManageEndpoint = '/clients';

  let fakeBaseUrl: string;
  let fakeClientConfig: () => Auth0ClientConfig;
  let fakeManagePayload: () => any;

  let spyOnAuthenticate: jasmine.Spy;
  let spyOnHttpsRequest: jasmine.Spy;

  beforeEach(() => {
    fakeBaseUrl = 'https://' + fakeDomain + '/api/v2';
    fakeClientConfig = () => ({
      Domain: fakeDomain,
      ID: fakeCloudFormationClientId,
      Secret: {
        Value: fakeCloudFormationClientSecret,
      },
    });
    fakeManagePayload = () => ({
      fake: 'input',
    });

    spyOnAuthenticate = spyOn(auth0, 'authenticate').and.callFake(
        (client: Auth0ClientConfig, audience: string, callback: Callback) =>
      callback(null, fakeCloudFormationToken));
    spyOnHttpsRequest = spyOn(helpers, 'httpsRequest').and.callFake(
        (method: string, Url: string, headers: Dict<string>, body: any, callback: Callback) =>
      callback());
  });

  const testManage = (callback: Callback) => {
    manage(fakeClientConfig(), fakeManageMethod, fakeManageEndpoint, fakeManagePayload(), callback);
  };

  describe('calls', () => {
    it('authenticate() with correct parameters', (done: Callback) => {
      const callback = () => {
        expect(spyOnAuthenticate).toHaveBeenCalledWith(
          fakeClientConfig(), fakeBaseUrl, jasmine.any(Function));
        expect(spyOnAuthenticate).toHaveBeenCalledTimes(1);
        done();
      };
      testManage(callback);
    });
    it('callback with an error if authenticate() returns an error', (done: Callback) => {
      spyOnAuthenticate.and.callFake((client: Auth0ClientConfig, audience: string, callback: Callback) =>
        callback(Error('authenticate()')));
      const callback = (err: Error) => {
        expect(err).toBeTruthy();
        done();
      };
      testManage(callback);
    });
    it('httpsRequest() with correct parameters', (done: Callback) => {
      const callback = (err: Error) => {
        expect(spyOnHttpsRequest).toHaveBeenCalledWith(
          fakeManageMethod, fakeBaseUrl + fakeManageEndpoint, {
            Authorization: 'Bearer ' + fakeCloudFormationToken,
          }, fakeManagePayload(), callback);
        expect(spyOnHttpsRequest).toHaveBeenCalledTimes(1);
        done();
      };
      testManage(callback);
    });
  });
});