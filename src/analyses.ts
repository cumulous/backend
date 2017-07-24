import { v4 as uuid } from 'uuid';

import { Request, respond, respondWithError, validate } from './apig';
import { dynamodb } from './aws';
import { envNames } from './env';
import { Callback } from './types';

interface AnalysisCreationRequest {
  description: string;
}

export const create = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/analyses')
    .then(() => generateAnalysis(request.body, request.requestContext.authorizer.principalId))
    .then(analysis => dynamodb.put({
      TableName: process.env[envNames.analysesTable],
      Item: analysis,
      ConditionExpression: 'attribute_not_exists(id)',
    }).promise()
      .then(() => respond(callback, request, analysis)))
    .catch(err => respondWithError(callback, request, err));
};

const generateAnalysis = (request: AnalysisCreationRequest, principalId: string) => ({
  id: uuid(),
  description: request.description,
  created_at: new Date().toISOString(),
  created_by: principalId,
  status: 'created',
});
