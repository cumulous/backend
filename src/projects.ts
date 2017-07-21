import { v4 as uuid } from 'uuid';

import { Request, respond, respondWithError, validate } from './apig';
import { dynamodb, s3 } from './aws';
import { envNames } from './env';
import { Callback } from './types';

export const create = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/projects')
    .then(() => generateProject(request))
    .then(project => setAnalyticsConfig(
      request.requestContext.accountId,
      process.env[envNames.datasetsBucket],
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
  irb_id: request.body.irb_id,
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
  }).promise();
};
