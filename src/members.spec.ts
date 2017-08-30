import * as jwt from './jwt';
import { envNames } from './env';
import * as members from './members';
import { authorize, getPolicy, Policy } from './members';
import { Callback } from './types';

const fakeAuthDomain = 'cognito-idp.us-east-1.amazonaws.com/us-east-1_aBCD';
const fakeToken = 'ey.ab.cd';
const fakeSub = 'abcd@1234';
const fakeExp = 1514764800;
const fakeBaseArn = 'arn:aws:execute-api:us-west-2:123456789012:ymy8tbxw7b/Stage';
const fakeMethodArn = `${fakeBaseArn}/GET/resource`;

describe('authorize()', () => {
  let fakeEvent = () => ({
    authorizationToken: fakeToken,
    methodArn: fakeMethodArn,
  });
  let fakePayload = () => ({
    sub: fakeSub,
    exp: fakeExp,
  });
  let fakePolicy = (): Policy => ({
    principalId: fakeSub,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: 'Allow',
        Resource: fakeMethodArn,
      }],
    },
    context: {
      memberships: 'any',
    },
  });

  let spyOnAuthenticate: jasmine.Spy;
  let spyOnGetPolicy: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.authDomain] = fakeAuthDomain;

    spyOnAuthenticate = spyOn(jwt, 'authenticate')
      .and.returnValue(Promise.resolve(fakePayload()));
    spyOnGetPolicy = spyOn(members, 'getPolicy')
      .and.returnValue(Promise.resolve(fakePolicy()));
  });

  const testMethod = (callback: Callback) => {
    authorize(fakeEvent(), null, callback);
  };

  it('calls jwt.authenticate() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnAuthenticate).toHaveBeenCalledWith(fakeAuthDomain, fakeToken);
      expect(spyOnAuthenticate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls getPolicy() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnGetPolicy).toHaveBeenCalledWith(fakeSub, fakeExp, fakeMethodArn);
      expect(spyOnGetPolicy).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback with correct parameters if there were no errors', (done: Callback) => {
    testMethod((err: Error, policy: Policy) => {
      expect(err).toBeFalsy();
      expect(policy).toEqual(fakePolicy());
      done();
    });
  });

  describe('immediately calls callback with "Unauthorized" response if', () => {
    const testError = (last: Callback, done: Callback) => (err: string) => {
      expect(err).toEqual('Unauthorized');
      last();
      done();
    };
    describe('event is', () => {
      let event: any;
      afterEach((done: Callback) => {
        authorize(event, null, testError(() =>
          expect(spyOnAuthenticate).not.toHaveBeenCalled(), done));
      });
      it('undefined', () => event = undefined);
      it('null', () => event = null);
    });
    describe('jwt.authenticate()', () => {
      afterEach((done: Callback) => {
        authorize(fakeEvent(), null, testError(() =>
          expect(spyOnGetPolicy).not.toHaveBeenCalled(), done));
      });
      it('produces an error', () => {
        spyOnAuthenticate.and.returnValue(Promise.reject(Error('jwt.authenticate()')));
      });
      describe('payload is', () => {
        let payload: string;
        afterEach(() => {
          spyOnAuthenticate.and.returnValue(Promise.resolve(payload));
        });
        it('undefined', () => payload = undefined);
        it('null', () => payload = null);
      });
    });
    it('getPolicy() produces an error', (done: Callback) => {
      spyOnGetPolicy.and.returnValue(Promise.reject(Error('getPolicy()')));
      authorize(fakeEvent(), null, testError(() => {}, done));
    });
  });
});

describe('getPolicy()', () => {
  it('returns correct policy response if there were no errors', (done: Callback) => {
    getPolicy(fakeSub, fakeExp, fakeMethodArn).then((policy: Policy) => {
      expect(policy).toEqual({
        principalId: fakeSub,
        policyDocument: {
          Version: '2012-10-17',
          Statement: [{
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: [
              fakeBaseArn + '/GET/',
              fakeBaseArn + '/POST/projects',
              fakeBaseArn + '/POST/users',
              fakeBaseArn + '/GET/users',
              fakeBaseArn + '/GET/users/*',
              fakeBaseArn + '/POST/clients',
              fakeBaseArn + '/GET/clients/*',
              fakeBaseArn + '/GET/datasets',
              fakeBaseArn + '/POST/datasets',
              fakeBaseArn + '/POST/datasets/*/credentials',
              fakeBaseArn + '/PUT/datasets/*/storage',
              fakeBaseArn + '/POST/pipelines',
              fakeBaseArn + '/GET/analyses',
              fakeBaseArn + '/POST/analyses',
              fakeBaseArn + '/POST/analyses/*/execution',
              fakeBaseArn + '/DELETE/analyses/*/execution',
            ],
          }],
        },
        context: {
          expiresAt: fakeExp,
        },
      });
      done();
    });
  });

  describe('produces an error if', () => {
    let principalId: string;
    let methodArn: string;
    beforeEach(() => {
      principalId = fakeSub;
      methodArn = fakeMethodArn;
    });
    afterEach((done: Callback) => {
      getPolicy(principalId, fakeExp, methodArn).catch(err => {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    });
    describe('principalId is', () => {
      it('undefined', () => principalId = undefined);
      it('null', () => principalId = null);
      it('empty', () => principalId = '');
    });
    describe('methodArn is', () => {
      it('undefined', () => methodArn = undefined);
      it('null', () => methodArn = null);
    });
  });
});
