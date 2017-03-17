import * as apig from './apig';
import { apiGateway } from './aws';
import { fakeResolve, fakeReject, testError } from './fixtures/support';
import { Callback } from './types';

const fakeDomainName = 'api.example.org';
const fakeApiCertificate = 'arn:aws:acm:us-east-1:012345678910:certificate/abcd-1234';

const testMethod = (apiGatewayMethod: any, fakeEvent: () => any, fakeRequest: () => any) => {
  let spyOnMethod: jasmine.Spy;

  beforeEach(() => {
    spyOnMethod = spyOn(apiGateway, apiGatewayMethod)
      .and.returnValue(fakeResolve());
  });

  describe('calls', () => {
    it(`apiGateway.${apiGatewayMethod}() once with correct parameters`, (done: Callback) => {
      (apig as any)[apiGatewayMethod](fakeEvent(), null, () => {
        expect(spyOnMethod).toHaveBeenCalledWith(fakeRequest());
        expect(spyOnMethod).toHaveBeenCalledTimes(1);
        done();
      });
    });
    describe('callback with an error if', () => {
      it(`apiGateway.${apiGatewayMethod}() produces an error`, (done: Callback) => {
        spyOnMethod.and.returnValue(fakeReject(`apiGateway.${apiGatewayMethod}()`));
        testError((apig as any)[apiGatewayMethod], fakeEvent(), done);
      });
      if (typeof fakeEvent() !== 'string') {
        describe('event is', () => {
          it('null', (done: Callback) => {
            testError((apig as any)[apiGatewayMethod], null, done);
          });
          it('undefined', (done: Callback) => {
            testError((apig as any)[apiGatewayMethod], undefined, done);
          });
        });
      }
    });

    it(`callback without an error when called with correct parameters
        and apiGateway.${apiGatewayMethod}() does not produce an error`, (done: Callback) => {
      testError((apig as any)[apiGatewayMethod], fakeEvent(), done, false);
    });
  });
};

testMethod('createDomainName', () => ({
  Name: fakeDomainName,
  Certificate: fakeApiCertificate,
}), () => ({
  domainName: fakeDomainName,
  certificateName: fakeDomainName,
  certificateArn: fakeApiCertificate,
}));

testMethod('updateDomainName', () => ({
  Name: fakeDomainName,
  Certificate: fakeApiCertificate,
}), () => ({
  domainName: fakeDomainName,
  patchOperations: [{
    op: 'replace',
    path: '/certificateArn',
    value: fakeApiCertificate,
  }],
}));

testMethod('deleteDomainName', () =>
  fakeDomainName,
() => ({
  domainName: fakeDomainName,
}));