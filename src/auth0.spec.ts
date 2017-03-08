import { Auth0ClientConfig, authenticate } from './auth0';
import { fakeResolve } from './fixtures/support';
import * as helpers from './helpers';
import { Callback, Dict } from './types';

describe('authenticate', () => {
  const fakeAuth0Domain = 'account.auth0.com';
  const fakeAuth0CloudFormationClientId = '012345abcdEFGH';
  const fakeAuth0CloudFormationClientSecret = 'fak3-s3cr3t';

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
        Bucket: '',
        Path: '',
      },
    };

    spyOnHttpsRequest = spyOn(helpers, 'httpsRequest').and.callFake(
        (method: 'POST', Url: string, headers: Dict<string>, body: any, callback: Callback) =>
      callback());
  });

  it('calls httpsRequest() with correct parameters', (done: Callback) => {
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
});