import * as Ajv from 'ajv';
import * as stringify from 'json-stable-stringify';
import * as jsonpath from 'jsonpath';
import * as zlib from 'zlib';

import { apiGateway } from './aws';
import { envNames } from './env';
import { log } from './log';
import { Callback, Dict, HttpMethod } from './types';

export interface Request {
  pathParameters?: Dict<string>;
  queryStringParameters?: Dict<string>;
  headers?: Dict<string>;
  body?: any;
  requestContext?: any;
};

export interface Response {
  statusCode?: number;
  headers?: Dict<string>;
  body?: string;
  isBase64Encoded?: boolean;
};

export class ApiError implements Error {
  name: string;
  message: string;
  errors?: string[];
  code?: number;
  stack?: string;

  constructor(message: string, errors?: string[], code = 500) {
    this.message = message;
    this.errors = errors;
    this.code = code;
  }

  static toString(err: ApiError) {
    return stringify({
      message: err.message,
      code: err.code,
      errors: err.errors,
      stack: err.stack,
    });
  }
};

export const spec = () => require('./swagger');

export const ajv = Ajv({
  allErrors: true,
  coerceTypes: true,
  removeAdditional: true,
  useDefaults: true,
});

export const validate = (request: Request, method: HttpMethod, resource: string) => {
  return Promise.resolve(spec())
    .then(spec => {
      ajv.compile(Object.assign({$id: 'spec'}, spec));
      return spec.paths[resource][method.toLowerCase()].parameters;
    })
    .then(parameters => parameters.map((parameter: { $ref: string }) =>
      validateParameter(request, parameter.$ref)))
    .then(collectErrors);
};

interface Model {
  in: string;
  name: string;
  default?: string;
  required?: boolean;
}

const validateParameter = (request: Request, modelRef: string) => {
  const modelPath = modelRef.replace(/\//g, '.').substring(2);
  const model: Model = jsonpath.value(spec(), modelPath);
  const schemaRef = `spec${modelRef}${model.in === 'body' ? '/schema' : ''}`;
  let value = getRequestValue(request, model);

  if (value == null) {
    if (model.required) {
      if (model.in === 'body') {
        value = {};
      }
    } else if (model.default !== undefined) {
      return setDefaultValue(request, model);
    } else {
      return null;
    }
  }
  if (ajv.validate(schemaRef, value)) {
    if (model.in === 'body') {
      request.body = value;
    }
    return null;
  } else {
    return ajv.errors.map(error => {
      const dataPath = model.in === 'body' ? error.dataPath : `.${model.name}`;
      return `${model.in}${dataPath} ${error.message}`;
    });
  }
};

const getHeaderValue = (request: Request, headerName: string) => {
  const name = RegExp(`^${headerName}$`, 'i');
  const header = jsonpath.nodes(request, 'headers.*')
    .find(node => name.test(String(node.path[2])));
  return header == null ? header : header.value;
};

const getRequestValue = (request: Request, model: Model) => {
  switch (model.in) {
    case 'path':
      return jsonpath.value(request, `pathParameters.${model.name}`);
    case 'query':
      return jsonpath.value(request, `queryStringParameters.${model.name}`);
    case 'header':
      return getHeaderValue(request, model.name);
    case 'body':
      const body = jsonpath.value(request, 'body');
      return typeof body === 'string' ? JSON.parse(body) : null;
    default:
      throw new ApiError(`${model.in} parameters are not supported`);
  }
};

const setDefaultValue = (request: Request, model: Model) => {
  switch (model.in) {
    case 'query':
      request.queryStringParameters = request.queryStringParameters || {};
      request.queryStringParameters[model.name] = model.default;
      break;
    case 'header':
      request.headers = request.headers || {};
      request.headers[model.name] = model.default;
      break;
  }
};

const collectErrors = (errs: string[][]) => {
  const errors = [].concat.apply([], errs)
    .filter((error: string) => !!error);

  if (errors.length) {
    throw new ApiError('Invalid request', errors, 400);
  }
};

export const respond = (callback: Callback, request: Request,
    body?: any, statusCode: number = 200, headers?: Dict<string>) => {

  const responseBody = body == null ? body : stringify(body, {space: 2});
  const respondWith = (err?: Error, body?: string, encodingMethod?: string) => {
    if (err) return callback(err);

    const response: Response = {
      statusCode,
      headers: Object.assign({
        'Access-Control-Allow-Origin': `https://${process.env[envNames.webDomain]}`,
        'Access-Control-Allow-Credentials': 'true',
        'Vary': 'Accept-Encoding',
      }, headers),
      body,
    };
    if (encodingMethod) {
      response.headers['Content-Encoding'] = encodingMethod;
      response.isBase64Encoded = true;
    }
    callback(null, response);
  };

  if (request && request.headers) {
    compress(respondWith, responseBody, getHeaderValue(request, 'Accept-Encoding'));
  } else {
    respondWith(null, responseBody);
  }
};

export const respondWithError = (callback: Callback, request: Request, err: ApiError) => {
  if (err.code == null || err.code == 500) {
    log.error(ApiError.toString(err));
    err = new ApiError('Internal server error', undefined, 500);
  }
  const body = { message: err.message, errors: err.errors };
  !body.errors && delete body.errors;
  respond(callback, request, body, err.code);
};

const compress = (callback: (err?: Error, bodyCompressed?: string, encodingMethod?: string) => void,
    body: string, encodings: string) => {

  if (body == null) {
    callback(null, body);
  } else if (/(deflate|\*)/.test(encodings)) {
    zlib.deflate(body, (err: Error, bodyCompressed: Buffer) => {
      callback(err, err ? null : bodyCompressed.toString('base64'), 'deflate');
    });
  } else if (/gzip/.test(encodings)) {
    zlib.gzip(Buffer.from(body), (err: Error, bodyCompressed: Buffer) => {
      callback(err, err ? null : bodyCompressed.toString('base64'), 'gzip');
    });
  } else {
    callback(null, body);
  }
};

export const getSpec = (request: Request, context: any, callback: Callback) => {
  validate(request, 'GET', '/')
    .then(() => respond(callback, request, spec()))
    .catch(err => respondWithError(callback, request, err));
};

export const createDomainName = (event: { Name: string, Certificate: string },
                               context: any, callback: Callback) => {
  if (event == null) {
    return callback(Error('Expected non-empty event with Name and Certificate'));
  };
  apiGateway.createDomainName({
    domainName: event.Name,
    certificateName: event.Name,
    certificateArn: event.Certificate,
  }).promise()
    .then(data => callback(null, data.distributionDomainName))
    .catch(callback);
};

export const updateDomainName = (event: { Name: string, Certificate: string },
                               context: any, callback: Callback) => {
  if (event == null) {
    return callback(Error('Expected non-empty event with Name and Certificate'));
  };
  apiGateway.updateDomainName({
    domainName: event.Name,
    patchOperations: [{
      op: 'replace',
      path: '/certificateArn',
      value: event.Certificate,
    }],
  }).promise()
    .then(data => callback(null, data.distributionDomainName))
    .catch(callback);
};

export const deleteDomainName = (name: string,
                              context: any, callback: Callback) => {
  apiGateway.deleteDomainName({
    domainName: name,
  }).promise()
    .then(() => callback())
    .catch(callback);
};
