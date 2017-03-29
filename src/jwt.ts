import { httpsRequest } from './helpers';
import { Callback } from './types';

const jsrsasign = require('jsrsasign');

export const getCertificate = (domain: string, callback: Callback) => {
  httpsRequest('GET', `https://${domain}/cer`, null, null, callback);
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

  getCertificate(domain, (certErr: Error, cert: string) => {
    if (certErr) return callback(certErr);

    verifyJwt(token, cert, (tokenErr: Error) =>
      callback(tokenErr ? 'Unauthorized' : null));
  });
};
