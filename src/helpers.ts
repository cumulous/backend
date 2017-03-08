import * as https from 'https';
import * as stringify from 'json-stable-stringify';
import * as url from 'url';

import { Callback, Dict } from './types';

export const testEmpty = (array: any[], name: string) => {
  if (!array || array.length === 0) {
    throw Error('Expected non-empty ' + name + '[]');
  }
};

export const httpsRequest = (Url: string,
                         method: 'GET' | 'PUT' | 'POST',
                         headers: Dict<string>,
                           body: any,
                       callback: Callback) => {
  try {
    const parsedUrl = url.parse(Url);

    if (body != null) {
      body = stringify(body);
      headers = headers || {};
      headers['content-length'] = body.length;
    }

    const request = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: method,
      headers: headers,
    });
    request.on('error', callback);
    request.end(body, 'utf8', callback);
  } catch (err) {
    callback(err);
  }
};