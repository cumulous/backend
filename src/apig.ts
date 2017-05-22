import * as compression from 'compression';
import * as cors from 'cors';
import * as express from 'express';
import * as stringify from 'json-stable-stringify';
import * as zlib from 'zlib';

const awsExpress = require('aws-serverless-express');
const awsExpressMiddleware = require('aws-serverless-express/middleware');
const swagger = require('swagger-tools');

import { apiGateway } from './aws';
import { envNames } from './env';
import { Callback, Dict } from './types';

const spec = require('./swagger');

export { compression, cors, express };

export const binaryMimeTypes = [
  'application/json',
];

export const createApp = (swaggerMiddleware: any) => {
  const app = this.express();

  app.use(swaggerMiddleware.swaggerMetadata());
  app.use(swaggerMiddleware.swaggerValidator());
  app.use(awsExpressMiddleware.eventContext());
  app.use(this.compression());
  app.use(this.cors({
    origin: `https://${process.env[envNames.webDomain]}`,
    credentials: true,
  }));

  app.get('/', getSpec);

  return app;
};

export const createServer = (callback: (server: any) => void) => {
  swagger.initializeMiddleware(spec, (middleware: any) => {
    const app = createApp(middleware);
    const server = awsExpress.createServer(app, null, binaryMimeTypes);
    callback(server);
  });
};

export const proxy = (event: any, context: any) => {
  createServer((server: any) => {
    awsExpress.proxy(server, event, context);
  });
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

export interface Response {
  statusCode?: number;
  headers?: Dict<string>;
  body?: string;
  isBase64Encoded?: boolean;
};

export const respond = (callback: Callback,
    body?: any, statusCode: number = 200, headers?: Dict<string>, requestHeaders?: Dict<string>) => {

  const responseBody = body ? stringify(body, {space: 2}) : body;
  const respondWith = (body?: string, encodingMethod?: string) => {
    const response: Response = {
      statusCode,
      headers: Object.assign({
        'Access-Control-Allow-Origin': `https://${process.env[envNames.webDomain]}`,
        'Access-Control-Allow-Credentials': 'true',
      }, headers),
      body,
    };
    if (encodingMethod) {
      response.headers['Content-Encoding'] = encodingMethod;
      response.isBase64Encoded = true;
    }
    callback(null, response);
  };

  if (requestHeaders) {
    compress(responseBody, requestHeaders['Accept-Encoding'], respondWith);
  } else {
    respondWith(responseBody);
  }
};

const compress = (body: string, encodings: string,
    callback: (bodyCompressed?: string, encodingMethod?: string) => void) => {

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

export const getSpec = (event: any, context: any, callback: Callback) => {
  respond(callback, spec);
};
