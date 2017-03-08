import * as auth0 from './auth0';
import { Auth0ClientConfig, authenticate, manage } from './auth0';
import { fakeResolve } from './fixtures/support';
import * as helpers from './helpers';
import { Callback, Dict } from './types';

const fakeAuth0Domain = 'account.auth0.com';
const fakeAuth0CloudFormationClientId = '012345abcdEFGH';
const fakeAuth0CloudFormationClientSecret = 'fak3-s3cr3t';
const fakeAuth0CloudFormationToken = 'ey.12.34';

describe('authenticate', () => {
  let fakeAuth0BaseUrl: string;
  let fakeClientConfig: Auth0ClientConfig;

  let spyOnHttpsRequest: jasmine.Spy;

  beforeEach(() => {
    fakeAuth0BaseUrl = 'https://' + fakeAuth0Domain;
    fakeClientConfig = {
      Domain: fakeAuth0Domain,
      ID: fakeAuth0CloudFormationClientId,
      Secret: {
        Value: fakeAuth0CloudFormationClientSecret,
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
          'POST', fakeAuth0BaseUrl + '/oauth/token', {
            'Content-Type': 'application/json',
          }, {
            grant_type: 'client_credentials',
            audience: fakeAuth0BaseUrl,
            client_id: fakeAuth0CloudFormationClientId,
            client_secret: fakeAuth0CloudFormationClientSecret,
          }, callback);
        expect(spyOnHttpsRequest).toHaveBeenCalledTimes(1);
        done();
      };
      authenticate(fakeClientConfig, fakeAuth0BaseUrl, callback);
    });
    describe('callback with an error if client', () => {
      afterEach((done: Callback) => {
        authenticate(fakeClientConfig, fakeAuth0BaseUrl, (err: Error) => {
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

  let fakeAuth0BaseUrl: string;
  let fakeClientConfig: () => Auth0ClientConfig;
  let fakeManagePayload: () => any;

  let spyOnAuthenticate: jasmine.Spy;
  let spyOnHttpsRequest: jasmine.Spy;

  beforeEach(() => {
    fakeAuth0BaseUrl = 'https://' + fakeAuth0Domain + '/api/v2';
    fakeClientConfig = () => ({
      Domain: fakeAuth0Domain,
      ID: fakeAuth0CloudFormationClientId,
      Secret: {
        Value: fakeAuth0CloudFormationClientSecret,
      },
    });
    fakeManagePayload = () => ({
      fake: 'input',
    });

    spyOnAuthenticate = spyOn(auth0, 'authenticate').and.callFake(
        (client: Auth0ClientConfig, audience: string, callback: Callback) =>
      callback(null, fakeAuth0CloudFormationToken));
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
          fakeClientConfig(), fakeAuth0BaseUrl, jasmine.any(Function));
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
          fakeManageMethod, fakeAuth0BaseUrl + fakeManageEndpoint, {
            Authorization: 'Bearer ' + fakeAuth0CloudFormationToken,
          }, fakeManagePayload(), callback);
        expect(spyOnHttpsRequest).toHaveBeenCalledTimes(1);
        done();
      };
      testManage(callback);
    });
  });
});