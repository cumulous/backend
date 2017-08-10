import { APIGateway, Batch, CloudFront, CloudSearch, CloudWatchEvents,
         DynamoDB, EC2, IAM, S3, SSM, StepFunctions, STS } from 'aws-sdk';
import { createHash } from 'crypto';
import * as stringify from 'json-stable-stringify';
import { put } from 'request-promise-native';

import { envNames } from './env';
import { log } from './log';
import { Callback, Dict } from './types';

export const apiGateway = new APIGateway();
export const batch = new Batch();
export const cloudFront = new CloudFront();
export const cloudSearch = new CloudSearch();
export const cloudWatchEvents = new CloudWatchEvents();
export const dynamodb = new DynamoDB.DocumentClient();
export const ec2 = new EC2();
export const iam = new IAM();
export const s3 = new S3({ signatureVersion: 'v4' });
export const ssm = new SSM();
export const stepFunctions = new StepFunctions();
export const sts = new STS();

export type CloudFormationRequestType = 'Create' | 'Update' | 'Delete';

export interface CloudFormationRequest {
  RequestType: CloudFormationRequestType;
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  ResourceProperties: Dict<any>;
  OldResourceProperties?: Dict<any>;
  PhysicalResourceId?: string;
};

export interface CloudFormationResponse {
  Status: 'SUCCESS' | 'FAILED';
  Reason?: string;
  Data?: Dict<any>;
};

export const sendCloudFormationResponse = (event: CloudFormationRequest & CloudFormationResponse,
                                         context: any, callback: Callback) => {
  put(event.ResponseURL, {
    body: stringify({
      Status: event.Status,
      Reason: event.Reason,
      PhysicalResourceId: event.PhysicalResourceId || event.LogicalResourceId,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: event.Data,
    }),
  }).then(() => callback())
    .catch(callback);
};

const sendCloudFormationOnError = (request: CloudFormationRequest, err: Error, callback: Callback) => {
  if (err) {
    const event: any = Object.assign(request, {
      Status: 'FAILED',
      Reason: err.message,
    });
    sendCloudFormationResponse(event, null, () => callback(err));
  } else {
    callback();
  }
};

export const executeStateMachine = (event: any, context: any, callback: Callback) => {
  stepFunctions.startExecution({
    stateMachineArn: process.env[envNames.stateMachine],
    input: stringify(event),
  }).promise()
    .then(() => callback())
    .catch(callback);
};

export const setupCustomResource = (request: CloudFormationRequest, context: any, callback: Callback) => {
  log.info(stringify(request));

  process.env[envNames.stateMachine] = request.ResourceProperties['StateMachine'];

  executeStateMachine(request, null, (err: Error) => {
    sendCloudFormationOnError(request, err, callback);
  });
};
