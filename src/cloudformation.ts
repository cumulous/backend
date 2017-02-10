import * as requestPromise from 'request-promise';

import * as stringify from 'json-stable-stringify';
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
  requestPromise.put({
    uri: event.ResponseURL,
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
};