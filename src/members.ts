import * as stringify from 'json-stable-stringify';

import { authenticate } from './jwt';
import { envNames } from './env';
import { log } from './log';
import { Callback, Dict } from './types';

export const authorize = (event: { authorizationToken: string, methodArn: string },
                        context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => authenticate(process.env[envNames.auth0Domain], event.authorizationToken))
    .then((payload: Dict<any>) => getPolicy(payload.sub, payload.exp, event.methodArn))
    .then(policy => {
      log.debug(stringify(policy));
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

export const getPolicy = (principalId: string, expiresAt: number, methodArn: string): Promise<Policy> => {
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
              `${baseArn}/GET/`,
              `${baseArn}/GET/weblogin`,
              `${baseArn}/POST/datasets`,
            ],
          }],
        },
        context: {
          expiresAt: expiresAt,
        },
      }));
  }
};
