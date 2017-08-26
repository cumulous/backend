import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';

import { Request, respond, respondWithError, validate } from './apig';
import { envNames } from './env';
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

export const createUser = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/users')
    .then(() => {
      const userId = uuid();
      const tempPass = generatePassword();
      const newPass = generatePassword();
      return adminCreateUser(userId, tempPass, request.body.email, request.body.name)
        .then(() => adminInitiateAuth(userId, tempPass))
        .then(data => adminRespondToAuthChallenge(userId, newPass, data.Session))
        .then(() => respond(callback, request, {
          id: userId,
          email: request.body.email,
          name: request.body.name,
        }));
    })
    .catch(err => respondWithError(callback, request, err));
};

const generatePassword = () =>
  randomBytes(192).toString('base64');

const adminCreateUser = (username: string, password: string, email: string, name: string) => {
  return cognito.adminCreateUser({
    UserPoolId: process.env[envNames.userPoolId],
    Username: username,
    TemporaryPassword: password,
    UserAttributes: [{
      Name: 'email',
      Value: email,
    },{
      Name: 'name',
      Value: name,
    }],
    MessageAction: 'SUPPRESS',
  }).promise();
};

const adminInitiateAuth = (username: string, password: string) => {
  return cognito.adminInitiateAuth({
    UserPoolId: process.env[envNames.userPoolId],
    ClientId: process.env[envNames.authClientId],
    AuthFlow: 'ADMIN_NO_SRP_AUTH',
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  }).promise();
};

const adminRespondToAuthChallenge = (username: string, password: string, session: string) => {
  return cognito.adminRespondToAuthChallenge({
    UserPoolId: process.env[envNames.userPoolId],
    ClientId: process.env[envNames.authClientId],
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    ChallengeResponses: {
      USERNAME: username,
      NEW_PASSWORD: password,
    },
    Session: session,
  }).promise();
};
