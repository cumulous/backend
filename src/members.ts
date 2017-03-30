import { authenticate } from './jwt';
import { envNames } from './env';
import { Callback } from './types';

export const authorize = (event: { authorizationToken: string }, context: any, callback: Callback) => {

  Promise.resolve(event)
    .then(event => authenticate(process.env[envNames.auth0Domain], event.authorizationToken))
    .then(payload => callback())
    .catch(err => callback('Unauthorized'));
};
