import { v4 as uuid } from 'uuid';

import { ApiError, Request, respond, respondWithError, validate } from './apig';
import { dynamodb, s3 } from './aws';
import { envNames } from './env';
import { query } from './search';
import { Callback, Dict } from './types';

export const create = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/projects')
    .then(() => generateProject(request))
    .then(project => setAnalyticsConfig(
      request.requestContext.accountId,
      process.env[envNames.dataBucket],
      project.id,
    ).then(() => dynamodb.put({
      TableName: process.env[envNames.projectsTable],
      Item: project,
      ConditionExpression: 'attribute_not_exists(id)',
    }).promise())
      .then(() => respond(callback, request, project)))
    .catch(err => respondWithError(callback, request, err));
};

const generateProject = (request: Request) => ({
  id: uuid(),
  name: request.body.name,
  description: request.body.description,
  created_by: request.requestContext.authorizer.principalId,
  created_at: new Date().toISOString(),
  status: 'active',
});

const setAnalyticsConfig = (accountId: string, bucketName: string, projectId: string) => {
  return s3.putBucketAnalyticsConfiguration({
    Bucket: bucketName,
    Id: projectId,
    AnalyticsConfiguration: {
      Id: projectId,
      Filter: {
        Tag: {
          Key: 'ProjectId',
          Value: projectId,
        },
      },
      StorageClassAnalysis: {
        DataExport: {
          OutputSchemaVersion: 'V_1',
          Destination: {
            S3BucketDestination: {
              BucketAccountId: accountId,
              Bucket: process.env[envNames.logsBucket],
              Prefix: `${bucketName}/`,
              Format: 'CSV',
            }
          },
        }
      },
    },
  }).promise();
};

export const list = (request: Request, context: any, callback: Callback) => {
  query(request, '/projects', ['status'], callback);
};

export const update = (request: Request, context: any, callback: Callback) => {
  validate(request, 'PATCH', '/projects/{project_id}')
    .then(() => {
      const attributeNames: Dict<string> = {};
      const attributeValues: Dict<string> = {};
      const updateExpression: string[] = [];

      if (request.body.name) {
        updateExpression.push('#n = :n');
        attributeNames['#n'] = 'name';
        attributeValues[':n'] = request.body.name;
      }
      if (request.body.description != null) {
        updateExpression.push('#d = :d');
        attributeNames['#d'] = 'description';
        attributeValues[':d'] = request.body.description;
      }
      if (updateExpression.length < 1) {
        throw new ApiError('Invalid request', ["body must contain 'name' and/or 'description'"], 400);
      }

      return dynamodb.update({
        TableName: process.env[envNames.projectsTable],
        Key: {
          id: request.pathParameters.project_id,
        },
        UpdateExpression: 'set ' + updateExpression.join(', '),
        ExpressionAttributeNames: attributeNames,
        ExpressionAttributeValues: attributeValues,
      }).promise();
    })
    .then(data => respond(callback, request, data.Attributes))
    .catch(err => respondWithError(callback, request, err));
};
