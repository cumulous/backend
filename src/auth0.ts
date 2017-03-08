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
  if (client == null) {
    return callback(Error('Expected client config to be defined'));
  } else if (client.Secret == null) {
    return callback(Error('Expected client secret to be defined'));
  }
  httpsRequest('POST', 'https://' + client.Domain + '/oauth/token', {
    'Content-Type': 'application/json',
  }, {
    grant_type: 'client_credentials',
    client_id: client.ID,
    client_secret: client.Secret.Value,
    audience: audience,
  }, callback);
};