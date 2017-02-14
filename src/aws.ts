import { EC2, S3, StepFunctions } from 'aws-sdk';
import * as https from 'https';
import * as stringify from 'json-stable-stringify';
import * as url from 'url';

import { envNames } from './env';
import { log } from './log';
import { Callback, Dict } from './types';

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

export function sendCloudFormationResponse(event: CloudFormationRequest & CloudFormationResponse,
                                         context: any, callback: Callback) {
  const parsedUrl = url.parse(event.ResponseURL);
  const response = composeCloudFormationResponse(event);
  const request = https.request({
    hostname: parsedUrl.hostname,
    path: parsedUrl.path,
    method: 'PUT',
    headers: {
      'content-length': response.length,
    }
  });
  request.on('error', callback);
  request.end(response, 'utf8', callback);
}

function composeCloudFormationResponse(event: CloudFormationRequest & CloudFormationResponse) {
  return stringify({
    Status: event.Status,
    Reason: event.Reason,
    PhysicalResourceId: event.PhysicalResourceId || event.LogicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: event.Data,
  });
}

const sendCloudFormationOnError = (request: CloudFormationRequest, err: Error, callback: Callback) => {
  if (err) {
    const event: any = Object.assign(request, {
      Status: 'FAILED',
      Reason: err.message,
    });
    this.sendCloudFormationResponse(event, null, () => callback(err));
  } else {
    callback();
  }
}

export function executeStateMachine(event: any, context: any, callback: Callback) {
  stepFunctions.startExecution({
    stateMachineArn: process.env[envNames.stateMachine],
    input: stringify(event),
  }).promise()
    .then(() => callback())
    .catch(callback);
}

export function setupCustomResource(request: CloudFormationRequest, context: any, callback: Callback) {
  log.info(stringify(request));

  process.env[envNames.stateMachine] = request.ResourceProperties['StateMachine'];

  this.executeStateMachine(request, null, (err: Error) => {
    sendCloudFormationOnError(request, err, callback);
  });
}