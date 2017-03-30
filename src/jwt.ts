import { decode, verify } from 'jsonwebtoken';

export const jwksClient = require('jwks-rsa');

import { Callback } from './types';

interface SigningKey {
  publicKey?: string;
  rsaPublicKey?: string;
};

export const getCertificate = (domain: string, kid: string) => {

  return Promise.resolve(domain)
    .then(domain => jwksClient({
        jwksUri: `https://${domain}/.well-known/jwks.json`,
        rateLimit: true,
        cache: true,
      }))
    .then(client => new Promise(
        (resolve: (key: SigningKey) => void,
          reject: Callback) =>
      client.getSigningKey(kid, (err: Error, key: SigningKey) => {
        if (err) return reject(err);
        resolve(key);
      })))
    .then(key => key.publicKey || key.rsaPublicKey);
};

export const authenticate = (domain: string, token: string) => {

  return Promise.resolve(token)
    .then(token => decode(token, {complete: true}))
    .then(decoded => getCertificate(domain, decoded.header.kid))
    .then(cert => verify(token, cert, { algorithms: ['RS256'] }));
};
