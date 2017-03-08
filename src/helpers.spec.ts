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

  let spyOnHttpsRequest: jasmine.Spy;
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

    spyOnHttpsRequest = jasmine.createSpyObj('spyOnHttpsRequest', ['on', 'end']);
    (spyOnHttpsRequest as any).end
      .and.callFake((response: string, encoding: string, callback: Callback) => callback());
    spyOnHttpsRequestConstructor = spyOn(https, 'request')
      .and.returnValue(spyOnHttpsRequest);
  });

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
          });
          expect(spyOnHttpsRequestConstructor).toHaveBeenCalledTimes(1);
          done();
        };
        httpsRequest(fakeRequestMethod, fakeUrl, headersInput, body, callback);
      };

      describe('body is', () => {
        describe('defined and headers are', () => {
          const getHeaders = (headers: Dict<any> = {}) => {
            headers['content-length'] = stringify(fakeBody).length;
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

    it('https.request().on() with correct parameters', (done: Callback) => {
      const callback = () => {
        expect((spyOnHttpsRequest as any).on).toHaveBeenCalledWith('error', callback);
        expect((spyOnHttpsRequest as any).on).toHaveBeenCalledTimes(1);
        done();
      };
      httpsRequest(fakeRequestMethod, fakeUrl, fakeHeaders(), fakeBody, callback);
    });

    it('https.request().end() once with correct parameters', (done: Callback) => {
      const callback = () => {
        expect((spyOnHttpsRequest as any).end).toHaveBeenCalledWith(
          stringify(fakeBody), 'utf8', callback);
        expect((spyOnHttpsRequest as any).end).toHaveBeenCalledTimes(1);
        done();
      };
      httpsRequest(fakeRequestMethod, fakeUrl, fakeHeaders(), fakeBody, callback);
    });

    describe('callback with an error if', () => {
      it('url cannot be parsed', (done: Callback) => {
        spyOn(url, 'parse').and.throwError('url.parse()');
        const callback = (err: Error) => {
          expect(err).toBeTruthy();
          done();
        };
        httpsRequest(fakeRequestMethod, fakeUrl, fakeHeaders(), fakeBody, callback);
      });
      it('https.request() produces an error', (done: Callback) => {
        spyOnHttpsRequestConstructor.and.throwError('https.request()');
        const callback = (err: Error) => {
          expect(err).toBeTruthy();
          done();
        };
        httpsRequest(fakeRequestMethod, fakeUrl, fakeHeaders(), fakeBody, callback);
      });
    });
  });
});