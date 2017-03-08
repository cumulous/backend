import { httpsRequest } from './helpers';
import { Callback } from './types';

export interface Auth0ClientConfig {
  Domain: string;
  ID: string;
  Secret: {
    Value: string;
    Bucket: string;
    Path: string;
  };
}

export const authenticate = (client: Auth0ClientConfig, audience: string, callback: Callback) => {
  httpsRequest('POST', 'https://' + client.Domain + '/oauth/token', {
    'Content-Type': 'application/json',
  }, {
    grant_type: 'client_credentials',
    client_id: client.ID,
    client_secret: client.Secret.Value,
    audience: audience,
  }, callback);
};