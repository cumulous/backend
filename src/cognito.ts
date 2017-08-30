import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { randomBytes } from 'crypto';
import * as stringify from 'json-stable-stringify';
import { v4 as uuid } from 'uuid';

import { ApiError, Request, respond, respondWithError, validate } from './apig';
import { envNames } from './env';
import { log } from './log';
import { Callback, Dict } from './types';

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
    .then(() => getUserByAttribute('email', request.queryStringParameters.email, ['name']))
    .then(user => respond(callback, request, {
      id: user.Username,
      email: getUserAttribute(user.Attributes, 'email'),
      name:  getUserAttribute(user.Attributes, 'name'),
    }))
    .catch(err => respondWithError(callback, request, err));
};

const getUserByAttribute =
    (attributeName: string, attributeValue: string, additionalAttributes: string[] = []) => {

  return cognito.listUsers({
    UserPoolId: process.env[envNames.userPoolId],
    AttributesToGet: [ attributeName ].concat(additionalAttributes),
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

type UserAttribute = CognitoIdentityServiceProvider.Types.AttributeType;

const getUserAttribute = (attributes: UserAttribute[], attributeName: string) =>
  attributes.filter(attribute => attribute.Name === attributeName)[0].Value;

export const getUser = (request: Request, context: any, callback: Callback) => {
  validate(request, 'GET', '/users/{user_id}')
    .then(() => cognito.adminGetUser({
      UserPoolId: process.env[envNames.userPoolId],
      Username: request.pathParameters.user_id,
    }).promise())
    .then(user => respond(callback, request, {
      id: user.Username,
      email: getUserAttribute(user.UserAttributes, 'email'),
      name:  getUserAttribute(user.UserAttributes, 'name'),
    }))
    .catch(err => {
      if (err.code === 'UserNotFoundException') {
        err = new ApiError('Not Found', ['User not found'], 404);
      }
      respondWithError(callback, request, err);
    });
};

export const createClient = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/clients')
    .then(() => createUserPoolClient(request.body.email, request.body.name))
    .then(data => data.UserPoolClient)
    .then(client => respond(callback, request, {
      id: client.ClientId,
      secret: client.ClientSecret,
      email: request.body.email,
      name: request.body.name,
    }))
    .catch(err => {
      if (err.code === 'LimitExceededException') {
        err = new ApiError('Too Many Requests', [
          'Exceeded the maximum number of clients per user pool. ' +
          'Please contact your system administrator to increase this limit.',
        ], 429);
      }
      respondWithError(callback, request, err);
    });
};

const createUserPoolClient = (email: string, name: string) => {
  return cognito.createUserPoolClient({
    UserPoolId: process.env[envNames.userPoolId],
    ClientName: `${email}, ${name}`,
    AllowedOAuthFlowsUserPoolClient: true,
    AllowedOAuthFlows: ['client_credentials'],
    AllowedOAuthScopes: [`${process.env[envNames.apiDomain]}/invoke`],
    GenerateSecret: true,
  }).promise();
}

export const getClient = (request: Request, context: any, callback: Callback) => {
  validate(request, 'GET', '/clients/{client_id}')
    .then(() => describeUserPoolClient(request.pathParameters.client_id))
    .then(data => data.UserPoolClient)
    .then(client => {
      if (!/, /.test(client.ClientName)) {
        throw new ApiError('Not Found', ['Client not found'], 404);
      }
      respond(callback, request, {
        id: request.pathParameters.client_id,
        email: client.ClientName.split(/, /)[0],
        name: client.ClientName.split(/, (.+)/)[1],
      });
    })
    .catch(err => {
      if (err.code === 'ResourceNotFoundException') {
        err = new ApiError('Not Found', ['Client not found'], 404);
      }
      respondWithError(callback, request, err);
    });
};

const describeUserPoolClient = (clientId: string) => {
  return cognito.describeUserPoolClient({
    UserPoolId: process.env[envNames.userPoolId],
    ClientId: clientId,
  }).promise();
}

interface SignUpUserEvent {
  triggerSource: string;
  userName: string;
  request: {
    userAttributes: Dict<string>;
  };
}

export const preSignUp = (newUser: SignUpUserEvent, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => {
      log.debug(stringify(newUser));
      if (newUser.triggerSource === 'PreSignUp_ExternalProvider') {
        return getUserByAttribute('email', newUser.request.userAttributes.email)
          .then(existingUser => linkUsers(newUser.userName, existingUser.Username));
      }
    })
    .then(() => callback(null, newUser))
    .catch(err => {
      log.error(stringify(err));
      callback('User signup is disabled');
    });
};

const linkUsers = (externalUsername: string, internalUsername: string) => {
  return cognito.adminLinkProviderForUser({
    UserPoolId: process.env[envNames.userPoolId],
    SourceUser: {
      ProviderName: externalUsername.split('_')[0],
      ProviderAttributeName: 'Cognito_Subject',
      ProviderAttributeValue: externalUsername.split('_')[1],
    },
    DestinationUser: {
      ProviderName: 'Cognito',
      ProviderAttributeValue: internalUsername,
    },
  }).promise();
};
