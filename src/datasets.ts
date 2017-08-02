import { Credentials } from 'aws-sdk/clients/sts';
import * as stringify from 'json-stable-stringify';
import { v4 as uuid } from 'uuid';

import { ApiError, Request, respond, respondWithError, validate } from './apig';
import { dynamodb, s3, sts } from './aws';
import { envNames } from './env';
import { query } from './search';
import { Callback } from './types';

export const create = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/datasets')
    .then(() => generateDataset(request))
    .then(dataset => dynamodb.put({
      TableName: process.env[envNames.datasetsTable],
      Item: dataset,
      ConditionExpression: 'attribute_not_exists(id)',
    }).promise()
      .then(() => respond(callback, request, dataset)))
    .catch(err => respondWithError(callback, request, err));
};

const generateDataset = (request: Request) => ({
  id: uuid(),
  project_id: request.body.project_id,
  description: request.body.description,
  created_by: request.requestContext.authorizer.principalId,
  created_at: new Date().toISOString(),
  status: 'created',
});

export const list = (request: Request, context: any, callback: Callback) => {
  query(request, '/datasets', ['project_id', 'status'], callback);
};

export type CredentialsAction = 'upload' | 'download';

export const requestCredentials = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/datasets/{dataset_id}/credentials')
    .then(() => setStatusForCredentialsRequest(request.pathParameters.dataset_id, request.body.action))
    .then(() => sts.assumeRole({
      RoleArn: process.env[envNames.roleArn],
      RoleSessionName: request.pathParameters.dataset_id,
      Policy: credentialsPolicy(request.pathParameters.dataset_id, request.body.action),
    }).promise())
    .then(data => credentialsResponse(
      request.pathParameters.dataset_id, request.body.action, data.Credentials,
    ))
    .then(response => respond(callback, request, response))
    .catch(err => respondWithError(callback, request, err));
};

const setStatusForCredentialsRequest = (id: string, action: CredentialsAction) => {
  return dynamodb.update(Object.assign({
    TableName: process.env[envNames.datasetsTable],
    Key: {
      id,
    },
    ExpressionAttributeNames: {
      '#s': 'status',
    },
  }, action === 'upload' ? {
    UpdateExpression: 'set #s = :u',
    ConditionExpression: '(#s = :c) or (#s = :u)',
    ExpressionAttributeValues: {
      ':c': 'created',
      ':u': 'uploading',
    },
  } : {
    ConditionExpression: '#s = :a',
    ExpressionAttributeValues: {
      ':a': 'available',
    },
  })).promise()
    .catch(err => {
      if (err.code === 'ConditionalCheckFailedException') {
        err = new ApiError('Conflict', ['Dataset status must equal ' +
          (action === 'upload' ? "'created' or 'uploading'" : "'available'") +
          ` for '${action}' request`], 409);
      }
      throw err;
    });
};

const credentialsPolicy = (id: string, action: CredentialsAction) => stringify({
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Action: 's3:ListBucket',
    Resource: `arn:aws:s3:::${process.env[envNames.dataBucket]}`,
    Condition: {
      StringLike: {
        's3:prefix': `${id}-d/*`,
      },
    },
  }, {
    Effect: 'Allow',
    Action: action === 'upload' ? [
      's3:GetObject',
      's3:PutObject',
      's3:DeleteObject',
    ] : [
      's3:GetObject',
    ],
    Resource: `arn:aws:s3:::${process.env[envNames.dataBucket]}/${id}-d/*`,
  }],
});

const credentialsResponse = (id: string, action: CredentialsAction, creds: Credentials) => ({
  id,
  action,
  credentials: {
    access_key_id: creds.AccessKeyId,
    secret_access_key: creds.SecretAccessKey,
    session_token: creds.SessionToken,
  },
  expires_at: creds.Expiration,
  bucket: process.env[envNames.dataBucket],
  prefix: `${id}-d/`,
});

export type StorageType = 'available' | 'archived';

export const setStorage = (request: Request, context: any, callback: Callback) => {
  validate(request, 'PUT', '/datasets/{dataset_id}/storage')
    .then(() => setStorageType(request.pathParameters.dataset_id, request.body.type))
    .then(dataset => dataset.status === 'available' ? null : listObjects(dataset.id)
      .then(keys => checkEmptyObjectList(keys, dataset.id))
      .then(keys => tagObjects(keys, dataset.project_id)))
    .then(() => respond(callback, request, {
      id: request.pathParameters.dataset_id,
      type: request.body.type,
    }))
    .catch(err => respondWithError(callback, request, err));
};

const setStorageType = (id: string, type: StorageType) => {
  if (type === 'available') {
    return dynamodb.update({
      TableName: process.env[envNames.datasetsTable],
      Key: {
        id,
      },
      UpdateExpression: 'set #s = :a',
      ConditionExpression: '(#s = :u) or (#s = :a)',
      ExpressionAttributeNames: {
        '#s': 'status',
      },
      ExpressionAttributeValues: {
        ':a': 'available',
        ':u': 'uploading',
      },
      ReturnValues: 'ALL_OLD',
    }).promise()
      .then(data => data.Attributes)
      .catch(err => {
        if (err.code === 'ConditionalCheckFailedException') {
          err = new ApiError('Conflict',
            ["Dataset can only be made 'available' from 'uploading' state"], 409);
        }
        throw err;
      });
  } else {
    throw new ApiError('Not Implemented', ['Archival is not implemented yet'], 501);
  }
};

const listObjects = (id: string, token?: string): Promise<string[]> => {
  return s3.listObjectsV2(Object.assign({
    Bucket: process.env[envNames.dataBucket],
    Prefix: `${id}-d/`,
  }, token == null ? {} : {
    ContinuationToken: token,
  })).promise()
    .then(data => {
      const keys = data.Contents.map(obj => obj.Key);
      if (data.IsTruncated) {
        return listObjects(id, data.NextContinuationToken)
          .then(nextKeys => keys.concat(nextKeys));
      } else {
        return keys;
      }
    });
};

const checkEmptyObjectList = (keys: string[], id: string) => {
  return keys.length > 0 ? keys :
    dynamodb.update({
      TableName: process.env[envNames.datasetsTable],
      Key: {
        id,
      },
      UpdateExpression: 'set #s = :u',
      ExpressionAttributeNames: {
        '#s': 'status',
      },
      ExpressionAttributeValues: {
        ':u': 'uploading',
      },
    }).promise()
      .then(() => {
        throw new ApiError('Conflict', ["Empty datasets cannot be made 'available'"], 409);
      }) as Promise<string[]>;
};

const tagObjects = (keys: string[], project_id: string) => {
  return Promise.all(keys.map(key => s3.putObjectTagging({
    Bucket: process.env[envNames.dataBucket],
    Key: key,
    Tagging: {
      TagSet: [{
        Key: 'project_id',
        Value: project_id,
      }],
    },
  }).promise()));
};
