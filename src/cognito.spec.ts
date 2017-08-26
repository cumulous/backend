import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import * as apig from './apig';
import { ajv, ApiError } from './apig';
import { cognito, createUser,
         createUserPoolDomain, deleteUserPoolDomain, updateUserPoolClient } from './cognito';
import { envNames } from './env';
import { fakeReject, fakeResolve, testError } from './fixtures/support';
import { Callback } from './types';

const fakeUserPoolId = 'fake-user-pool-id';
const fakeWebDomain = 'fake.web.domain';
const fakeUserPoolDomainPrefix = 'fake-web-domain';
const fakeEmail = 'fake-email@example.org';
const fakeIdentityName = 'Fake Identity Name';

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

describe('cognito.createUser', () => {
  const fakeUserId = uuid();
  const fakeClientId = 'fake-client-id';
  const fakeTemporaryPassword = 'fake-temporary-password';
  const fakeNewPassword = 'fake-new-password';
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
    spyOn(Buffer.prototype, 'toString').and.returnValues(fakeTemporaryPassword, fakeNewPassword);
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
        MessageAction: 'SUPPRESS',
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
          NEW_PASSWORD: fakeNewPassword,
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

  describe('calls apig.respondWithError() immediately with the error if', () => {
    let err: Error | ApiError;

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

    it('CognitoIdentityServiceProvider.adminCreateUser() responds with an error', (done: Callback) => {
      err = Error('CognitoIdentityServiceProvider.adminCreateUser()');
      spyOnAdminCreateUser.and.returnValue(fakeReject(err));
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
