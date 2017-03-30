import { APIGateway, CloudFront, EC2, S3, StepFunctions } from 'aws-sdk';
import * as stringify from 'json-stable-stringify';
import { put } from 'request-promise-native';

import { envNames } from './env';
import { log } from './log';
import { Callback, Dict } from './types';

export const apiGateway = new APIGateway();
export const cloudFront = new CloudFront();
export const ec2 = new EC2();
export const s3 = new S3({ signatureVersion: 'v4' });
export const stepFunctions = new StepFunctions();

export interface CloudFormationRequest {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
  ResourceProperties?: Dict<any>;
  OldResourceProperties: Dict<any>;
}

export interface CloudFormationResponse {
  Status: 'SUCCESS' | 'FAILED';
  Reason?: string;
  Data?: Dict<any>;
}

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
}

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
}

export const executeStateMachine = (event: any, context: any, callback: Callback) => {
  stepFunctions.startExecution({
    stateMachineArn: process.env[envNames.stateMachine],
    input: stringify(event),
  }).promise()
    .then(() => callback())
    .catch(callback);
}

export const setupCustomResource = (request: CloudFormationRequest, context: any, callback: Callback) => {
  log.info(stringify(request));

  process.env[envNames.stateMachine] = request.ResourceProperties['StateMachine'];

  executeStateMachine(request, null, (err: Error) => {
    sendCloudFormationOnError(request, err, callback);
  });
}

export const deleteS3Object = (event: { Bucket: string, Path: string },
                             context: any, callback: Callback) => {
  if (event == null) {
    return callback(Error('Expected non-empty event with Bucket and Path'));
  };
  s3.deleteObject({
    Bucket: event.Bucket,
    Key: event.Path,
  }).promise()
    .then(() => callback())
    .catch(callback);
}