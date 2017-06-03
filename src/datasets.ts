import { v4 as uuid } from 'uuid';

import { Request, respond, respondWithError, validate } from './apig';
import { dynamodb } from './aws';
import { envNames } from './env';
import { Callback } from './types';

export const create = (request: Request, context: any, callback: Callback) => {
  const date = new Date().toISOString();
  const id = uuid();
  const item = () => ({
    id: id,
    projectId: request.body.projectId,
    creatorId: request.requestContext.authorizer.principalId,
    dateCreated: date,
    description: request.body.description,
    status: 'Created',
  });

  validate(request, 'POST', '/datasets')
    .then(() => dynamodb.put({
      TableName: process.env[envNames.datasetsTable],
      Item: item(),
      ConditionExpression: 'attribute_not_exists(Id)',
    }).promise())
    .then(() => respond(callback, request, item()))
    .catch(err => respondWithError(callback, request, err));
};
