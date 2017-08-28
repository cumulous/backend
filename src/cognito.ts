import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';

import { ApiError, Request, respond, respondWithError, validate } from './apig';
import { envNames } from './env';
import { Callback } from './types';

export const cognito = new CognitoIdentityServiceProvider();

interface UserPoolDomainRequest {
  Domain: string;
  UserPoolId: string;
};

export const createUserPoolDomain = (request: UserPoolDomainRequest, context: any, callback: Callback) => {
  Promise.resolve()
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
  Promise.resolve()
    .then(() => getDomain(request))
    .then(domain => cognito.deleteUserPoolDomain(domain).promise())
    .then(() => callback())
    .catch(callback);
};

export const updateUserPoolClient = (request: string, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => JSON.parse(request))
    .then(request => cognito.updateUserPoolClient(request).promise())
    .then(() => callback())
    .catch(callback);
};

type ResourceServerRequest = CognitoIdentityServiceProvider.Types.DescribeResourceServerRequest;

export const createResourceServer = (request: ResourceServerRequest, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => cognito.createResourceServer({
      UserPoolId: request.UserPoolId,
      Identifier: request.Identifier,
      Name: request.Identifier,
      Scopes: [{
        ScopeName: 'invoke',
        ScopeDescription: 'Invoke ' + request.Identifier,
      }],
    }).promise())
    .then(() => callback(null, {
      Scope: `${request.Identifier}/invoke`,
    }))
    .catch(callback);
};

export const deleteResourceServer = (request: ResourceServerRequest, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => cognito.deleteResourceServer({
      UserPoolId: request.UserPoolId,
      Identifier: request.Identifier,
    }).promise())
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
    .catch(err => {
      if (err.code === 'UsernameExistsException') {
        err = new ApiError('Conflict', ['User with this email already exists'], 409);
      }
      respondWithError(callback, request, err);
    });
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
      Name: 'email_verified',
      Value: 'true',
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

export const listUser = (request: Request, context: any, callback: Callback) => {
  validate(request, 'GET', '/users')
    .then(() => getUserByAttribute('email', request.queryStringParameters.email))
    .then(user => respond(callback, request, {
      id: user.Username,
      email: getUserAttribute(user, 'email'),
      name:  getUserAttribute(user, 'name'),
    }))
    .catch(err => respondWithError(callback, request, err));
};

const getUserByAttribute = (attributeName: string, attributeValue: string) => {
  return cognito.listUsers({
    UserPoolId: process.env[envNames.userPoolId],
    AttributesToGet: [ 'email', 'name' ],
    Filter: `${attributeName} = "${attributeValue}"`,
  }).promise()
    .then(data => {
      const user = data.Users.filter(user => user.UserStatus !== 'EXTERNAL_PROVIDER')[0];
      if (user == null) {
        throw new ApiError('Not Found', ['User not found'], 404);
      }
      return user;
    });
}

type User = CognitoIdentityServiceProvider.Types.UserType;

const getUserAttribute = (user: User, attributeName: string) =>
  user.Attributes.filter(attribute => attribute.Name === attributeName)[0].Value;
