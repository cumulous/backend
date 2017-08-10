import { S3 } from 'aws-sdk';
import { createHash } from 'crypto';
import * as stringify from 'json-stable-stringify';

import { s3 } from './aws';
import { Callback } from './types';

export const putObject = (
      event: { Bucket: string, Path: string, Body: any },
      context: any, callback: Callback
    ) => {
  if (event == null) {
    return callback(Error('Expected non-empty event with Bucket, Path and Body'));
  };
  s3.putObject({
    Bucket: event.Bucket,
    Key: event.Path,
    Body: stringify(event.Body),
  }).promise()
    .then(() => callback())
    .catch(callback);
};

export const getObject = (
      event: { Bucket: string, Path: string },
      context: any, callback: Callback
    ) => {
  if (event == null) {
    return callback(Error('Expected non-empty event with Bucket and Path'));
  };
  s3.getObject({
    Bucket: event.Bucket,
    Key: event.Path,
  }).promise()
    .then(data => JSON.parse(data.Body.toString()))
    .then(body => callback(null, body))
    .catch(callback);
};

export const deleteObject = (
      event: { Bucket: string, Path: string },
      context: any, callback: Callback
    ) => {
  if (event == null) {
    return callback(Error('Expected non-empty event with Bucket and Path'));
  };
  s3.deleteObject({
    Bucket: event.Bucket,
    Key: event.Path,
  }).promise()
    .then(() => callback())
    .catch(callback);
};

export const listAllObjects = (request: S3.ListObjectsV2Request): Promise<S3.Object[]> => {
  return Promise.resolve()
    .then(() => s3.listObjectsV2(Object.assign({
      Bucket: request.Bucket,
      Prefix: request.Prefix,
    }, request.ContinuationToken == null ? {} : {
      ContinuationToken: request.ContinuationToken,
    })).promise())
    .then(data => !data.IsTruncated ? data.Contents :
      listAllObjects({
        Bucket: request.Bucket,
        Prefix: request.Prefix,
        ContinuationToken: data.NextContinuationToken,
      }).then(nextData =>
        data.Contents.concat(nextData)
      )
    );
};

export const hashObjects = (request: S3.ListObjectsV2Request, context: any, callback: Callback) => {
  listAllObjects(request)
    .then(objects => {
      const hash = createHash('md5');
      objects.forEach(obj => {
        hash.update(obj.Key);
        hash.update(obj.ETag);
      });
      callback(null, hash.digest('hex'));
    })
    .catch(callback);
};

export const tagObjects = (
      request: S3.ListObjectsV2Request & { Tags: S3.Tag[] },
      context: any, callback: Callback
    ) => {
  listAllObjects(request)
    .then(objects => Promise.all(objects.map(obj => s3.putObjectTagging({
      Bucket: request.Bucket,
      Key: obj.Key,
      Tagging: {
        TagSet: request.Tags,
      },
    }).promise())))
    .then(() => callback())
    .catch(callback);
};
