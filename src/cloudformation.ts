import * as https from 'https';
import * as stringify from 'json-stable-stringify';
import * as url from 'url';

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
}

export interface Response {
  Status: 'SUCCESS' | 'FAILED';
  Reason?: string;
  Data?: Dict<any>;
}

export function sendResponse(event: Request & Response, context: any, callback: Callback) {
  const parsedUrl = url.parse(event.ResponseURL);
  const response = stringify({
    Status: event.Status,
    Reason: event.Reason,
    PhysicalResourceId: event.PhysicalResourceId || event.LogicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: event.Data,
  });
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

export function sendOnError(request: Request, err: Error, callback: Callback) {
  if (err) {
    this.sendOnSuccessOrError(request, err, callback);
  } else {
    callback();
  }
}

export function sendOnSuccessOrError(request: Request, err: Error, callback: Callback) {
  const event: any = Object.assign(request, {
    Status: err ? 'FAILED' : 'SUCCESS',
    Reason: err ? err.message : undefined,
  });
  this.sendResponse(event, null, () => callback(err));
}