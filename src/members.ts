import { getCertificate }  from './auth0';
import { envNames } from './env';
import { Callback } from './types';

export const authorize = (
    event: { authorizationToken: string },
    context: any, callback: Callback) => {

  getCertificate(process.env[envNames.auth0Domain], callback);
};
