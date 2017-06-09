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
