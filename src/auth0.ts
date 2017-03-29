import * as stringify from 'json-stable-stringify';

import { s3 } from './aws';
import { httpsRequest, jsonRequest } from './helpers';
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

export const authenticate = (client: Auth0ClientConfig, audience: string, callback: Callback) => {
  if (client == null) {
    return callback(Error('Expected client config to be defined'));
  } else if (client.Secret == null) {
    return callback(Error('Expected client secret to be defined'));
  }
  jsonRequest('POST', 'https://' + client.Domain + '/oauth/token', {
    'Content-Type': 'application/json',
  }, {
    grant_type: 'client_credentials',
    client_id: client.ID,
    client_secret: client.Secret.Value,
    audience: audience,
  }, (err: Error, data: { access_token: string }) => {
    if (data && data.access_token) {
      callback(null, data.access_token);
    } else {
      callback(err || Error(stringify(data)));
    }
  });
};

export const manage = (
    client: Auth0ClientConfig,
    method: 'GET' | 'POST',
    endpoint: string,
    payload: any,
    callback: Callback) => {

  const baseUrl = 'https://' + client.Domain + '/api/v2';

  authenticate(client, baseUrl + '/', (err: Error, jwt: string) => {
    if (err) return callback(err);

    jsonRequest(method, baseUrl + endpoint, { Authorization: 'Bearer ' + jwt }, payload, callback);
  });
};

export const rotateAndStoreClientSecret = (client: Auth0ClientConfig, context: any, callback: Callback) => {
  manage(client, 'POST', '/clients/' + client.ID + '/rotate-secret', null,
      (err: Error, data: { client_secret: string }) => {
    if (err) return callback(err);
    else if (data == null) return callback(Error('Expected a client response'));

    s3.putObject({
      Bucket: client.Secret.Bucket,
      Key: client.Secret.Path,
      Body: data.client_secret,
      SSEKMSKeyId: client.Secret.EncryptionKeyId,
      ServerSideEncryption: 'aws:kms',
    }, callback);
  });
};

export const getCertificate = (domain: string, callback: Callback) => {
  httpsRequest('GET', `https://${domain}/cer`, null, null, callback);
};
