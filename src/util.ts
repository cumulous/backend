import * as assert from 'assert';
import { Callback } from './types';

export const uuidNil = '00000000-0000-0000-0000-000000000000';

export const assertNonEmptyArray = (array: any[], name: string) => {
  if (!Array.isArray(array) || array.length === 0) {
    throw Error('Expected non-empty ' + name + '[]');
  }
};

export function promise<Arg, Data>(func: (arg: Arg, callback: Callback) => void, arg: Arg) {
  return new Promise((resolve: (data: Data) => void, reject: Callback) =>
    func(arg, (err: Error, data: Data) =>
      err ? reject(err) : resolve(data)));
};

export function promise2<Arg1, Arg2, Data>
    (func: (arg1: Arg1, arg2: Arg2, callback: Callback) => void, arg1: Arg1, arg2: Arg2) {
  return new Promise((resolve: (data: Data) => void, reject: Callback) =>
    func(arg1, arg2, (err: Error, data: Data) =>
      err ? reject(err) : resolve(data)));
};

export const testEqual = (request: { obj: any, obj2: any }, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => assert.deepStrictEqual(request.obj, request.obj2))
    .then(() => callback(null, true))
    .catch(err => {
      if (err.name === 'AssertionError') {
        return callback(null, false);
      }
      throw err;
    })
    .catch(callback);
};
