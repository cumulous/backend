import { authenticate } from './jwt';
import { envNames } from './env';
import { Callback } from './types';

export const authorize = (
    event: { authorizationToken: string },
    context: any, callback: Callback) => {

  if (event == null) {
    return callback(Error('Expected non-empty event'));
  }

  authenticate(process.env[envNames.auth0Domain], event.authorizationToken, callback);
};
