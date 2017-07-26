import { v4 as uuid } from 'uuid';

import { Request, respond, respondWithError, validate } from './apig';
import { dynamodb } from './aws';
import { envNames } from './env';
import { Callback, Dict } from './types';
import { uuidNil } from './util';

interface PipelineCreationRequest {
  name: string;
  datasets: Dict<string>;
  steps: PipelineStep[];
}

export interface PipelineStep {
  app: string;
  args: string;
}

export type Pipeline = PipelineCreationRequest & {
  id: string;
}

export const create = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/pipelines')
    .then(() => generatePipeline(request.body, request.requestContext.authorizer.principalId))
    .then(pipeline => dynamodb.put({
      TableName: process.env[envNames.pipelinesTable],
      Item: pipeline,
      ConditionExpression: 'attribute_not_exists(id)',
    }).promise()
      .then(() => respond(callback, request, pipeline)))
    .catch(err => respondWithError(callback, request, err));
};

const generatePipeline = (request: PipelineCreationRequest, principalId: string) => ({
  id: uuid(),
  name: request.name,
  datasets: parseDatasets(request),
  steps: request.steps,
  created_at: new Date().toISOString(),
  created_by: principalId,
  status: 'active',
});

const datasetMatcher = /\[\/(\w+)\/?/g;

const parseDatasets = (request: PipelineCreationRequest) => {
  const labels = new Set<string>();
  request.steps.map(step => step.args).forEach(args => {
    let match: any[];
    while ( (match = datasetMatcher.exec(args)) !== null ) {
      labels.add(match[1]);
    }
  });
  const datasets: Dict<string> = {};
  for (let label of labels) {
    datasets[label] = request.datasets[label] || uuidNil;
  }
  return datasets;
};
