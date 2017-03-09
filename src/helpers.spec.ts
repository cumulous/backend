import * as https from 'https';
import * as stringify from 'json-stable-stringify';
import * as url from 'url';

import { httpsRequest } from './helpers';
import { Callback, Dict } from './types';

describe('httpsRequest()', () => {
  const fakeValue1 = 'fake-value-1';
  const fakeValue2 = 2;
  const fakeHostname = 'host.example.com';
  const fakePath = '/fake/path';
  const fakeRequestMethod = 'PUT';

  let fakeUrl: string;
  let fakeBody: any;
  let fakeHeaders: () => Dict<any>;
  let fakeResponse: any;

  let spyOnHttpsRequest: jasmine.Spy;
  let spyOnHttpsResponse: jasmine.Spy;
  let spyOnHttpsRequestConstructor: jasmine.Spy;

  beforeEach(() => {
    fakeUrl = 'https://' + fakeHostname + fakePath;
    fakeBody = {
      fakeProperty1: fakeValue1,
      fakeProperty2: fakeValue2,
    };
    fakeHeaders = () => ({
      'fake-header': 'fake-value',
    });
    fakeResponse = {
      fake: 'response',
    };

    spyOnHttpsRequest = jasmine.createSpyObj('spyOnHttpsRequest', ['on', 'end']);
    spyOnHttpsRequestConstructor = spyOn(https, 'request')
      .and.callFake((options: any, callback: (response: any) => void) => {
        (spyOnHttpsRequest as any).callback = callback;
        return spyOnHttpsRequest;
      });
    spyOnHttpsResponse = jasmine.createSpyObj('spyOnHttpsResponse', ['on']);
    (spyOnHttpsResponse as any).on
      .and.callFake((event: string, callback: (data?: any) => void) => {
        if (event === 'data') {
          callback(stringify(fakeResponse).substring(0, 5));
          callback(stringify(fakeResponse).substring(5));
        } else if (event === 'end') {
          callback();
        }
      });
    (spyOnHttpsRequest as any).end
      .and.callFake((body: string) => {
        (spyOnHttpsRequest as any).callback(spyOnHttpsResponse);
      });
  });

  const testMethod = (callback: Callback) => {
    httpsRequest(fakeRequestMethod, fakeUrl, fakeHeaders(), fakeBody, callback);
  };

  describe('calls', () => {
    describe('https.request() once with correct parameters when', () => {
      const checkRequest =
          (headersInput: Dict<any>, headersOutput: Dict<any>, body: any, done: Callback) => {
        const callback = () => {
          expect(spyOnHttpsRequestConstructor).toHaveBeenCalledWith({
            hostname: fakeHostname,
            path: fakePath,
            method: fakeRequestMethod,
            headers: headersOutput,
          }, jasmine.any(Function));
          expect(spyOnHttpsRequestConstructor).toHaveBeenCalledTimes(1);
          done();
        };
        httpsRequest(fakeRequestMethod, fakeUrl, headersInput, body, callback);
      };

      describe('body is', () => {
        describe('defined and headers are', () => {
          const getHeaders = (headers: Dict<any> = {}) => {
            headers['Content-Length'] = stringify(fakeBody).length;
            return headers;
          };

          it('defined', (done: Callback) => {
            checkRequest(fakeHeaders(), getHeaders(fakeHeaders()), fakeBody, done);
          });
          it('undefined', (done: Callback) => {
            checkRequest(undefined, getHeaders(), fakeBody, done);
          });
          it('null', (done: Callback) => {
            checkRequest(null, getHeaders(), fakeBody, done);
          });
        });

        it('undefined', (done: Callback) => {
          checkRequest(fakeHeaders(), fakeHeaders(), undefined, done);
        });
      });
    });

    it('https.request().on() once with correct parameters', (done: Callback) => {
      const callback = () => {
        expect((spyOnHttpsRequest as any).on).toHaveBeenCalledWith('error', callback);
        expect((spyOnHttpsRequest as any).on).toHaveBeenCalledTimes(1);
        done();
      };
      testMethod(callback);
    });

    it('https.request().end() once with correct parameter', (done: Callback) => {
      const callback = () => {
        expect((spyOnHttpsRequest as any).end).toHaveBeenCalledWith(stringify(fakeBody));
        expect((spyOnHttpsRequest as any).end).toHaveBeenCalledTimes(1);
        done();
      };
      testMethod(callback);
    });

    it('callback with correct data upon successful request that returns data', (done: Callback) => {
      const callback = (err: Error, data: any) => {
        expect(data).toEqual(fakeResponse);
        done();
      };
      testMethod(callback);
    });

    it('callback without an error upon successful request that does not return data', (done: Callback) => {
      (spyOnHttpsResponse as any).on
        .and.callFake((event: string, callback: (data?: any) => void) => {
          if (event === 'end') {
            callback();
          }
        });
      const callback = (err: Error) => {
        expect(err).toBeFalsy();
        done();
      };
      testMethod(callback);
    });

    describe('callback with an error', () => {
      it('if url cannot be parsed', (done: Callback) => {
        spyOn(url, 'parse').and.throwError('url.parse()');
        const callback = (err: Error) => {
          expect(err).toBeTruthy();
          done();
        };
        testMethod(callback);
      });
      it('if https.request() produces an error', (done: Callback) => {
        spyOnHttpsRequestConstructor.and.throwError('https.request()');
        const callback = (err: Error) => {
          expect(err).toBeTruthy();
          done();
        };
        testMethod(callback);
      });
      it('on "error" event', (done: Callback) => {
        (spyOnHttpsRequest as any).on
          .and.callFake((event: string, callback: (err: Error) => void) => {
            if (event === 'error') {
              callback(Error('"error" event'));
            }
          });
        (spyOnHttpsRequest as any).end
          .and.callFake(() => {});
        const callback = (err: Error) => {
          expect(err).toBeTruthy();
          done();
        };
        testMethod(callback);
      });
      it('if data could not be parsed', (done: Callback) => {
        (spyOnHttpsResponse as any).on
          .and.callFake((event: string, callback: (data?: any) => void) => {
            if (event === 'data') {
              callback(stringify(fakeResponse) + '{');
            } else if (event === 'end') {
              callback();
            }
          });
        const callback = (err: Error) => {
          expect(err).toBeTruthy();
          done();
        };
        testMethod(callback);
      });
    });
  });
});