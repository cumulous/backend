import * as requestPromise from 'request-promise';

import { log } from './log';
import { Callback, Dict } from './types';

export interface Request {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
  ResourceProperties?: Dict<any>;
  OldResourceProperties: Dict<any>;
};

export interface Response {
  Status: 'SUCCESS' | 'FAILED';
  Reason?: string;
  Data?: Dict<any>;
};

export function sendResponse(event: Request & Response, context: any, callback: Callback) {
  log.info(JSON.stringify(event));
  requestPromise.put(event.ResponseURL, {
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
};

export function sendOnError(request: Request, err: Error, callback: Callback) {
  if (err) {
    const event: any = Object.assign(request, {
      Status: 'FAILED',
      Reason: err.message,
    });
    this.sendResponse(event, null, () => callback(err));
  } else {
    callback();
  }
}