import * as compression from 'compression';
import * as cors from 'cors';
import * as express from 'express';
import { Request, Response } from 'express';
import * as stringify from 'json-stable-stringify';

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
};

export const makeResponse = (body?: any, statusCode: number = 200, headers?: Dict<string>) => {
  return {
    statusCode: statusCode,
    headers: headers,
    body: stringify(body, {space: 2}),
  };
};

export const getSpec = (request: Request, response: Response) => {
  response.json(spec);
};
