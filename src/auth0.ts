import * as jsonpath from 'jsonpath';
export import request = require('request-promise-native');
import { post } from 'request-promise-native';

import { s3 } from './aws';
import { envNames } from './env';
import { Callback, HttpMethod } from './types';
import { promise2 } from './util';

export interface Auth0ClientConfig {
  Domain: string;
  ID: string;
  Secret: string;
};

export const authenticate = (client: Auth0ClientConfig, audience: string) => {
  return Promise.resolve(client)
    .then(client => post('https://' + client.Domain + '/oauth/token', {
      json: true,
      body: {
        grant_type: 'client_credentials',
        client_id: client.ID,
        client_secret: client.Secret,
        audience: audience,
      }}))
    .then((data: any) => data.access_token);
};

export const manageClient = (
    client: Auth0ClientConfig,
    method: HttpMethod,
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
      body: typeof payload === 'string' ? JSON.parse(payload) : payload,
    }));
};

export interface Auth0Request {
  method: HttpMethod;
  endpoint: string[];
  payload?: any;
  datapath?: string;
};

export const manage = (event: Auth0Request, context: any, callback: Callback) => {

  if (event == null || !Array.isArray(event.endpoint)) {
    return callback(Error('Expected non-empty event with method, endpoint[], payload?, datapath?'));
  }
  Promise.resolve()
    .then(() => s3.getObject({
      Bucket: process.env[envNames.auth0SecretBucket],
      Key: process.env[envNames.auth0SecretPath],
    }).promise())
    .then(data => data.Body.toString())
    .then(secret => manageClient({
      Domain: process.env[envNames.auth0Domain],
      ID: process.env[envNames.auth0ClientId],
      Secret: secret,
    }, event.method, event.endpoint.join('/'), event.payload))
    .then(data => event.datapath ? jsonpath.value(data, event.datapath) : data)
    .then(data => callback(null, data))
    .catch(callback);
};

export const rotateAndStoreClientSecret = (secret: string, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => manageClient({
      Domain: process.env[envNames.auth0Domain],
      ID: process.env[envNames.auth0ClientId],
      Secret: secret,
    }, 'POST', `/clients/${process.env[envNames.auth0ClientId]}/rotate-secret`))
    .then((data: any) => s3.putObject({
      Bucket: process.env[envNames.auth0SecretBucket],
      Key: process.env[envNames.auth0SecretPath],
      Body: data.client_secret,
      SSEKMSKeyId: process.env[envNames.encryptionKeyId],
      ServerSideEncryption: 'aws:kms',
    }).promise())
    .then(() => callback())
    .catch(callback);
};

export const createClient = (event: {
    Payload: string,
    Secret?: { Bucket: string, Path: string, EncryptionKeyId: string },
  }, context: any, callback: Callback) => {

  Promise.resolve(event)
    .then(event => promise2(manage, {
        method: 'POST' as HttpMethod,
        endpoint: ['/clients'],
        payload: event.Payload,
      }, null) as Promise<{ client_id: string; client_secret: string }>)
    .then(data => {
        if (event.Secret) {
          return s3.putObject({
            Bucket: event.Secret.Bucket,
            Key: event.Secret.Path,
            Body: data.client_secret,
            SSEKMSKeyId: event.Secret.EncryptionKeyId,
            ServerSideEncryption: 'aws:kms',
          }).promise()
            .then(() => data.client_id);
        } else {
          return data.client_id;
        }
      })
    .then(client_id => callback(null, client_id))
    .catch(callback);
};
