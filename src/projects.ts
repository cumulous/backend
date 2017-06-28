import { v4 as uuid } from 'uuid';

import { Request, respond, respondWithError, validate } from './apig';
import { dynamodb, s3 } from './aws';
import { envNames } from './env';
import { Callback } from './types';

export const create = (request: Request, context: any, callback: Callback) => {
  const date = new Date().toISOString();
  const id = uuid();
  const item = () => ({
    id: id,
    name: request.body.name,
    description: request.body.description,
    created_at: date,
    creator_id: request.requestContext.authorizer.principalId,
    irb_id: request.body.irb_id,
    status: 'active',
  });

  validate(request, 'POST', '/projects')
    .then(() => s3.putBucketAnalyticsConfiguration(
      getAnalyticsConfig(process.env[envNames.datasetsBucket], id, request.requestContext.accountId)
    ).promise())
    .then(() => dynamodb.put({
      TableName: process.env[envNames.projectsTable],
      Item: item(),
      ConditionExpression: 'attribute_not_exists(id)',
    }).promise())
    .then(() => respond(callback, request, item()))
    .catch(err => respondWithError(callback, request, err));
};

const getAnalyticsConfig = (bucketName: string, projectId: string, accountId: string) => ({
  Bucket: bucketName,
  Id: projectId,
  AnalyticsConfiguration: {
    Id: projectId,
    Filter: {
      Tag: {
        Key: 'project_id',
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
});
