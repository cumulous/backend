import * as requestPromise from 'request-promise';

import { Callback, Dict } from './types';

export type CloudFormationRequestType = 'Create' | 'Update' | 'Delete';
type CustomResourceStatus = 'SUCCESS' | 'FAILED';

export class CloudFormationRequest {
  RequestType: CloudFormationRequestType;
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
  ResourceProperties?: Dict<any>;
  OldResourceProperties: Dict<any>;

  Status: CustomResourceStatus;
  Reason?: string;
  Data?: Dict<any>;
}

export function sendResponse(event: CloudFormationRequest, context: any, callback: Callback) {
  requestPromise.post({
    uri: event.ResponseURL,
    body: {
      Status: event.Status,
      Reason: event.Reason,
      PhysicalResourceId: event.PhysicalResourceId,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: event.Data,
    },
  }).then(() => callback())
    .catch(callback);
}