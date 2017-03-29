import { getCertificate }  from './auth0';
import { envNames } from './env';
import { Callback } from './types';

const jsrsasign = require('jsrsasign');

export const authorize = (
    event: { authorizationToken: string },
    context: any, callback: Callback) => {

  if (event == null) {
    return callback(Error('Expected non-empty event'));
  }

  getCertificate(process.env[envNames.auth0Domain], (certErr: Error, cert: string) => {
    if (certErr) return callback(certErr);

    verifyJwt(event.authorizationToken, cert, (tokenErr: Error) =>
      callback(tokenErr ? 'Unauthorized' : null));
  });
};

export const verifyJwt = (token: string, cert: string, callback: Callback) => {
  try {
    const isValid = jsrsasign.jws.JWS.verifyJWT(token, cert, { alg: ['RS256'] });
    callback(isValid ? null : Error('Invalid token'));
  } catch (err) {
    callback(err);
  }
};
