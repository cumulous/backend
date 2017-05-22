import * as stringify from 'json-stable-stringify';
import * as zlib from 'zlib';

import * as apig from './apig';
import { getSpec, respond, Response } from './apig';
import { apiGateway } from './aws';
import { envNames } from './env';
import { fakeResolve, fakeReject, testError } from './fixtures/support';
import { Callback } from './types';

const spec = require('./swagger');

const fakeDomainName = 'api.example.org';
const fakeApiCertificate = 'arn:aws:acm:us-east-1:012345678910:certificate/abcd-1234';
const fakeCloudFrontDistribution = 'fake-1234.cloudfront.net';
const fakeWebDomain = 'example.org';

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

describe('respond()', () => {
  const commonHeaders = () => ({
    'Access-Control-Allow-Origin': `https://${fakeWebDomain}`,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Accept-Encoding',
  });
  const fakeBody = () => ({ fake: 'value' });

  beforeEach(() => {
    process.env[envNames.webDomain] = fakeWebDomain;
  });

  describe('calls callback with correct output if', () => {
    const statusCode = 400;
    const body = stringify(fakeBody(), {space: 2});

    it('only body, statusCode and response headers are specified', (done: Callback) => {
      const headers = () => ({'x-header': 'fake'});
      respond((err: Error, response: Response) => {
        expect(err).toBeFalsy();
        expect(response).toEqual({
          body,
          headers: Object.assign(commonHeaders(), headers()),
          statusCode,
        });
        done();
      }, fakeBody(), statusCode, headers());
    });
    it('only body and statusCode are specified', (done: Callback) => {
      respond((err: Error, response: Response) => {
        expect(err).toBeFalsy();
        expect(response).toEqual({
          body,
          headers: commonHeaders(),
          statusCode,
        });
        done();
      }, fakeBody(), statusCode);
    });
    it('only body is specified', (done: Callback) => {
      respond((err: Error, response: Response) => {
        expect(err).toBeFalsy();
        expect(response).toEqual({
          body,
          headers: commonHeaders(),
          statusCode: 200,
        });
        done();
      }, fakeBody());
    });
    it('no arguments are specified', (done: Callback) => {
      respond((err: Error, response: Response) => {
        expect(err).toBeFalsy();
        expect(response).toEqual({
          body: undefined,
          headers: commonHeaders(),
          statusCode: 200,
        });
        done();
      });
    });
  });

  describe('returns correctly compressed response if Accept-Encoding is', () => {
    const body = Buffer.from(stringify(fakeBody(), {space: 2}));
    const testMethod = (encodingHeader: string, encodingMethod: string) => {
      it(`"${encodingHeader}"`, (done: Callback) => {
        respond((err: Error, response: Response) => {
          expect(err).toBeFalsy();
          (zlib as any)[encodingMethod](body, (err: Error, data: Buffer) => {
            expect(response).toEqual({
              body: data.toString('base64'),
              isBase64Encoded: true,
              headers: Object.assign(commonHeaders(), {
                'Content-Encoding': encodingMethod,
              }),
              statusCode: 200,
            });
            done();
          });
        }, fakeBody(), 200, null, {'Accept-Encoding': encodingHeader});
      });
    };
    testMethod('deflate', 'deflate');
    testMethod('gzip', 'gzip');
    testMethod('deflate,gzip', 'deflate');
    testMethod('gzip,deflate', 'deflate');
    testMethod('*', 'deflate');
  });

  describe('returns uncompressed response if Accept-Encoding is', () => {
    const body = stringify(fakeBody(), {space: 2});
    const testMethod = (encodingHeader?: string) => {
      it(`"${encodingHeader}"`, (done: Callback) => {
        respond((err: Error, response: Response) => {
          expect(err).toBeFalsy();
          expect(response).toEqual({
            body,
            headers: commonHeaders(),
            statusCode: 200,
          });
          done();
        }, fakeBody(), 200, null, {'Accept-Encoding': encodingHeader});
      });
    };
    testMethod('');
    testMethod();
  });

  describe('ignores Accept-Encoding if body is', () => {
    const testMethod = (body?: undefined) => {
      it(`"${body}"`, (done: Callback) => {
        respond((err: Error, response: Response) => {
          expect(err).toBeFalsy();
          expect(response).toEqual({
            body,
            headers: commonHeaders(),
            statusCode: 200,
          });
          done();
        }, body, 200, null, {'Accept-Encoding': 'deflate'});
      });
    };
    testMethod(null);
    testMethod();
  });
});

describe('getSpec()', () => {
  it('returns correct response', (done: Callback) => {
    getSpec(null, null, (err: Error, data: Response) => {
      expect(err).toBeFalsy();
      respond((err: Error, response: Response) => {
        expect(data).toEqual(response);
        done();
      }, spec);
    });
  });
});
