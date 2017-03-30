import { decode, verify } from 'jsonwebtoken';

export const jwksClient = require('jwks-rsa');

import { Callback } from './types';

interface SigningKey {
  publicKey?: string;
  rsaPublicKey?: string;
};

export const getCertificate = (domain: string, kid: string, callback: Callback) => {

  Promise.resolve(domain)
    .then(domain => jwksClient({
      jwksUri: `https://${domain}/.well-known/jwks.json`,
      rateLimit: true,
      cache: true,
    }))
    .then(client => client.getSigningKey(kid, (err: Error, key: SigningKey) => {
      if (err) return callback(err);

      callback(null, key.publicKey || key.rsaPublicKey);
    }))
    .catch(callback);
};

export const authenticate = (domain: string, token: string, callback: Callback) => {

  Promise.resolve(token)
    .then(decode)
    .then(decoded =>
      getCertificate(domain, decoded.header.kid, (err: Error, cert: string) => {
        if (err) throw err;

        verify(token, cert, { algorithms: ['RS256'] }, (err: Error) => {
          if (err) throw err;
          callback();
        });
      }))
    .catch(err => callback('Unauthorized'));
};