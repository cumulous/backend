import * as express from 'express';
import * as stringify from 'json-stable-stringify';

const awsExpress = require('aws-serverless-express');
const swagger = require('swagger-tools');

import { apiGateway } from './aws';
import { Callback, Dict } from './types';

const spec = require('./swagger');

export const app = express;

export const createApp = (middleware: any) => {
  const app = this.app();

  app.use(middleware.swaggerMetadata());
  app.use(middleware.swaggerValidator());

  return app;
};

export const createServer = (callback: (server: any) => void) => {
  swagger.initializeMiddleware(spec, (middleware: any) => {
    const app = createApp(middleware);
    const server = awsExpress.createServer(app);
    callback(server);
  });
};

export const proxy = (event: any, context: any, callback: Callback) => {
  createServer((server: any) => {
    awsExpress.proxy(server, event, context);
    callback();
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

export const getSpec = (event: any, context: any, callback: Callback) => {
  callback(null, makeResponse(spec));
};
