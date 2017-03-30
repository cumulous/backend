const jsrsasign = require('jsrsasign');
export const jwksClient = require('jwks-rsa');

import { Callback, Dict } from './types';

export const parseTokenInfo = (token: string, callback: Callback) => {
  try {
    callback(null, jsrsasign.jws.JWS.parse(token));
  } catch (err) {
    callback(err);
  }
};

export const parseTokenHeader = (token: string, callback: Callback) => {
  parseTokenInfo(token, (err: Error, tokenInfo: { headerObj: Dict<string> }) => {
    if (err) {
      callback(err);
    } else if (tokenInfo == null) {
      callback(Error('Unable to parse token info'));
    } else {
      callback(null, tokenInfo.headerObj);
    }
  });
};

export const parseKid = (token: string, callback: Callback) => {
  parseTokenHeader(token, (err: Error, tokenHeader: { kid?: string, x5t?: string }) => {
    if (err) {
      callback(err);
    } else if (tokenHeader == null) {
      callback(Error('Unable to parse token header'));
    } else {
      callback(null, tokenHeader.kid || tokenHeader.x5t);
    }
  });
};

export const getCertificate = (domain: string, kid: string, callback: Callback) => {
  Promise.resolve(domain)
    .then(domain => jwksClient({
      jwksUri: `https://${domain}/.well-known/jwks.json`,
      rateLimit: true,
      cache: true,
    }))
    .then(client => client.getSigningKey(kid,
        (err: Error, key: { publicKey?: string, rsaPublicKey?: string }) => {
      if (err) return callback(err);
      callback(null, key.publicKey || key.rsaPublicKey);
    }))
    .catch(callback);
};

export const verifyJwt = (token: string, cert: string, callback: Callback) => {
  try {
    const isValid = jsrsasign.jws.JWS.verifyJWT(token, cert, { alg: ['RS256'] });
    callback(isValid ? null : Error('Invalid token'));
  } catch (err) {
    callback(err);
  }
};

export const authenticate = (domain: string, token: string, callback: Callback) => {

  parseKid(token, (decodeErr: Error, kid: string) => {
    if (decodeErr) return callback('Unauthorized');

    getCertificate(domain, kid, (certErr: Error, cert: string) => {
      if (certErr) return callback(certErr);

      verifyJwt(token, cert, (signErr: Error) =>
        callback(signErr ? 'Unauthorized' : null));
    });
  });
};
