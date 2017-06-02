import { v4 as uuid } from 'uuid';

import { Request, respond, respondWithError, validate } from './apig';
import { dynamodb } from './aws';
import { envNames } from './env';
import { Callback } from './types';

export const create = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/datasets')
    .then(() => dynamodb.put({
      TableName: process.env[envNames.datasetsTable],
      Item: {
        Id: uuid(),
        ProjectId: request.body.projectId,
        CreatorId: request.requestContext.authorizer.principalId,
        DateCreated: new Date().toISOString(),
        Description: request.body.description,
        Status: 'Created',
      },
      ConditionExpression: 'attribute_not_exists(Id)',
    }).promise())
    .then(data => data.Attributes)
    .then(item => respond(callback, request, {
      id: item.Id,
      projectId: item.ProjectId,
      creatorId: item.CreatorId,
      dateCreated: item.DateCreated,
      description: item.Description,
      status: item.Status,
    }))
    .catch(err => respondWithError(callback, request, err));
};
