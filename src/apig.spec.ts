import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';
import * as zlib from 'zlib';

import * as apig from './apig';
import { ajv, ApiError, validate,
         Request, respond, respondWithError, Response,
         getSpec, spec } from './apig';
import { apiGateway } from './aws';
import { envNames } from './env';
import { log } from './log';
import { fakeResolve, fakeReject, testError } from './fixtures/support';
import { Callback, Dict, HttpMethod } from './types';

const fakeDomainName = 'api.example.org';
const fakeApiCertificate = 'arn:aws:acm:us-east-1:012345678910:certificate/abcd-1234';
const fakeCloudFrontDistribution = 'fake-1234.cloudfront.net';
const fakeWebDomain = 'example.org';

describe('spec()', () => {
  it('returns correct Swagger spec', () => {
    expect(spec()).toEqual(require('./swagger'));
  });
});

describe('validate()', () => {
  const fakeMethod = 'POST';
  const fakePath = '/items/{itemId}';
  const fakeItemId = uuid();
  const fakeItemDescription = 'This is a fake item';
  const fakeItemDescriptionContains = 'fake item';
  const fakeItemHeader = '10';
  const fakeItemStatus = 'Present';

  const fakeSpec = () =>
    JSON.parse(JSON.stringify(require('./fixtures/swagger')));

  const fakeRequest = (): Request => ({
    pathParameters: {
      itemId: fakeItemId,
    },
    queryStringParameters: {
      desc_contains: fakeItemDescriptionContains,
    } as Dict<string>,
    headers: {
      'X-Header': fakeItemHeader,
    } as Dict<string>,
    body: stringify({
      description: fakeItemDescription,
      status: fakeItemStatus,
    }) as any,
  });
  const testMethod = () => validate(fakeRequest(), fakeMethod, fakePath);

  let spyOnSpec: jasmine.Spy;

  beforeEach(() => {
    spyOnSpec = spyOn(apig, 'spec').and.callFake(fakeSpec);
  });

  it('compiles correct schema once', (done: Callback) => {
    const spyOnAjvCompile = spyOn(ajv, 'compile').and.callThrough();
    testMethod().then(() => {
      expect(spyOnAjvCompile).toHaveBeenCalledWith(
        Object.assign({$id: 'spec'}, fakeSpec()));
      expect(spyOnAjvCompile).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('validates request parameters against correct models', (done: Callback) => {
    const spyOnAjvValidate = spyOn(ajv, 'validate').and.callThrough();
    testMethod().then(() => {
      expect(spyOnAjvValidate).toHaveBeenCalledWith(
        'spec#/parameters/Path', fakeItemId);
      expect(spyOnAjvValidate).toHaveBeenCalledWith(
        'spec#/parameters/Query', fakeItemDescriptionContains);
      expect(spyOnAjvValidate).toHaveBeenCalledWith(
        'spec#/parameters/Header', fakeItemHeader);
      expect(spyOnAjvValidate).toHaveBeenCalledWith(
        'spec#/parameters/Body/schema', {
          description: fakeItemDescription,
          status: fakeItemStatus,
        });
      done();
    });
  });

  it('sets request body to its parsed value and applies defaults, ' +
     'but without additional properties if none are allowed',
      (done: Callback) => {
    const request = fakeRequest();
    request.body = stringify({
      description: fakeItemDescription,
      additional: 'property',
    }),
    validate(request, fakeMethod, fakePath).then(() => {
      expect(request.body).toEqual({
        description: fakeItemDescription,
        status: 'Present',
      });
      done();
    });
  });

  it('parses request body from base64-encoded string if isBase64Encoded is "true"',
      (done: Callback) => {
    const request = fakeRequest();
    request.body = Buffer.from(stringify({
      description: fakeItemDescription,
      status: 'Absent',
    })).toString('base64');
    request.isBase64Encoded = true;
    validate(request, fakeMethod, fakePath).then(() => {
      expect(request.body).toEqual({
        description: fakeItemDescription,
        status: 'Absent',
      });
      done();
    });
  });

  it('sets unspecified optional query parameters to their default values (if defined)',
      (done: Callback) => {
    const request = fakeRequest();
    validate(request, fakeMethod, fakePath).then(() => {
      expect(request.queryStringParameters.sort).toEqual('dateCreated:desc');
      expect(Object.keys(request.queryStringParameters)).not.toContain('optional');
      done();
    });
  });

  it('sets unspecified optional headers to their default values (if defined)',
      (done: Callback) => {
    const request = fakeRequest();
    validate(request, fakeMethod, fakePath).then(() => {
      expect(Number(request.headers['X-Header-Default'])).toEqual(0);
      expect(Object.keys(request.headers)).not.toContain('X-Header-Optional');
      done();
    });
  });

  describe('fails with a list of errors if', () => {
    let request: Request;

    beforeEach(() => {
      request = fakeRequest();
    });

    afterEach((done: Callback) => {
      validate(request, fakeMethod, fakePath).catch((err?: ApiError) => {
        expect(err).toBeTruthy();
        expect(err.message).toBeTruthy();
        expect(err.errors.length).toBeGreaterThan(0);
        expect(err.code).toBe(400);
        done();
      });
    });

    describe('path', () => {
      describe('is', () => {
        it('undefined', () => {
          delete request.pathParameters;
        });
        it('null', () => {
          request.pathParameters = null;
        });
      });
      describe('parameter is', () => {
        it('invalid', () => {
          request.pathParameters.itemId = '1234_A';
        });
        it('undefined', () => {
          delete request.pathParameters.itemId;
        });
        it('null', () => {
          request.pathParameters.itemId = null;
        });
      });
    });

    describe('query parameter is required, but', () => {
      describe('query is', () => {
        it('undefined', () => {
          delete request.queryStringParameters;
        });
        it('null', () => {
          request.queryStringParameters = null;
        });
      });
      describe('its value is', () => {
        it('invalid', () => {
          request.queryStringParameters.desc_contains = '!#?%';
        });
        it('undefined', () => {
          delete request.queryStringParameters.desc_contains;
        });
        it('null', () => {
          request.queryStringParameters.desc_contains = null;
        });
      });
    });

    describe('header is required, but', () => {
      describe('array of headers is', () => {
        it('undefined', () => {
          delete request.headers;
        });
        it('null', () => {
          request.headers = null;
        });
      });
      describe('its value is', () => {
        it('invalid', () => {
          request.headers['X-Header'] = '11';
        });
        it('undefined', () => {
          delete request.headers['X-Header'];
        });
        it('null', () => {
          request.headers['X-Header'] = null;
        });
      });
    });

    describe('body is required, but', () => {
      describe('its value is', () => {
        it('missing a required parameter', () => {
          request.body = '{}';
        });
        it('undefined', () => {
          delete request.body;
        });
        it('null', () => {
          request.body = null;
        });
        it('not a string', () => {
          (request as any).body = { fake: 'body' };
        });
        it('not parsable', () => {
          request.body = '{';
        });
      });
    });
  });

  describe('fails with a server error if', () => {
    let method: HttpMethod;
    let path: string;

    beforeEach(() => {
      method = fakeMethod;
      path = fakePath;
    });

    afterEach((done: Callback) => {
      validate(fakeRequest(), method, path).catch((err?: ApiError) => {
        expect(err).toBeTruthy();
        expect(err.message).toBeTruthy();
        expect(err.code == undefined || err.code == 500).toBe(true);
        done();
      });
    });

    it('parameter type is unsupported', () => {
      ajv.removeSchema('spec');
      spyOnSpec.and.callFake(() => {
        const spec = fakeSpec();
        if (!spec.parameters.FormData) {
          spec.paths['/items/{itemId}'].post.parameters.push({
            "$ref": "#/parameters/FormData"
          });
          spec.parameters.FormData = {
            in: 'formData',
            name: 'data',
            type: 'string',
            required: true,
          };
        }
        return spec;
      });
    });

    describe('API path is', () => {
      beforeAll(() => {
        ajv.removeSchema('spec');
      });
      it('not found', () => {
        path = '/items';
      });
      it('undefined', () => {
        path = undefined;
      });
      it('null', () => {
        path = null;
      });
    });

    describe('API method is', () => {
      beforeAll(() => {
        ajv.removeSchema('spec');
      });
      it('not found', () => {
        method = 'GET';
      });
      it('undefined', () => {
        method = undefined;
      });
      it('null', () => {
        method = null;
      });
    });
  });

  describe('does not produce an error if', () => {
    let request: Request;

    beforeEach(() => {
      request = fakeRequest();
    });

    afterEach((done: Callback) => {
      validate(request, fakeMethod, fakePath).then(() => done());
    });

    describe('query parameter is not required, and', () => {
      beforeAll(() => {
        ajv.removeSchema('spec');
      });

      beforeEach(() => {
        spyOnSpec.and.callFake(() => {
          const spec = fakeSpec();
          delete spec.parameters.Query.required;
          return spec;
        });
      });

      describe('query is', () => {
        it('undefined', () => {
          delete request.queryStringParameters;
        });
        it('null', () => {
          request.queryStringParameters = null;
        });
      });
      describe('its value is', () => {
        it('undefined', () => {
          delete request.queryStringParameters.desc_contains;
        });
        it('null', () => {
          request.queryStringParameters.desc_contains = null;
        });
      });
    });

    describe('header is not required, and', () => {
      beforeAll(() => {
        ajv.removeSchema('spec');
      });

      beforeEach(() => {
        spyOnSpec.and.callFake(() => {
          const spec = fakeSpec();
          delete spec.parameters.Header.required;
          return spec;
        });
      });

      describe('array of headers is', () => {
        it('undefined', () => {
          delete request.headers;
        });
        it('null', () => {
          request.headers = null;
        });
      });
      describe('its value is', () => {
        it('undefined', () => {
          delete request.headers['X-Header'];
        });
        it('null', () => {
          request.headers['X-Header'] = null;
        });
      });
    });

    describe('header name', () => {
      beforeAll(() => {
        ajv.removeSchema('spec');
      });
      it('starts with the name of a model header', () => {
        request.headers['X-Header-Default-Suffix'] = 'should not be evaluated';
      });
      it('contains the name of a model header', () => {
        request.headers['Prefix-X-Header-Default-Suffix'] = 'should not be evaluated';
      });
      it('ends with the name of a model header', () => {
        request.headers['Prefix-X-Header-Default'] = 'should not be evaluated';
      });
    });

    describe('body is not required, and', () => {
      beforeAll(() => {
        ajv.removeSchema('spec');
      });

      beforeEach(() => {
        spyOnSpec.and.callFake(() => {
          const spec = fakeSpec();
          delete spec.parameters.Body.required;
          return spec;
        });
      });

      describe('its value is', () => {
        it('undefined', () => {
          delete request.body;
        });
        it('null', () => {
          request.body = null;
        });
      });
    });
  });
});

describe('respond()', () => {
  const fakeRequest = () => ({
    headers: {
      'X-Fake-Request': 'header',
    },
  });
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

    it('all optional parameters are specified', (done: Callback) => {
      const headers = () => ({'x-header': 'fake'});
      respond((err: Error, response: Response) => {
        expect(err).toBeFalsy();
        expect(response).toEqual({
          body,
          headers: Object.assign(commonHeaders(), headers()),
          statusCode,
        });
        done();
      }, fakeRequest(), fakeBody(), statusCode, headers());
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
      }, fakeRequest(), fakeBody(), statusCode);
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
      }, fakeRequest(), fakeBody());
    });
    it('no optional parameters are specified', (done: Callback) => {
      respond((err: Error, response: Response) => {
        expect(err).toBeFalsy();
        expect(response).toEqual({
          body: undefined,
          headers: commonHeaders(),
          statusCode: 200,
        });
        done();
      }, fakeRequest());
    });
    it('no request headers are specified', (done: Callback) => {
      respond((err: Error, response: Response) => {
        expect(err).toBeFalsy();
        expect(response).toEqual({
          body: undefined,
          headers: commonHeaders(),
          statusCode: 200,
        });
        done();
      }, {});
    });
    describe('request is ', () => {
      let request: any;
      afterEach((done: Callback) => {
        respond((err: Error, response: Response) => {
          expect(err).toBeFalsy();
          expect(response).toEqual({
            body: undefined,
            headers: commonHeaders(),
            statusCode: 200,
          });
          done();
        }, request);
      });
      it('undefined', () => request = undefined);
      it('null', () => request = null);
    });
  });

  describe('returns correctly compressed response if Accept-Encoding is', () => {
    const body = Buffer.from(stringify(fakeBody(), {space: 2}));
    const testRespond = (encodingHeaderName: string, encodingHeaderValue: string,
        encodingMethod: string, done: Callback) => {
      const headers: any = {};
      headers[encodingHeaderName] = encodingHeaderValue;
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
      }, { headers }, fakeBody());
    };
    const testMethod = (encodingHeaderValue: string, encodingMethod: string) => {
      it(`"${encodingHeaderValue}"`, (done: Callback) => {
        testRespond('Accept-Encoding', encodingHeaderValue, encodingMethod, done);
      });
    };
    testMethod('deflate', 'deflate');
    testMethod('gzip', 'gzip');
    testMethod('deflate,gzip', 'deflate');
    testMethod('gzip,deflate', 'deflate');
    testMethod('*', 'deflate');

    it('in lowercase', (done: Callback) => {
      testRespond('accept-encoding', 'deflate', 'deflate', done);
    });
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
        }, {
          headers: {'Accept-Encoding': encodingHeader},
        }, fakeBody());
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
        }, {
          headers: {'Accept-Encoding': 'deflate'},
        }, body);
      });
    };
    testMethod(null);
    testMethod();
  });

  describe('calls callback with an error if', () => {
    it('zlib.deflate produces an error', (done: Callback) => {
      spyOn(zlib, 'deflate').and.callFake(
        (buf: string, callback: Callback) => callback(Error('zlib.deflate')));
      respond((err: Error, response: Response) => {
        expect(err).toBeTruthy();
        done();
      }, {
        headers: {'Accept-Encoding': 'deflate'},
      }, {});
    });
    it('zlib.gzib produces an error', (done: Callback) => {
      spyOn(zlib, 'gzip').and.callFake(
        (buf: Buffer, callback: Callback) => callback(Error('zlib.gzip')));
      respond((err: Error, response: Response) => {
        expect(err).toBeTruthy();
        done();
      }, {
        headers: {'Accept-Encoding': 'gzip'},
      }, {});
    });
  });
});

describe('respondWithError()', () => {
  const fakeErrorMessage = 'Fake Error';
  const fakeErrorsArray = () => ['validation error'];
  const fakeErrorCode = 400;

  const fakeRequest = () => ({
    headers: { 'X-Header': 'test' },
  });

  let fakeError: ApiError;

  let spyOnRespond: jasmine.Spy;

  beforeEach(() => {
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
  });

  const testMethod = (callback: Callback) => {
    respondWithError(callback, fakeRequest(), fakeError);
  };

  it('calls respond() with correct parameters', (done: Callback) => {
    fakeError = new ApiError(fakeErrorMessage, fakeErrorsArray(), fakeErrorCode);
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(
        callback, fakeRequest(), {
          message: fakeErrorMessage,
          errors: fakeErrorsArray(),
        }, fakeErrorCode);
      done();
    };
    testMethod(callback);
  });

  it('does not output undefined errors[]', (done: Callback) => {
    fakeError = new ApiError(fakeErrorMessage, undefined, fakeErrorCode);
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(
        callback, fakeRequest(), {
          message: fakeErrorMessage,
        }, fakeErrorCode);
      done();
    };
    testMethod(callback);
  });


  describe('calls respond() with a server error and logs it if error', () => {
    let spyOnLog: jasmine.Spy;

    beforeEach(() => {
      spyOnLog = spyOn(log, 'error');
    });

    afterEach((done: Callback) => {
      const callback = () => {
        expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), {
          message: 'Internal server error',
        }, 500);
        expect(spyOnLog).toHaveBeenCalledWith(stringify({
          name: fakeError.name,
          message: fakeError.message,
          errors: fakeError.errors,
          code: fakeError.code,
          stack: fakeError.stack,
        }));
        done();
      };
      testMethod(callback);
    });

    it('code is 500', () => {
      fakeError = new ApiError(fakeErrorMessage, fakeErrorsArray(), 500);
    });

    it('code is not a number', () => {
      fakeError = new ApiError(fakeErrorMessage, fakeErrorsArray(), 'TextCode');
    });

    it('code is undefined', () => {
      fakeError = new ApiError(fakeErrorMessage, fakeErrorsArray());
    });

    it('is generic', () => {
      fakeError = Error(fakeErrorMessage);
    });
  });
});

describe('getSpec()', () => {
  let fakeRequest = () => ({
    headers: {
      'Accept-Encoding': 'deflate, gzip;q=1.0, *;q=0.5',
    },
  });

  let spyOnValidate: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeAll(() => {
    ajv.removeSchema('spec');
  });

  beforeEach(() => {
    spyOnValidate = spyOn(apig, 'validate').and.callThrough();
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  const testMethod = (callback: Callback) =>
    getSpec(fakeRequest(), null, callback);

  it('calls validate() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(
        fakeRequest(), 'GET', '/');
      done();
    });
  });

  it('calls respond() with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(
        callback, fakeRequest(), spec());
      done();
    };
    testMethod(callback);
  });

  it('calls respondWithError() if validate() produces an error', (done: Callback) => {
    const fakeError = new ApiError('validate()');
    spyOnValidate.and.returnValue(Promise.reject(fakeError));
    const callback = () => {
      expect(spyOnRespondWithError).toHaveBeenCalledWith(callback, fakeRequest(), fakeError);
      done();
    };
    testMethod(callback);
  });
});
