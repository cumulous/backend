import * as stringify from 'json-stable-stringify';
import { v4 as uuid } from 'uuid';

import { ApiError, Request, respond, respondWithError, validate } from './apig';
import { dynamodb, stepFunctions } from './aws';
import { envNames } from './env';
import { Callback, Dict } from './types';

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

export const submitExecution = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/analyses/{analysis_id}/execution')
    .then(() => setExecutionSubmittedStatus(request.pathParameters.analysis_id))
    .then(() => startExecution(request.pathParameters.analysis_id, request.body))
    .then(execution => respond(callback, request, execution))
    .catch(err => respondWithError(callback, request, err));
};

const setExecutionSubmittedStatus = (id: string) => {
  return dynamodb.update({
    TableName: process.env[envNames.analysesTable],
    Key: {
      id,
    },
    UpdateExpression: 'set #s = :sub',
    ConditionExpression: '(#s = :c) or (#s = :f) or (#s = :suc)',
    ExpressionAttributeNames: {
      '#s': 'status',
    },
    ExpressionAttributeValues: {
      ':c': 'created',
      ':sub': 'submitted',
      ':f': 'failed',
      ':suc': 'succeeded',
    },
  }).promise()
    .catch(err => {
      if (err.code === 'ConditionalCheckFailedException') {
        err = new ApiError('Conflict', ["Analysis must be in 'created', 'failed', or 'succeeded' " +
          "state before it can be (re-)run"], 409);
      }
      throw err;
    });
};

interface ExecutionParameters {
  pipeline_id: string;
  datasets: Dict<string>;
}

const startExecution = (analysis_id: string, params: ExecutionParameters) => {
  return Promise.resolve()
    .then(() => ({
      analysis_id,
      pipeline_id: params.pipeline_id,
      datasets: params.datasets,
    }))
    .then(execution => stepFunctions.startExecution({
      stateMachineArn: process.env[envNames.stateMachine],
      input: stringify(execution),
    }).promise()
      .then(() => execution));
};
