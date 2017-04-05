import * as stringify from 'json-stable-stringify';

import { s3 } from './aws';
export import request = require('request-promise-native');
import { post } from 'request-promise-native';
import { Callback } from './types';

export interface Auth0ClientConfig {
  Domain: string;
  ID: string;
  Secret: {
    Value: string;
    Bucket?: string;
    Path?: string;
    EncryptionKeyId?: string;
  };
}

export const authenticate = (client: Auth0ClientConfig, audience: string) => {
  return Promise.resolve(client)
    .then(client => post('https://' + client.Domain + '/oauth/token', {
      json: true,
      body: {
        grant_type: 'client_credentials',
        client_id: client.ID,
        client_secret: client.Secret.Value,
        audience: audience,
      }}))
    .then((data: any) => data.access_token);
};

export const manageClient = (
    client: Auth0ClientConfig,
    method: 'GET' | 'POST',
    endpoint: string,
    payload?: any) => {

  return Promise.resolve(client)
    .then(client => authenticate(client, `https://${client.Domain}/api/v2/`))
    .then(token => request(`https://${client.Domain}/api/v2` + endpoint, {
      method: method,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      json: true,
      body: payload,
    }));
};

export const rotateAndStoreClientSecret = (client: Auth0ClientConfig, context: any, callback: Callback) => {
  Promise.resolve(client)
    .then(client => manageClient(client, 'POST', `/clients/${client.ID}/rotate-secret`))
    .then((data: any) => s3.putObject({
      Bucket: client.Secret.Bucket,
      Key: client.Secret.Path,
      Body: data.client_secret,
      SSEKMSKeyId: client.Secret.EncryptionKeyId,
      ServerSideEncryption: 'aws:kms',
    }).promise())
    .then(() => callback())
    .catch(callback);
};
