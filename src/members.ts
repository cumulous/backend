import { getCertificate }  from './auth0';
import { envNames } from './env';
import { verifyJwt } from './jwt';
import { Callback } from './types';

export const authorize = (
    event: { authorizationToken: string },
    context: any, callback: Callback) => {

  if (event == null) {
    return callback(Error('Expected non-empty event'));
  }

  getCertificate(process.env[envNames.auth0Domain], (err: Error, cert: string) => {
    if (err) return callback(err);

    let isValid = false;
    try {
      isValid = verifyJwt(event.authorizationToken, cert, { alg: ['RS256'] });
    } catch (e) {
    } finally {
      callback(isValid ? null : 'Unauthorized');
    }
  });
};
