import { Callback } from './types';

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
