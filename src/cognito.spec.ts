import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import * as apig from './apig';
import { ajv, ApiError } from './apig';
import { cognito, createUserPoolDomain, deleteUserPoolDomain, updateUserPoolClient,
         createResourceServer, deleteResourceServer,
         createUser, listUser, getUser, preSignUp,
         createClient, getClient,
} from './cognito';
import { envNames } from './env';
import { fakeReject, fakeResolve, testError } from './fixtures/support';
import { Callback } from './types';

const fakeUserPoolId = 'fake-user-pool-id';
const fakeWebDomain = 'fake.web.domain';
const fakeUserPoolDomainPrefix = 'fake-web-domain';
const fakeEmail = 'fake-email@example.org';
const fakeIdentityName = 'Fake Identity Name';
const fakeUserId = uuid();

const fakeUserPoolDomainRequest = () => ({
  Domain: fakeWebDomain,
  UserPoolId: fakeUserPoolId,
});

const fakeUserPoolDomainResponse = () => ({
  Domain: fakeUserPoolDomainPrefix,
  UserPoolId: fakeUserPoolId,
});

describe('cognito.createUserPoolDomain()', () => {
  let spyOnCreateDomain: jasmine.Spy;

  beforeEach(() => {
    spyOnCreateDomain = spyOn(cognito, 'createUserPoolDomain')
      .and.returnValue(fakeResolve());
  })

  describe('calls CognitoIdentityServiceProvider.createUserPoolDomain() once with correct parameters', () => {
    let request: any;
    it('when request.Domain contains dots', () => {
      request = fakeUserPoolDomainRequest();
    });
    it('when request.Domain does not contain dots', () => {
      request = fakeUserPoolDomainResponse();
    });
    afterEach((done: Callback) => {
      createUserPoolDomain(request, null, () => {
        expect(spyOnCreateDomain).toHaveBeenCalledWith({
          Domain: fakeUserPoolDomainPrefix,
          UserPoolId: fakeUserPoolId,
        });
        expect(spyOnCreateDomain).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  describe('calls callback with correct parameters', () => {
    let request: any;

    describe('for a successful request', () => {
      it('for a successful request', () => {
        request = fakeUserPoolDomainRequest();
      });
      it('for a successful request when input domain does not contain dots', () => {
        request = fakeUserPoolDomainResponse();
      });
      afterEach((done: Callback) => {
        createUserPoolDomain(request, null, (err?: Error, data?: any) => {
          expect(err).toBeFalsy();
          expect(data).toEqual(fakeUserPoolDomainResponse());
          done();
        });
      });
    });

    describe('if', () => {
      let after: () => void;

      beforeEach(() => {
        request = fakeUserPoolDomainRequest();
        after = () => {
          expect(spyOnCreateDomain).not.toHaveBeenCalled();
        };
      });

      it('request is undefined', () => request = undefined);
      it('request is undefined', () => request = null);
      it('request.Domain is undefined', () => request.Domain = undefined);
      it('request.Domain is null', () => request.Domain = null);
      it('request.Domain is not a string', () => request.Domain = {});

      it('CognitoIdentityServiceProvider.createUserPoolDomain() produces an error', () => {
        spyOnCreateDomain.and.returnValue(
          fakeReject('CognitoIdentityServiceProvider.createUserPoolDomain()')
        );
        after = () => {};
      });

      afterEach((done: Callback) => {
        testError(createUserPoolDomain, request, done);
        after();
      });
    });
  });
});

describe('cognito.deleteUserPoolDomain()', () => {
  let spyOnDeleteDomain: jasmine.Spy;

  beforeEach(() => {
    spyOnDeleteDomain = spyOn(cognito, 'deleteUserPoolDomain')
      .and.returnValue(fakeResolve());
  })

  describe('calls CognitoIdentityServiceProvider.deleteUserPoolDomain() once with correct parameters', () => {
    let request: any;
    it('when request.Domain contains dots', () => {
      request = fakeUserPoolDomainRequest();
    });
    it('when request.Domain does not contain dots', () => {
      request = fakeUserPoolDomainResponse();
    });
    afterEach((done: Callback) => {
      deleteUserPoolDomain(request, null, () => {
        expect(spyOnDeleteDomain).toHaveBeenCalledWith({
          Domain: fakeUserPoolDomainPrefix,
          UserPoolId: fakeUserPoolId,
        });
        expect(spyOnDeleteDomain).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  describe('calls callback with correct parameters', () => {
    it('for a successful request', (done: Callback) => {
      testError(deleteUserPoolDomain, fakeUserPoolDomainRequest(), done, false);
    });

    describe('if', () => {
      let request: any;
      let after: () => void;

      beforeEach(() => {
        request = fakeUserPoolDomainRequest();
        after = () => {
          expect(spyOnDeleteDomain).not.toHaveBeenCalled();
        };
      });

      it('request is undefined', () => request = undefined);
      it('request is undefined', () => request = null);
      it('request.Domain is undefined', () => request.Domain = undefined);
      it('request.Domain is null', () => request.Domain = null);
      it('request.Domain is not a string', () => request.Domain = {});

      it('CognitoIdentityServiceProvider.deleteUserPoolDomain() produces an error', () => {
        spyOnDeleteDomain.and.returnValue(
          fakeReject('CognitoIdentityServiceProvider.deleteUserPoolDomain()')
        );
        after = () => {};
      });

      afterEach((done: Callback) => {
        testError(deleteUserPoolDomain, request, done);
        after();
      });
    });
  });
});

describe('cognito.updateUserPoolClient()', () => {
  const fakeClientId = 'fake-client-id';

  const fakeConfig = () => ({
    UserPoolId: fakeUserPoolId,
    ClientId: fakeClientId,
    AllowedOAuthFlowsUserPoolClient: false,
  });

  const fakeRequest = () => stringify(fakeConfig());

  let spyOnUpdateClient: jasmine.Spy;

  beforeEach(() => {
    spyOnUpdateClient = spyOn(cognito, 'updateUserPoolClient')
      .and.returnValue(fakeResolve());
  })

  it('calls CognitoIdentityServiceProvider.updateUserPoolClient() once with correct parameters', (done: Callback) => {
    updateUserPoolClient(fakeRequest(), null, () => {
      expect(spyOnUpdateClient).toHaveBeenCalledWith(fakeConfig());
      expect(spyOnUpdateClient).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls callback with correct parameters', () => {
    it('for a successful request', (done: Callback) => {
      testError(updateUserPoolClient, fakeRequest(), done, false);
    });
    it('if request could not be parsed', (done: Callback) => {
      updateUserPoolClient(fakeRequest().substr(1), null, (err?: Error) => {
        expect(err).toBeTruthy();
        expect(spyOnUpdateClient).not.toHaveBeenCalled();
        done();
      });
    });
    it('if CognitoIdentityServiceProvider.updateUserPoolClient() produces an error', (done: Callback) => {
      spyOnUpdateClient.and.returnValue(
        fakeReject('CognitoIdentityServiceProvider.updateUserPoolClient()')
      );
      testError(updateUserPoolClient, fakeRequest(), done);
    });
  });
});

describe('cognito.createResourceServer()', () => {
  const fakeIdentifier = 'api.example.org';

  const fakeRequest = () => ({
    Identifier: fakeIdentifier,
    UserPoolId: fakeUserPoolId,
  });

  let spyOnCreateResourceServer: jasmine.Spy;

  beforeEach(() => {
    spyOnCreateResourceServer = spyOn(cognito, 'createResourceServer')
      .and.returnValue(fakeResolve());
  });

  it('calls CognitoIdentityServiceProvider.createResourceServer() once with correct parameters', (done: Callback) => {
    createResourceServer(fakeRequest(), null, () => {
      expect(spyOnCreateResourceServer).toHaveBeenCalledWith({
        Identifier: fakeIdentifier,
        Name: fakeIdentifier,
        UserPoolId: fakeUserPoolId,
        Scopes: [{
          ScopeDescription: jasmine.any(String),
          ScopeName: 'invoke',
        }],
      });
      expect(spyOnCreateResourceServer).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls callback with correct parameters', () => {
    it('for a successful request', (done: Callback) => {
      createResourceServer(fakeRequest(), null, (err?: Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual({
          Scope: fakeIdentifier + '/invoke',
        });
        done();
      });
    });
    describe('if request is', () => {
      let request: any;
      it('undefined', () => request = undefined);
      it('null', () => request = null);
      afterEach((done: Callback) => {
        testError(createResourceServer, request, () => {
          expect(spyOnCreateResourceServer).not.toHaveBeenCalled();
          done();
        });
      });
    });
    it('if CognitoIdentityServiceProvider.createResourceServer() produces an error', (done: Callback) => {
      spyOnCreateResourceServer.and.returnValue(
        fakeReject('CognitoIdentityServiceProvider.createResourceServer()')
      );
      testError(createResourceServer, fakeRequest(), done);
    });
  });
});

describe('cognito.deleteResourceServer()', () => {
  const fakeIdentifier = 'api.example.org';

  const fakeRequest = () => ({
    Identifier: fakeIdentifier,
    UserPoolId: fakeUserPoolId,
  });

  let spyOnDeleteResourceServer: jasmine.Spy;

  beforeEach(() => {
    spyOnDeleteResourceServer = spyOn(cognito, 'deleteResourceServer')
      .and.returnValue(fakeResolve());
  });

  it('calls CognitoIdentityServiceProvider.deleteResourceServer() once with correct parameters', (done: Callback) => {
    deleteResourceServer(fakeRequest(), null, () => {
      expect(spyOnDeleteResourceServer).toHaveBeenCalledWith({
        Identifier: fakeIdentifier,
        UserPoolId: fakeUserPoolId,
      });
      expect(spyOnDeleteResourceServer).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls callback with correct parameters', () => {
    it('for a successful request', (done: Callback) => {
      testError(deleteResourceServer, fakeRequest(), done, false);
    });
    describe('if request is', () => {
      let request: any;
      it('undefined', () => request = undefined);
      it('null', () => request = null);
      afterEach((done: Callback) => {
        testError(deleteResourceServer, request, () => {
          expect(spyOnDeleteResourceServer).not.toHaveBeenCalled();
          done();
        });
      });
    });
    it('if CognitoIdentityServiceProvider.deleteResourceServer() produces an error', (done: Callback) => {
      spyOnDeleteResourceServer.and.returnValue(
        fakeReject('CognitoIdentityServiceProvider.deleteResourceServer()')
      );
      testError(deleteResourceServer, fakeRequest(), done);
    });
  });
});

describe('cognito.createUser()', () => {
  const fakeClientId = 'fake-client-id';
  const fakeTemporaryPassword = 'fake-temporary-password';
  const fakeSessionToken = 'fake-session-token';

  const fakeBody = () => ({
    email: fakeEmail,
    name: fakeIdentityName,
  });

  const fakeRequest = (validated = true) => ({
    body: validated ? fakeBody() : stringify(fakeBody()),
  });

  const fakeResponse = () => ({
    id: fakeUserId,
    email: fakeEmail,
    name: fakeIdentityName,
  });

  const testMethod = (callback: Callback) =>
    createUser(fakeRequest(false), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnAdminCreateUser: jasmine.Spy;
  let spyOnAdminInitiateAuth: jasmine.Spy;
  let spyOnAdminRespondToChallenge: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.userPoolId] = fakeUserPoolId;
    process.env[envNames.authClientId] = fakeClientId;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOn(uuid, 'v4').and.returnValue(fakeUserId);
    spyOn(Buffer.prototype, 'toString').and.returnValue(fakeTemporaryPassword);
    spyOnAdminCreateUser = spyOn(cognito, 'adminCreateUser')
      .and.returnValue(fakeResolve());
    spyOnAdminInitiateAuth = spyOn(cognito, 'adminInitiateAuth')
      .and.returnValue(fakeResolve({ Session: fakeSessionToken }));
    spyOnAdminRespondToChallenge = spyOn(cognito, 'adminRespondToAuthChallenge')
      .and.returnValue(fakeResolve());
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'POST', '/users');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls CognitoIdentityServiceProvider.adminCreateUser() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnAdminCreateUser).toHaveBeenCalledWith({
        UserPoolId: fakeUserPoolId,
        Username: fakeUserId,
        TemporaryPassword: fakeTemporaryPassword,
        UserAttributes: [{
          Name: 'email',
          Value: fakeEmail,
        },{
          Name: 'email_verified',
          Value: 'true',
        },{
          Name: 'name',
          Value: fakeIdentityName,
        }],
      });
      expect(spyOnAdminCreateUser).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls CognitoIdentityServiceProvider.adminInitiateAuth() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnAdminInitiateAuth).toHaveBeenCalledWith({
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        ClientId: fakeClientId,
        UserPoolId: fakeUserPoolId,
        AuthParameters: {
          USERNAME: fakeUserId,
          PASSWORD: fakeTemporaryPassword,
        },
      });
      expect(spyOnAdminInitiateAuth).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls CognitoIdentityServiceProvider.adminRespondToAuthChallenge() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnAdminRespondToChallenge).toHaveBeenCalledWith({
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        ClientId: fakeClientId,
        UserPoolId: fakeUserPoolId,
        ChallengeResponses: {
          USERNAME: fakeUserId,
          NEW_PASSWORD: fakeTemporaryPassword,
        },
        Session: fakeSessionToken,
      });
      expect(spyOnAdminRespondToChallenge).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), fakeResponse());
      expect(ajv.validate('spec#/definitions/User', fakeResponse())).toBe(true);
      expect(spyOnRespond).toHaveBeenCalledTimes(1);
      done();
    };
    testMethod(callback);
  });

  describe('calls apig.respondWithError() immediately with an error if', () => {
    let err: Error | ApiError | jasmine.ObjectContaining<{ code: number }>;

    const testError = (after: Callback, done: Callback, validated = true) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(
          callback, fakeRequest(validated), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(callback);
    };

    it('apig.validate() responds with an error', (done: Callback) => {
      err = new ApiError('validate()');
      spyOnValidate.and.returnValue(Promise.reject(err));
      testError(() => {
        expect(spyOnAdminCreateUser).not.toHaveBeenCalled();
      }, done, false);
    });

    it('CognitoIdentityServiceProvider.adminCreateUser() responds with a generic error', (done: Callback) => {
      err = Error('CognitoIdentityServiceProvider.adminCreateUser()');
      spyOnAdminCreateUser.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnAdminInitiateAuth).not.toHaveBeenCalled();
      }, done);
    });

    it('CognitoIdentityServiceProvider.adminCreateUser() responds with UsernameExistsException', (done: Callback) => {
      err = jasmine.objectContaining({ code: 409 });
      spyOnAdminCreateUser.and.returnValue(fakeReject(new ApiError(
        'CognitoIdentityServiceProvider.adminCreateUser()', undefined, 'UsernameExistsException'
      )));
      testError(() => {
        expect(spyOnAdminInitiateAuth).not.toHaveBeenCalled();
      }, done);
    });

    it('CognitoIdentityServiceProvider.adminInitiateAuth() responds with an error', (done: Callback) => {
      err = Error('CognitoIdentityServiceProvider.adminInitiateAuth()');
      spyOnAdminInitiateAuth.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnAdminRespondToChallenge).not.toHaveBeenCalled();
      }, done);
    });

    it('CognitoIdentityServiceProvider.adminRespondToAuthChallenge() responds with an error', (done: Callback) => {
      err = Error('CognitoIdentityServiceProvider.adminRespondToAuthChallenge()');
      spyOnAdminRespondToChallenge.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('apig.respond() throws an error', (done: Callback) => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
      testError(() => {}, done);
    });
  });
});

const fakeUser = () => ({
  Username: fakeUserId,
  Attributes: [{
    Name: 'email',
    Value: fakeEmail,
  },{
    Name: 'name',
    Value: fakeIdentityName,
  }],
  UserStatus: 'FORCE_CHANGE_PASSWORD',
});

const fakeSocialUser = () => ({
  Username: fakeUserId,
  Attributes: [{
    Name: 'email',
    Value: fakeEmail,
  },{
    Name: 'name',
    Value: fakeIdentityName + ' (Social)',
  }],
  UserStatus: 'EXTERNAL_PROVIDER',
});

describe('cognito.listUser()', () => {
  const fakeRequest = () => ({
    queryStringParameters: {
      email: fakeEmail,
    },
  });

  const fakeResponse = () => ({
    id: fakeUserId,
    email: fakeEmail,
    name: fakeIdentityName,
  });

  const testMethod = (callback: Callback) =>
    listUser(fakeRequest(), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnListUsers: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.userPoolId] = fakeUserPoolId;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOnListUsers = spyOn(cognito, 'listUsers')
      .and.returnValue(fakeResolve({
        Users: [fakeSocialUser(), fakeUser()],
      }));
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'GET', '/users');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls CognitoIdentityServiceProvider.listUsers() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnListUsers).toHaveBeenCalledWith({
        UserPoolId: fakeUserPoolId,
        AttributesToGet: [ 'email', 'name' ],
        Filter: 'email = "' + fakeEmail + '"',
      });
      expect(spyOnListUsers).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), fakeResponse());
      expect(ajv.validate('spec#/definitions/User', fakeResponse())).toBe(true);
      expect(spyOnRespond).toHaveBeenCalledTimes(1);
      done();
    };
    testMethod(callback);
  });

  describe('calls apig.respondWithError() immediately with the error if', () => {
    let err: Error | ApiError | jasmine.ObjectContaining<{ code: number }>;

    const testError = (after: Callback, done: Callback) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(callback, fakeRequest(), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(callback);
    };

    it('apig.validate() responds with an error', (done: Callback) => {
      err = new ApiError('validate()');
      spyOnValidate.and.returnValue(Promise.reject(err));
      testError(() => {
        expect(spyOnListUsers).not.toHaveBeenCalled();
      }, done);
    });

    it('CognitoIdentityServiceProvider.listUsers() responds with an error', (done: Callback) => {
      err = Error('CognitoIdentityServiceProvider.listUsers()');
      spyOnListUsers.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('CognitoIdentityServiceProvider.listUsers() responds with an empty list', (done: Callback) => {
      err = jasmine.objectContaining({ code: 404 });
      spyOnListUsers.and.returnValue(fakeResolve({ Users: [] }));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('CognitoIdentityServiceProvider.listUsers() does not list a built-in user', (done: Callback) => {
      err = jasmine.objectContaining({ code: 404 });
      spyOnListUsers.and.returnValue(fakeResolve({
        Users: [fakeSocialUser()],
      }));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('apig.respond() throws an error', (done: Callback) => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
      testError(() => {}, done);
    });
  });
});

describe('cognito.getUser()', () => {
  const fakeRequest = () => ({
    pathParameters: {
      user_id: fakeUserId,
    },
  });

  const fakeUser = () => ({
    Username: fakeUserId,
    UserAttributes: [{
      Name: 'email',
      Value: fakeEmail,
    },{
      Name: 'name',
      Value: fakeIdentityName,
    }],
    UserStatus: 'CONFIRMED',
  });

  const fakeResponse = () => ({
    id: fakeUserId,
    email: fakeEmail,
    name: fakeIdentityName,
  });

  const testMethod = (callback: Callback) =>
    getUser(fakeRequest(), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnAdminGetUser: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.userPoolId] = fakeUserPoolId;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOnAdminGetUser = spyOn(cognito, 'adminGetUser')
      .and.returnValue(fakeResolve(fakeUser()));
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'GET', '/users/{user_id}');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls CognitoIdentityServiceProvider.adminGetUser() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnAdminGetUser).toHaveBeenCalledWith({
        UserPoolId: fakeUserPoolId,
        Username: fakeUserId,
      });
      expect(spyOnAdminGetUser).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), fakeResponse());
      expect(ajv.validate('spec#/definitions/User', fakeResponse())).toBe(true);
      expect(spyOnRespond).toHaveBeenCalledTimes(1);
      done();
    };
    testMethod(callback);
  });

  describe('calls apig.respondWithError() immediately with the error if', () => {
    let err: Error | ApiError | jasmine.ObjectContaining<{ code: number }>;

    const testError = (after: Callback, done: Callback) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(callback, fakeRequest(), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(callback);
    };

    it('apig.validate() responds with an error', (done: Callback) => {
      err = new ApiError('validate()');
      spyOnValidate.and.returnValue(Promise.reject(err));
      testError(() => {
        expect(spyOnAdminGetUser).not.toHaveBeenCalled();
      }, done);
    });

    it('CognitoIdentityServiceProvider.adminGetUser() responds with a generic error', (done: Callback) => {
      err = Error('CognitoIdentityServiceProvider.adminGetUser()');
      spyOnAdminGetUser.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('CognitoIdentityServiceProvider.adminGetUser() responds with UserNotFoundException', (done: Callback) => {
      err = jasmine.objectContaining({ code: 404 });
      spyOnAdminGetUser.and.returnValue(fakeReject(new ApiError(
        'CognitoIdentityServiceProvider.adminGetUser()', undefined, 'UserNotFoundException'
      )));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('apig.respond() throws an error', (done: Callback) => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
      testError(() => {}, done);
    });
  });
});

describe('cognito.createClient()', () => {
  const fakeApiDomain = 'api.example2.org';
  const fakeClientId = 'fakeOAuth2Client';
  const fakeClientSecret = 'fakeClientSecret';

  const fakeBody = () => ({
    email: fakeEmail,
    name: fakeIdentityName,
  });

  const fakeRequest = (validated = true) => ({
    body: validated ? fakeBody() : stringify(fakeBody()),
  });

  const fakeClient = () => ({
    ClientId: fakeClientId,
    ClientSecret: fakeClientSecret,
  });

  const fakeResponse = () => ({
    id: fakeClientId,
    email: fakeEmail,
    name: fakeIdentityName,
    secret: fakeClientSecret,
  });

  const testMethod = (callback: Callback) =>
    createClient(fakeRequest(false), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnCreateUserPoolClient: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.userPoolId] = fakeUserPoolId;
    process.env[envNames.apiDomain] = fakeApiDomain;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOnCreateUserPoolClient = spyOn(cognito, 'createUserPoolClient')
      .and.returnValue(fakeResolve({ UserPoolClient: fakeClient() }));
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'POST', '/clients');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls CognitoIdentityServiceProvider.createUserPoolClient() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnCreateUserPoolClient).toHaveBeenCalledWith({
        ClientName: fakeEmail + ', ' + fakeIdentityName,
        UserPoolId: fakeUserPoolId,
        AllowedOAuthFlows: [ 'client_credentials' ],
        AllowedOAuthFlowsUserPoolClient: true,
        AllowedOAuthScopes: [ fakeApiDomain + '/invoke' ],
        GenerateSecret: true,
      });
      expect(spyOnCreateUserPoolClient).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), fakeResponse());
      expect(ajv.validate('spec#/definitions/Client', fakeResponse())).toBe(true);
      expect(spyOnRespond).toHaveBeenCalledTimes(1);
      done();
    };
    testMethod(callback);
  });

  describe('calls apig.respondWithError() immediately with the error if', () => {
    let err: Error | ApiError | jasmine.ObjectContaining<{ code: number }>;

    const testError = (after: Callback, done: Callback, validated = true) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(
          callback, fakeRequest(validated), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(callback);
    };

    it('apig.validate() responds with an error', (done: Callback) => {
      err = new ApiError('validate()');
      spyOnValidate.and.returnValue(Promise.reject(err));
      testError(() => {
        expect(spyOnCreateUserPoolClient).not.toHaveBeenCalled();
      }, done, false);
    });

    it('CognitoIdentityServiceProvider.createUserPoolClient() responds with a generic error', (done: Callback) => {
      err = Error('CognitoIdentityServiceProvider.createUserPoolClient()');
      spyOnCreateUserPoolClient.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('CognitoIdentityServiceProvider.createUserPoolClient() responds with LimitExceededException', (done: Callback) => {
      err = jasmine.objectContaining({ code: 429 });
      spyOnCreateUserPoolClient.and.returnValue(fakeReject(new ApiError(
        'CognitoIdentityServiceProvider.createUserPoolClient()', undefined, 'LimitExceededException'
      )));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('apig.respond() throws an error', (done: Callback) => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
      testError(() => {}, done);
    });
  });
});

describe('cognito.getClient()', () => {
  const fakeClientId = 'fakeOAuth2Client';
  const fakeClientSecret = 'fakeClientSecret';

  const fakeRequest = () => ({
    pathParameters: {
      client_id: fakeClientId,
    },
  });

  const fakeClient = () => ({
    ClientName: fakeEmail + ', ' + fakeIdentityName,
    ClientSecret: fakeClientSecret,
  });

  const fakeResponse = () => ({
    id: fakeClientId,
    email: fakeEmail,
    name: fakeIdentityName,
  });

  const testMethod = (callback: Callback) =>
    getClient(fakeRequest(), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnDescribeUserPoolClient: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.userPoolId] = fakeUserPoolId;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOnDescribeUserPoolClient = spyOn(cognito, 'describeUserPoolClient')
      .and.returnValue(fakeResolve({ UserPoolClient: fakeClient() }));
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'GET', '/clients/{client_id}');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls CognitoIdentityServiceProvider.describeUserPoolClient() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDescribeUserPoolClient).toHaveBeenCalledWith({
        ClientId: fakeClientId,
        UserPoolId: fakeUserPoolId,
      });
      expect(spyOnDescribeUserPoolClient).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), fakeResponse());
      expect(ajv.validate('spec#/definitions/Client', fakeResponse())).toBe(true);
      expect(spyOnRespond).toHaveBeenCalledTimes(1);
      done();
    };
    testMethod(callback);
  });

  describe('calls apig.respondWithError() immediately with the error if', () => {
    let err: Error | ApiError | jasmine.ObjectContaining<{ code: number }>;

    const testError = (after: Callback, done: Callback) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(callback, fakeRequest(), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(callback);
    };

    it('apig.validate() responds with an error', (done: Callback) => {
      err = new ApiError('validate()');
      spyOnValidate.and.returnValue(Promise.reject(err));
      testError(() => {
        expect(spyOnDescribeUserPoolClient).not.toHaveBeenCalled();
      }, done);
    });

    it('CognitoIdentityServiceProvider.describeUserPoolClient() responds with a generic error', (done: Callback) => {
      err = Error('CognitoIdentityServiceProvider.describeUserPoolClient()');
      spyOnDescribeUserPoolClient.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('CognitoIdentityServiceProvider.describeUserPoolClient() responds with ResourceNotFoundException', (done: Callback) => {
      err = jasmine.objectContaining({ code: 404 });
      spyOnDescribeUserPoolClient.and.returnValue(fakeReject(new ApiError(
        'CognitoIdentityServiceProvider.describeUserPoolClient()', undefined, 'ResourceNotFoundException'
      )));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('client name does not follow "email, name" format', (done: Callback) => {
      err = jasmine.objectContaining({ code: 404 });
      spyOnDescribeUserPoolClient.and.returnValue(fakeResolve({
        UserPoolClient: {
          ClientName: 'backend-client',
          ClientSecret: fakeClientSecret,
        },
      }));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('apig.respond() throws an error', (done: Callback) => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
      testError(() => {}, done);
    });
  });
});

describe('cognito.preSignUp()', () => {
  const fakeProvider = 'FakeProvider';
  const fakeProviderUserId = 'user1234';
  const fakeUsername = fakeProvider + '_' + fakeProviderUserId;

  const fakeEvent = (external = true) => ({
    triggerSource: external ? 'PreSignUp_ExternalProvider' : 'PreSignUp_SignUp',
    userName: external ? fakeUsername : fakeUserId,
    request: {
      userAttributes: {
        email: fakeEmail,
      },
    },
  });

  let spyOnListUsers: jasmine.Spy;
  let spyOnLinkUsers: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.userPoolId] = fakeUserPoolId;

    spyOnListUsers = spyOn(cognito, 'listUsers')
      .and.returnValue(fakeResolve({
        Users: [fakeSocialUser(), fakeUser()],
      }));
    spyOnLinkUsers = spyOn(cognito, 'adminLinkProviderForUser')
      .and.returnValue(fakeResolve());
  });

  it('calls CognitoIdentityServiceProvider.listUsers() once with correct parameters ' +
     'for an external provider', (done: Callback) => {
    preSignUp(fakeEvent(), null, () => {
      expect(spyOnListUsers).toHaveBeenCalledWith({
        AttributesToGet: ['email'],
        Filter: 'email = "' + fakeEmail + '"',
        UserPoolId: fakeUserPoolId,
      });
      expect(spyOnListUsers).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls CognitoIdentityServiceProvider.adminLinkProviderForUser() once with correct parameters ' +
     'for an external provider if it finds an internal user with the same email', (done: Callback) => {
    preSignUp(fakeEvent(), null, () => {
      expect(spyOnLinkUsers).toHaveBeenCalledWith({
        DestinationUser: {
          ProviderAttributeValue: fakeUserId,
          ProviderName: 'Cognito',
        },
        SourceUser: {
          ProviderAttributeName: 'Cognito_Subject',
          ProviderAttributeValue: fakeProviderUserId,
          ProviderName: fakeProvider,
        },
        UserPoolId: fakeUserPoolId,
      });
      expect(spyOnLinkUsers).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('does not call CognitoIdentityServiceProvider.listUsers() for an internal user signup', (done: Callback) => {
    preSignUp(fakeEvent(false), null, () => {
      expect(spyOnListUsers).not.toHaveBeenCalled();
      done();
    });
  });

  it('does not call CognitoIdentityServiceProvider.adminLinkProviderForUser() for an internal user signup',
      (done: Callback) => {
    preSignUp(fakeEvent(false), null, () => {
      expect(spyOnLinkUsers).not.toHaveBeenCalled();
      done();
    });
  });

  describe('calls callback with correct parameters', () => {
    const errMessage = 'User signup is disabled';

    let event: any;
    let after: Callback;

    beforeEach(() => {
      event = fakeEvent();
    });

    afterEach((done: Callback) => {
      preSignUp(event, null, (err?: string | Error, data?: any) => {
        after(err, data);
        done();
      });
    });

    it('for a successful external user signup', () => {
      after = (err?: Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual(fakeEvent());
      };
    });

    it('for a successful internal user signup', () => {
      event = fakeEvent(false);
      after = (err?: string | Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual(fakeEvent(false));
      };
    });

    it('if an internal user is not found', () => {
      spyOnListUsers.and.returnValue(fakeResolve({
        Users: [fakeSocialUser()],
      }));
      after = (err?: string | Error, data?: any) => {
        expect(err).toBe(errMessage);
        expect(data).toBeUndefined();
        expect(spyOnLinkUsers).not.toHaveBeenCalled();
      };
    });

    it('if CognitoIdentityServiceProvider.listUsers() produces an error', () => {
      spyOnListUsers.and.returnValue(
        fakeReject('CognitoIdentityServiceProvider.listUsers()')
      );
      after = (err?: string | Error, data?: any) => {
        expect(err).toBe(errMessage);
        expect(data).toBeUndefined();
        expect(spyOnLinkUsers).not.toHaveBeenCalled();
      };
    });

    it('if CognitoIdentityServiceProvider.listUsers() produces an error', () => {
      spyOnLinkUsers.and.returnValue(
        fakeReject('CognitoIdentityServiceProvider.adminLinkProviderForUser()')
      );
      after = (err?: string | Error, data?: any) => {
        expect(err).toBe(errMessage);
        expect(data).toBeUndefined();
      };
    });
  });
});
