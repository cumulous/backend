import { decode, verify } from 'jsonwebtoken';

export const jwksClient = require('jwks-rsa');

import { envNames } from './env';
import { Callback } from './types';
import { promise } from './util';

interface SigningKey {
  publicKey?: string;
  rsaPublicKey?: string;
};

export const getCertificate = (domain: string, kid: string) => {
  return Promise.resolve()
    .then(() => jwksClient({
        jwksUri: `https://${domain}/.well-known/jwks.json`,
        rateLimit: true,
        cache: true,
      }))
    .then(client => promise<string, SigningKey>(client.getSigningKey, kid))
    .then(key => key.publicKey || key.rsaPublicKey);
};

export const authenticate = (domain: string, token: string) => {
  return Promise.resolve()
    .then(() => decode(token, {complete: true}))
    .then((decoded: { header: { kid: string } }) =>
      getCertificate(domain, decoded.header.kid))
    .then(cert => validate(token, cert, domain));
};

const validate = (token: string, cert: string, domain: string) => {
  return verify(token, cert, {
    algorithms: ['RS256'],
    issuer: `https://${domain}`,
    maxAge: `${process.env[envNames.authTokenLifetime]}s`,
    ignoreExpiration: true,
  });
}
