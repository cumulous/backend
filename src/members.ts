import * as stringify from 'json-stable-stringify';

import { authenticate } from './jwt';
import { envNames } from './env';
import { log } from './log';
import { Callback, Dict } from './types';

interface TokenPayload {
  sub: string;
}

export const authorize = (event: { authorizationToken: string, methodArn: string },
                        context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => authenticate(process.env[envNames.authDomain], event.authorizationToken))
    .then((payload: TokenPayload) => getPolicy(payload.sub, event.methodArn))
    .then(policy => {
      policy.context.accessToken = event.authorizationToken;
      callback(null, policy);
    })
    .catch(err => callback('Unauthorized'));
};

type PolicyEffect = 'Allow' | 'Deny';

export interface Policy {
  principalId: string;
  policyDocument: {
    Version: string;
    Statement: {
      Action: string;
      Effect: PolicyEffect;
      Resource: string | string[];
    }[];
  };
  context?: Dict<any>;
};

export const getPolicy = (principalId: string, methodArn: string): Promise<Policy> => {
  if (!principalId) {
    return Promise.reject(Error('Expected non-empty principalId'));
  } else {
    return Promise.resolve(methodArn)
      .then(methodArn => methodArn.split('/', 2).join('/'))
      .then(baseArn => ({
        principalId: principalId,
        policyDocument: {
          Version: '2012-10-17',
          Statement: [{
            Action: 'execute-api:Invoke',
            Effect: 'Allow' as PolicyEffect,
            Resource: [
              'GET    /',
              'POST   /projects',
              'GET    /projects',
              'POST   /users',
              'GET    /users',
              'GET    /users/*',
              `PATCH  /users/${principalId}`,
              `POST   /users/${principalId}/verification`,
              'POST   /clients',
              'GET    /clients/*',
              'GET    /datasets',
              'POST   /datasets',
              'POST   /datasets/*/credentials',
              'PUT    /datasets/*/storage',
              'POST   /pipelines',
              'GET    /analyses',
              'POST   /analyses',
              'POST   /analyses/*/execution',
              'DELETE /analyses/*/execution',
            ].map(endpoint =>
              `${baseArn}/${endpoint.replace(/ /g, '')}`
            ),
          }],
        },
        context: {},
      }));
  }
};
