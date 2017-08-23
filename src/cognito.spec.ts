import * as stringify from 'json-stable-stringify';

import { cognito, createUserPoolDomain, deleteUserPoolDomain, updateUserPoolClient } from './cognito';
import { fakeReject, fakeResolve, testError } from './fixtures/support';
import { Callback } from './types';

const fakeUserPoolId = 'fake-user-pool-id';
const fakeWebDomain = 'fake.web.domain';
const fakeUserPoolDomainPrefix = 'fake-web-domain';

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
