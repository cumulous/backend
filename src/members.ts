import { authenticate } from './jwt';
import { envNames } from './env';
import { Callback, Dict } from './types';

export const authorize = (event: { authorizationToken: string, methodArn: string },
                        context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => authenticate(process.env[envNames.auth0Domain], event.authorizationToken))
    .then((payload: Dict<string>) => getPolicy(payload.sub, event.methodArn))
    .then(policy => callback(null, policy))
    .catch(err => callback('Unauthorized'));
};

export interface Policy {
  principalId: string;
  policyDocument: {
    Version: string;
    Statement: [{
      Action: string;
      Effect: 'Allow' | 'Deny';
      Resource: string;
    }];
  }
  context?: Dict<any>;
};

export const getPolicy = (principalId: string, methodArn: string): Promise<Policy> => {
  if (!principalId) {
    return Promise.reject(Error('Expected non-empty principalId'));
  } else if (!methodArn) {
    return Promise.reject(Error('Expected non-empty methodArn'));
  } else {
    return Promise.resolve({
      principalId: principalId,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: methodArn,
        }],
      },
    });
  }
};