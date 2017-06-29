import { Credentials } from 'aws-sdk/clients/sts';
import * as stringify from 'json-stable-stringify';
import { v4 as uuid } from 'uuid';

import { Request, respond, respondWithError, validate } from './apig';
import { dynamodb, sts } from './aws';
import { envNames } from './env';
import { query } from './search';
import { Callback } from './types';

export const create = (request: Request, context: any, callback: Callback) => {
  const date = new Date().toISOString();
  const id = uuid();
  const item = () => ({
    id: id,
    project_id: request.body.project_id,
    creator_id: request.requestContext.authorizer.principalId,
    created_at: date,
    description: request.body.description,
    status: 'created',
  });

  validate(request, 'POST', '/datasets')
    .then(() => dynamodb.put({
      TableName: process.env[envNames.datasetsTable],
      Item: item(),
      ConditionExpression: 'attribute_not_exists(id)',
    }).promise())
    .then(() => respond(callback, request, item()))
    .catch(err => respondWithError(callback, request, err));
};

export const list = (request: Request, context: any, callback: Callback) => {
  query(request, '/datasets', ['project_id', 'status'], callback);
};

export type CredentialsAction = 'upload' | 'download';

export const requestCredentials = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/datasets/{dataset_id}/credentials')
    .then(() => dynamodb.update(
      credentialsUpdateRequest(request.pathParameters.dataset_id, request.body.action)
    ).promise())
    .then(() => sts.assumeRole({
      RoleArn: process.env[envNames.datasetsRole],
      RoleSessionName: request.pathParameters.dataset_id,
      Policy: credentialsPolicy(request.pathParameters.dataset_id, request.body.action),
    }).promise())
    .then(data => credentialsResponse(
      request.pathParameters.dataset_id, request.body.action, data.Credentials,
    ))
    .then(response => respond(callback, request, response))
    .catch(err => respondWithError(callback, request, err));
};

const credentialsUpdateRequest = (id: string, action: CredentialsAction) => Object.assign({
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
});

const credentialsPolicy = (id: string, action: CredentialsAction) => stringify({
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Action: 's3:ListBucket',
    Resource: `arn:aws:s3:::${process.env[envNames.datasetsBucket]}`,
    Condition: {
      StringLike: {
        's3:prefix': `${id}/*`,
      },
    },
  }, {
    Effect: 'Allow',
    Action: action === 'upload' ? [
      's3:GetObject',
      's3:PutObject',
    ] : [
      's3:GetObject',
    ],
    Resource: `arn:aws:s3:::${process.env[envNames.datasetsBucket]}/${id}/*`,
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
  bucket: process.env[envNames.datasetsBucket],
});
