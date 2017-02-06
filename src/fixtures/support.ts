import { log } from '../log';
import { Callback } from '../types';

export const fakeResolve = (value?: any) => ({
  promise : () => Promise.resolve(value),
});

export const fakeReject = (reason?: Error | string) => ({
  promise : () => {
    if (reason == null) {
      return Promise.reject(Error());
    } else if (typeof reason === 'string') {
      return Promise.reject(Error(reason));
    } else {
      return Promise.reject(reason);
    }
  },
});

export const testError = (lambda: Function, event: any, done: Callback, error: boolean = true) => {
  if (done) {
    lambda(event, null, (err: Error) => {
      error ? expect(err).toBeTruthy() : expect(err).toBeFalsy();
      if (error) log.error(err.message);
      done();
    });
  } else {
    const call = () => lambda(event, null, () => {});
    error ? expect(call).toThrow() : expect(call).not.toThrow();
  }
};

export const testArray = (lambda: Function, getEvent: () => any,
                          arrayName: string, handled: boolean = true) => {
  describe(arrayName + ' is', () => {
    let event: any;
    beforeEach(() => {
      event = getEvent();
    })
    afterEach((done: Callback) => {
      if (handled) {
        testError(lambda, event, done);
      } else {
        testError(lambda, event, null);
        done();
      }
    });
    const setEvent = (value: any) => {
      if (Array.isArray(event)) {
        event = value;
      } else {
        event[arrayName] = value;
      }
    };
    it('undefined', () => {
      setEvent(undefined);
    });
    it('null', () => {
      setEvent(null);
    });
    it('empty', () => {
      setEvent([]);
    });
  });
};