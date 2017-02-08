import * as requestPromise from 'request-promise';

import { Callback, Dict } from './types';

type CustomResourceStatus = 'SUCCESS' | 'FAILED';

export class CloudFormationRequest {
  RequestType: 'Create' | 'Update' | 'Delete';
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

export function sendCloudFormationResponse(event: CloudFormationRequest, context: any, callback: Callback) {
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