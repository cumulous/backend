import * as https from 'https';
import * as stringify from 'json-stable-stringify';
import * as url from 'url';

import { Callback, Dict } from './types';

export const testEmpty = (array: any[], name: string) => {
  if (!array || array.length === 0) {
    throw Error('Expected non-empty ' + name + '[]');
  }
};

export const httpsRequest = (
    method: 'GET' | 'PUT' | 'POST',
    Url: string,
    headers: Dict<string>,
    body: any,
    callback: Callback) => {

  try {
    const parsedUrl = url.parse(Url);

    if (body != null) {
      body = stringify(body);
      headers = headers || {};
      headers['Content-Length'] = body.length;
    }

    const request = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: method,
      headers: headers,
    });
    let data = '';
    request.on('data', (chunk: string) => data += chunk);
    request.on('error', callback);
    request.end(body, 'utf8', () =>
      data ? callback(null, JSON.parse(data)) : callback());
  } catch (err) {
    callback(err);
  }
};