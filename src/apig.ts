import * as stringify from 'json-stable-stringify';
import * as zlib from 'zlib';

import { apiGateway } from './aws';
import { envNames } from './env';
import { Callback, Dict } from './types';

const spec = require('./swagger');

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

export interface Request {
  headers?: Dict<string>;
  requestContext?: any;
};

export interface Response {
  statusCode?: number;
  headers?: Dict<string>;
  body?: string;
  isBase64Encoded?: boolean;
};

export const respond = (callback: Callback, request: Request,
    body?: any, statusCode: number = 200, headers?: Dict<string>) => {

  const responseBody = body ? stringify(body, {space: 2}) : body;
  const respondWith = (body?: string, encodingMethod?: string) => {
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

  if (request.headers) {
    compress(respondWith, responseBody, request.headers['Accept-Encoding']);
  } else {
    respondWith(responseBody);
  }
};

const compress = (callback: (bodyCompressed?: string, encodingMethod?: string) => void,
    body: string, encodings: string) => {

  if (body == null) {
    callback(body);
  } else if (/(deflate|\*)/.test(encodings)) {
    zlib.deflate(body, (err: Error, bodyCompressed: Buffer) => {
      callback(bodyCompressed.toString('base64'), 'deflate');
    });
  } else if (/gzip/.test(encodings)) {
    zlib.gzip(Buffer.from(body), (err: Error, bodyCompressed: Buffer) => {
      callback(bodyCompressed.toString('base64'), 'gzip');
    });
  } else {
    callback(body);
  }
};

export const getSpec = (event: Request, context: any, callback: Callback) => {
  respond(callback, event, spec);
};
