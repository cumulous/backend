import * as stringify from 'json-stable-stringify';
import { v4 as uuid } from 'uuid';

import { ApiError, Request, respond, respondWithError, validate } from './apig';
import { dynamodb, stepFunctions } from './aws';
import { envNames } from './env';
import { Pipeline } from './pipelines';
import { Callback, Dict } from './types';
import { uuidNil } from './util';

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
    .then(() => request.pathParameters.analysis_id)
    .then(analysis_id => getPipeline(request.body)
      .then(pipeline => setExecutionStatus(analysis_id, pipeline.id)
        .then(() => startExecution(analysis_id, pipeline))))
    .then(execution => respond(callback, request, execution))
    .catch(err => respondWithError(callback, request, err));
};

interface PipelineRequest {
  pipeline_id: string;
  datasets: Dict<string>;
}

const getPipeline = (request: PipelineRequest) => {
  return dynamodb.get({
    TableName: process.env[envNames.pipelinesTable],
    Key: {
      id: request.pipeline_id,
    },
  }).promise()
    .then(data => {
      if (data.Item === undefined) {
        throw new ApiError('Invalid request', ['Pipeline not found'], 400);
      }
      return data.Item;
    })
    .then(pipeline => {
      Object.keys(pipeline.datasets).forEach(key => {
        if (request.datasets.hasOwnProperty(key)) {
          pipeline.datasets[key] = request.datasets[key];
        }
        if (pipeline.datasets[key] === uuidNil) {
          throw new ApiError('Invalid request', [`Dataset '${key}' must be defined`], 400);
        }
      });
      return pipeline as Pipeline;
    });
}

const setExecutionStatus = (analysis_id: string, pipeline_id: string) => {
  return dynamodb.update({
    TableName: process.env[envNames.analysesTable],
    Key: {
      id: analysis_id,
    },
    UpdateExpression: 'set #s = :sub, #p = :p',
    ConditionExpression: '(#s = :c) or (#s = :f) or (#s = :suc)',
    ExpressionAttributeNames: {
      '#s': 'status',
      '#p': 'pipeline_id',
    },
    ExpressionAttributeValues: {
      ':c': 'created',
      ':sub': 'submitted',
      ':f': 'failed',
      ':suc': 'succeeded',
      ':p': pipeline_id,
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

const startExecution = (analysis_id: string, pipeline: Pipeline) => {
  return stepFunctions.startExecution({
    stateMachineArn: process.env[envNames.stateMachine],
    input: stringify({
      analysis_id,
      pipeline_id: pipeline.id,
      datasets: pipeline.datasets,
      steps: pipeline.steps,
    }),
  }).promise()
    .then(() => ({
      analysis_id,
      pipeline_id: pipeline.id,
      datasets: pipeline.datasets,
      status: 'submitted',
    }));
};
