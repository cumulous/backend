import * as assert from 'assert';

import { Callback } from './types';
import { testEqual } from './util';

describe('util.testEqual()', () => {
  const fakeObj = () => ({
    a: {
      b: 1,
    },
  });
  const fakeObj2 = () => ({
    a: {
      b: 2,
    },
  });
  const fakeRequest = () => ({
    obj: fakeObj(),
    obj2: fakeObj2(),
  });

  const testMethod = (callback: Callback) =>
    testEqual(fakeRequest(), null, callback);

  let spyOnDeepEqual: jasmine.Spy;

  beforeEach(() => {
    spyOnDeepEqual = spyOn(assert, 'deepStrictEqual');
  });

  it('calls assert.deepEqual() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDeepEqual).toHaveBeenCalledWith(fakeObj(), fakeObj2());
      done();
    });
  });

  describe('calls callback with correct parameters if', () => {
    it('assert.deepEqual() does not throw an exception', (done: Callback) => {
      testMethod((err?: Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toBe(true);
        done();
      });
    });
    it('assert.deepEqual() throws AssertionError', (done: Callback) => {
      spyOnDeepEqual.and.callFake(() => {
        const err = Error('AssertionError');
        err.name = 'AssertionError';
        throw err;
      });
      testMethod((err?: Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toBe(false);
        done();
      });
    });
    it('assert.deepEqual() throws a generic error', (done: Callback) => {
      spyOnDeepEqual.and.throwError('GenericError');
      testMethod((err?: Error, data?: any) => {
        expect(err).toBeTruthy();
        expect(data).toBeFalsy();
        done();
      });
    });
    it('request is undefined', (done: Callback) => {
      testEqual(undefined, null, (err?: Error, data?: any) => {
        expect(err).toBeTruthy();
        expect(data).toBeFalsy();
        done();
      });
    });
    it('request is null', (done: Callback) => {
      testEqual(null, null, (err?: Error, data?: any) => {
        expect(err).toBeTruthy();
        expect(data).toBeFalsy();
        done();
      });
    });
  });
});
