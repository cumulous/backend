import { CognitoIdentityServiceProvider } from 'aws-sdk';

import { Callback } from './types';

export const cognito = new CognitoIdentityServiceProvider();

interface UserPoolDomainRequest {
  Domain: string;
  UserPoolId: string;
};

export const createUserPoolDomain = (request: UserPoolDomainRequest, context: any, callback: Callback) => {
  return Promise.resolve()
    .then(() => getDomain(request))
    .then(domain => cognito.createUserPoolDomain(domain).promise()
      .then(() => callback(null, domain)))
    .catch(callback);
};

const getDomain = (request: UserPoolDomainRequest) => ({
  Domain: request.Domain.replace(/\./g, '-'),
  UserPoolId: request.UserPoolId,
});

export const deleteUserPoolDomain = (request: UserPoolDomainRequest, context: any, callback: Callback) => {
  return Promise.resolve()
    .then(() => getDomain(request))
    .then(domain => cognito.deleteUserPoolDomain(domain).promise())
    .then(() => callback())
    .catch(callback);
};

export const updateUserPoolClient = (request: string, context: any, callback: Callback) => {
  return Promise.resolve()
    .then(() => JSON.parse(request))
    .then(request => cognito.updateUserPoolClient(request).promise())
    .then(() => callback())
    .catch(callback);
};
