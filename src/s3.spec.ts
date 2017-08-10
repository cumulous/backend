import * as crypto from 'crypto';
import * as stringify from 'json-stable-stringify';

import { s3 as s3obj } from './aws';
import * as s3 from './s3';
import { listAllObjects, hashObjects, tagObjects } from './s3';
import { fakeReject, fakeResolve, testError } from './fixtures/support';
import { Callback } from './types';

const fakeBucket = 'fake-bucket';
const fakePrefix = 'fake-prefix/';
const fakePath = 'fake/path';
const fakeBody = () => ({
  fake: 'body',
});

const testSimpleMethod = (
      method: string,
      fakeEvent: () => any,
      fakeRequest: () => any,
      fakeResponse?: () => any,
      expectedResponse?: any
    ) => {

  describe(`${method}()`, () => {
    let spyOnS3Method: jasmine.Spy;

    beforeEach(() => {
      spyOnS3Method = spyOn(s3obj, method as any)
        .and.returnValue(fakeResolve(fakeResponse ? fakeResponse() : undefined));
    });

    it(`calls s3.${method}() once with correct parameters`, (done: Callback) => {
      (s3 as any)[method](fakeEvent(), null, () => {
        expect(spyOnS3Method).toHaveBeenCalledWith(fakeRequest());
        expect(spyOnS3Method).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it(`calls callback with correct parameters`, (done: Callback) => {
      (s3 as any)[method](fakeEvent(), null, (err: Error, response: any) => {
        expect(err).toBeFalsy();
        expect(response).toEqual(expectedResponse);
        done();
      });
    });

    describe('calls callback with an error if', () => {
      let event: any;
      beforeEach(() => {
        event = fakeEvent();
      });

      it(`s3.${method}() produces an error`, () => {
        spyOnS3Method.and.returnValue(fakeReject(`s3.${method}()`));
      });

      describe('event is', () => {
        it('null', () => event = null);
        it('undefined', () => event = undefined);
      });

      afterEach((done: Callback) => {
        testError((s3 as any)[method], event, done);
      });
    });
  });
};

testSimpleMethod('putObject', () => ({
  Bucket: fakeBucket,
  Path: fakePath,
  Body: fakeBody(),
}), () => ({
  Bucket: fakeBucket,
  Key: fakePath,
  Body: stringify(fakeBody()),
}));

testSimpleMethod('getObject', () => ({
  Bucket: fakeBucket,
  Path: fakePath,
}), () => ({
  Bucket: fakeBucket,
  Key: fakePath,
}), () => ({
  Body: Buffer.from(stringify(fakeBody())),
}), fakeBody());

testSimpleMethod('deleteObject', () => ({
  Bucket: fakeBucket,
  Path: fakePath,
}), () => ({
  Bucket: fakeBucket,
  Key: fakePath,
}));

describe('s3.listAllObjects()', () => {
  const fakeRequest = () => ({
    Bucket: fakeBucket,
    Prefix: fakePrefix,
  });

  const testMethod = () =>
    listAllObjects(fakeRequest());

  const fakeContinuationToken = (index: number) =>
    'fake-continuation-token-' + index;

  const fakeObjects = (index: number) => [{
    Key: fakePrefix + 'fake-object-A-' + index,
    ETag: 'fake-etag-A-' + index,
  }, {
    Key: fakePrefix + 'fake-object-B-' + index,
    ETag: 'fake-etag-B-' + index,
  }];

  const fakeListResponse = (index: number, truncated = true) => Object.assign({
    Contents: fakeObjects(index),
  }, truncated ? {
    NextContinuationToken: fakeContinuationToken(index),
    IsTruncated: true,
  } : {
    IsTruncated: false,
  });

  let spyOnListAllObjects: jasmine.Spy;

  beforeEach(() => {
    spyOnListAllObjects = spyOn(s3obj, 'listObjectsV2')
      .and.returnValues(
        fakeResolve(fakeListResponse(1)),
        fakeResolve(fakeListResponse(2)),
        fakeResolve(fakeListResponse(3, false)),
      );
  });

  it('calls s3.listObjectsV2() multiple times with correct parameters', (done: Callback) => {
    testMethod().then(() => {
      expect(spyOnListAllObjects.calls.argsFor(0)).toEqual([{
        Bucket: fakeBucket,
        Prefix: fakePrefix,
      }]);
      expect(spyOnListAllObjects.calls.argsFor(1)).toEqual([{
        Bucket: fakeBucket,
        Prefix: fakePrefix,
        ContinuationToken: fakeContinuationToken(1),
      }]);
      expect(spyOnListAllObjects.calls.argsFor(2)).toEqual([{
        Bucket: fakeBucket,
        Prefix: fakePrefix,
        ContinuationToken: fakeContinuationToken(2),
      }]);
      expect(spyOnListAllObjects).toHaveBeenCalledTimes(3);
      done();
    });
  });

  it('resolves correct response', (done: Callback) => {
    testMethod().then(data => {
      expect(data).toEqual(fakeObjects(1).concat(fakeObjects(2)).concat(fakeObjects(3)));
      done();
    });
  });

  describe('responds immediately with an error if s3.listObjectsV2() produces the error', () => {
    const err = Error('s3.listObjectsV2()');
    let calls: number;
    afterEach((done: Callback) => {
      testMethod().catch(e => {
        expect(e).toEqual(err);
        expect(spyOnListAllObjects).toHaveBeenCalledTimes(calls);
        done();
      });
    });
    it('in the initial call', () => {
      spyOnListAllObjects.and.returnValues(
        fakeReject(err),
        fakeResolve(fakeListResponse(2)),
        fakeResolve(fakeListResponse(3, false)),
      );
      calls = 1;
    });
    it('in a subsequent call', () => {
      spyOnListAllObjects.and.returnValues(
        fakeResolve(fakeListResponse(1)),
        fakeReject(err),
        fakeResolve(fakeListResponse(3, false)),
      );
      calls = 2;
    });
    it('in the last call', () => {
      spyOnListAllObjects.and.returnValues(
        fakeResolve(fakeListResponse(1)),
        fakeResolve(fakeListResponse(2)),
        fakeReject(err),
      );
      calls = 3;
    });
  });
});

describe('s3.hashObjects()', () => {
  const fakeKey = (index: number) =>
    fakePrefix + 'fake-object-' + index;

  const fakeETag = (index: number) =>
    'fake-etag-' + index;

  const fakeObject = (index: number) => ({
    Key: fakeKey(index),
    ETag: fakeETag(index),
  });

  const fakeObjects = () => [
    fakeObject(1),
    fakeObject(2),
  ];

  const fakeRequest = () => ({
    Bucket: fakeBucket,
    Prefix: fakePrefix,
  });

  const testMethod = (callback: Callback) =>
    hashObjects(fakeRequest(), null, callback);

  let spyOnListAllObjects: jasmine.Spy;

  beforeEach(() => {
    spyOnListAllObjects = spyOn(s3, 'listAllObjects')
      .and.returnValue(Promise.resolve((fakeObjects())));
  });

  it('calls s3.listAllObjects() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnListAllObjects).toHaveBeenCalledWith(fakeRequest());
      expect(spyOnListAllObjects).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback with correct parameters', (done: Callback) => {
    testMethod((err?: Error, data?: any) => {
      const hash = crypto.createHash('md5');
      hash.update(fakeKey(1));
      hash.update(fakeETag(1));
      hash.update(fakeKey(2));
      hash.update(fakeETag(2));
      expect(err).toBeFalsy();
      expect(data).toEqual(hash.digest('hex'));
      done();
    });
  });

  describe('returns immediately with an error if', () => {
    let err: any;
    let after: () => void;

    let spyOnCreateHash: jasmine.Spy;
    let spyOnUpdateHash: jasmine.Spy;
    let spyOnDigestHash: jasmine.Spy;

    beforeEach(() => {
      err = jasmine.any(Error);
      after = () => {};

      const hash = crypto.createHash('md5');
      spyOnCreateHash = spyOn(crypto, 'createHash')
        .and.returnValue(hash);
      spyOnUpdateHash = spyOn(hash, 'update')
        .and.callThrough();
      spyOnDigestHash = spyOn(hash, 'digest')
        .and.callThrough();
    });
    afterEach((done: Callback) => {
      testMethod(e => {
        expect(e).toEqual(err);
        after();
        done();
      });
    });
    it('s3.listAllObjects() responds with the error', () => {
      err = Error('s3.listAllObjects()');
      spyOnListAllObjects.and.returnValue(Promise.reject(err));
      after = () => {
        expect(spyOnCreateHash).not.toHaveBeenCalled();
      };
    });
    it('hash.update() throws an error', () => {
      err = Error('hash.update()');
      spyOnUpdateHash.and.throwError(err.message);
      after = () => {
        expect(spyOnDigestHash).not.toHaveBeenCalled();
      };
    });
    it('hash.digest() throws an error', () => {
      err = Error('hash.digest()');
      spyOnDigestHash.and.throwError(err.message);
    });
  });
});

describe('storage.tagObjects()', () => {
  const fakeTagKey = (index: number) =>
    'fake-tag-key-' + index;

  const fakeTagValue = (index: number) =>
    'fake-tag-value-' + index;

  const fakeTag = (index: number) => ({
    Key: fakeTagKey(index),
    Value: fakeTagValue(index),
  });

  const fakeRequest = () => ({
    Bucket: fakeBucket,
    Prefix: fakePrefix,
    Tags: [
      fakeTag(1),
      fakeTag(2),
    ],
  });

  const testMethod = (callback: Callback) =>
    tagObjects(fakeRequest(), null, callback);

  const fakeKey = (index: number) =>
    fakePrefix + 'fake-object-' + index;

  const fakeObject = (index: number) => ({
    Key: fakeKey(index),
  });

  const fakeObjects = () => [
    fakeObject(1),
    fakeObject(2),
  ];

  let spyOnListAllObjects: jasmine.Spy;
  let spyOnPutObjectTagging: jasmine.Spy;

  beforeEach(() => {
    spyOnListAllObjects = spyOn(s3, 'listAllObjects')
      .and.returnValue(Promise.resolve((fakeObjects())));
    spyOnPutObjectTagging = spyOn(s3obj, 'putObjectTagging')
      .and.returnValue(fakeResolve());
  });

  it('calls s3.listAllObjects() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnListAllObjects).toHaveBeenCalledWith(fakeRequest());
      expect(spyOnListAllObjects).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls s3.putObjectTagging() for each object', (done: Callback) => {
    testMethod(() => {
      const fakeTagging = () => ({
        TagSet: [{
          Key: fakeTagKey(1),
          Value: fakeTagValue(1),
        }, {
          Key: fakeTagKey(2),
          Value: fakeTagValue(2),
        }],
      });
      expect(spyOnPutObjectTagging).toHaveBeenCalledWith({
        Bucket: fakeBucket,
        Key: fakeKey(1),
        Tagging: fakeTagging(),
      });
      expect(spyOnPutObjectTagging).toHaveBeenCalledWith({
        Bucket: fakeBucket,
        Key: fakeKey(2),
        Tagging: fakeTagging(),
      });
      expect(spyOnPutObjectTagging).toHaveBeenCalledTimes(2);
      done();
    });
  });

  it('calls callback with correct parameters', (done: Callback) => {
    testMethod((err?: Error, data?: any) => {
      expect(err).toBeFalsy();
      expect(data).toBeFalsy();
      done();
    });
  });

  describe('responds immediately with an error if', () => {
    let err: any;
    let after: () => void;
    beforeEach(() => {
      err = jasmine.any(Error);
      after = () => {};
    });
    afterEach((done: Callback) => {
      testMethod(e => {
        expect(e).toEqual(err);
        after();
        done();
      });
    });
    it('s3.listAllObjects() produces the error', () => {
      err = Error('s3.listAllObjects()');
      spyOnListAllObjects.and.returnValue(Promise.reject(err));
      after = () => {
        expect(spyOnPutObjectTagging).not.toHaveBeenCalled();
      };
    });
    it('s3.putObjectTagging() produces the error', () => {
      err = Error('s3.putObjectTagging()');
      spyOnPutObjectTagging.and.returnValues(fakeResolve(), fakeReject(err));
    });
  });
});
