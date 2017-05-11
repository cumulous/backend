import * as stringify from 'json-stable-stringify';

import * as apig from './apig';
import { createApp, getSpec, makeResponse, Response } from './apig';
import { apiGateway } from './aws';
import { fakeResolve, fakeReject, testError } from './fixtures/support';
import { Callback } from './types';

const spec = require('./swagger');

const fakeDomainName = 'api.example.org';
const fakeApiCertificate = 'arn:aws:acm:us-east-1:012345678910:certificate/abcd-1234';
const fakeCloudFrontDistribution = 'fake-1234.cloudfront.net';

describe('createApp()', () => {
  let middleware: any;
  let app: any;

  beforeEach(() => {
    const fakeApp = jasmine.createSpyObj('app', ['use']);
    const spyOnApp = spyOn(apig, 'app').and.returnValue(fakeApp);

    middleware = jasmine.createSpyObj('middleware',
      ['swaggerMetadata', 'swaggerValidator']);
  });

  const testMethod = () => {
    app = createApp(middleware);
  };

  it('calls app.use for swaggerMetadata middleware', () => {
    const spyOnSwaggerMetadata = jasmine.createSpy('swaggerMetadata');
    middleware.swaggerMetadata = () => spyOnSwaggerMetadata;
    testMethod();
    expect(app.use).toHaveBeenCalledWith(spyOnSwaggerMetadata);
  });

  it('calls app.use for swaggerValidator middleware', () => {
    const spyOnSwaggerValidator = jasmine.createSpy('swaggerValidator');
    middleware.swaggerValidator = () => spyOnSwaggerValidator;
    testMethod();
    expect(app.use).toHaveBeenCalledWith(spyOnSwaggerValidator);
  });
});

const testMethod = (apiGatewayMethod: any, fakeEvent: () => any, fakeRequest: () => any,
    fakeResponse?: () => any, expectedResponse?: any) => {

  describe(`apig.${apiGatewayMethod}() calls`, () => {
    let spyOnMethod: jasmine.Spy;

    beforeEach(() => {
      spyOnMethod = spyOn(apiGateway, apiGatewayMethod)
        .and.returnValue(fakeResolve(fakeResponse ? fakeResponse() : undefined));
    });

    it(`apiGateway.${apiGatewayMethod}() once with correct parameters`, (done: Callback) => {
      (apig as any)[apiGatewayMethod](fakeEvent(), null, () => {
        expect(spyOnMethod).toHaveBeenCalledWith(fakeRequest());
        expect(spyOnMethod).toHaveBeenCalledTimes(1);
        done();
      });
    });

    describe('callback', () => {
      describe('with', () => {
        describe('an error if', () => {
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
        if (fakeResponse) {
          it(`correct parameters when apiGateway.${apiGatewayMethod} returns a correct response`,
              (done: Callback) => {
            (apig as any)[apiGatewayMethod](fakeEvent(), null, (err: Error, data: any) => {
              expect(data).toEqual(expectedResponse);
              done();
            });
          });
        }
      });

      it(`without an error when called with correct parameters
          and apiGateway.${apiGatewayMethod}() does not produce an error`, (done: Callback) => {
        testError((apig as any)[apiGatewayMethod], fakeEvent(), done, false);
      });
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
}), () => ({
  distributionDomainName: fakeCloudFrontDistribution,
}), fakeCloudFrontDistribution);

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
}), () => ({
  distributionDomainName: fakeCloudFrontDistribution,
}), fakeCloudFrontDistribution);

testMethod('deleteDomainName', () =>
  fakeDomainName,
() => ({
  domainName: fakeDomainName,
}));

describe('makeResponse()', () => {
  describe('returns correct output if', () => {
    const statusCode = 400;
    const headers = () => ({'x-header': 'fake'});
    const body = () => ({ fake: 'value' });

    it('all inputs are specified', () => {
      const response = makeResponse(body(), statusCode, headers());
      expect(response).toEqual({
        body: stringify(body(), {space: 2}),
        headers: headers(),
        statusCode: statusCode,
      });
    });
    it('only body and statusCode are specified', () => {
      const response = makeResponse(body(), statusCode);
      expect(response).toEqual({
        body: stringify(body(), {space: 2}),
        headers: undefined,
        statusCode: statusCode,
      });
    });
    it('only body is specified', () => {
      const response = makeResponse(body());
      expect(response).toEqual({
        body: stringify(body(), {space: 2}),
        headers: undefined,
        statusCode: 200,
      });
    });
    it('no arguments are specified', () => {
      const response = makeResponse();
      expect(response).toEqual({
        body: undefined,
        headers: undefined,
        statusCode: 200,
      });
    });
  });
});

describe('getSpec()', () => {
  it('calls callback with correct output', (done: Callback) => {
    getSpec(null, null, (err: Error, response: Response) => {
      expect(err).toBeFalsy();
      expect(response).toEqual(makeResponse(spec));
      done();
    });
  });
});
