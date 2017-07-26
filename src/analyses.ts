import * as stringify from 'json-stable-stringify';
import { v4 as uuid } from 'uuid';

import { ajv, ApiError, Request, respond, respondWithError, validate } from './apig';
import { batch, dynamodb, iam, stepFunctions } from './aws';
import { envNames } from './env';
import { mountPath } from './instances';
import { Pipeline, PipelineStep } from './pipelines';
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
    } as PipelineExecution),
  }).promise()
    .then(() => ({
      analysis_id,
      pipeline_id: pipeline.id,
      datasets: pipeline.datasets,
      status: 'submitted',
    }));
};

const rolePath = () => `/analyses/${process.env[envNames.stackName]}/`;

export const createRole = (analysis_id: string, context: any, callback: Callback) => {
  iam.createRole({
    Path: rolePath(),
    RoleName: analysis_id,
    AssumeRolePolicyDocument: stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: {
          Service: 'lambda.amazonaws.com',
        },
        Action: 'sts:AssumeRole',
      }],
    }),
  }).promise()
    .then(() => callback())
    .catch(callback);
};

interface RolePolicyRequest {
  analysis_id: string;
  datasets: Dict<string>;
}

export const setRolePolicy = (request: RolePolicyRequest, context: any, callback: Callback) => {
  validatePolicyRequest(request)
    .then(() => getDatasetIds(request.datasets))
    .then(dataset_ids => putRolePolicy(request.analysis_id, dataset_ids))
    .then(() => callback())
    .catch(callback);
};

const validatePolicyRequest = (request: RolePolicyRequest) => {
  return Promise.resolve()
    .then(() => ajv.compile({
      id: 'analysisPolicyRequest',
      type: 'object',
      required: [
        'analysis_id',
        'datasets',
      ],
      properties: {
        analysis_id: {
          type: 'string',
          format: 'uuid',
        },
        datasets: {
          type: 'object',
          propertyNames: {
            type: 'string',
            pattern: '^\\w{1,50}$',
          },
          additionalProperties: {
            type: 'string',
            format: 'uuid',
          },
          minProperties: 1,
          maxProperties: 10,
        },
      },
    }))
    .then(() => {
      if (!ajv.validate('analysisPolicyRequest', request)) {
        throw Error(stringify(ajv.errors));
      }
    });
}

const getDatasetIds = (datasets: Dict<string>) => {
  return Object.keys(datasets).map(key => datasets[key]);
};

const putRolePolicy = (analysis_id: string, dataset_ids: string[]) => {
  const bucket = process.env[envNames.dataBucket];
  return iam.putRolePolicy({
    RoleName: rolePath() + analysis_id,
    PolicyName: analysis_id,
    PolicyDocument: stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Action: [
          's3:ListBucket',
        ],
        Resource: [
          `arn:aws:s3:::${bucket}`,
        ],
        Condition: {
          StringLike: {
            's3:prefix': [
              `${analysis_id}-a/*`,
            ].concat(dataset_ids.map(dataset_id =>
              `${dataset_id}-d/*`
            )),
          },
        },
      }, {
        Effect: 'Allow',
        Action: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
        ],
        Resource: [
          `arn:aws:s3:::${bucket}/${analysis_id}-a/*`,
        ],
      }, {
        Effect: 'Allow',
        Action: [
          's3:GetObject',
        ],
        Resource: dataset_ids.map(dataset_id =>
          `arn:aws:s3:::${bucket}/${dataset_id}-d/*`
        ),
      }],
    }),
  }).promise();
};

export const deleteRole = (analysis_id: string, context: any, callback: Callback) => {
  iam.deleteRole({
    RoleName: rolePath() + analysis_id,
  }).promise()
    .then(() => callback())
    .catch(callback);
};

interface PipelineExecution {
  analysis_id: string;
  pipeline_id: string;
  datasets: Dict<string>;
  steps: PipelineStep[];
}

export const volumeName = 'data';
export const volumePath = '/data';
export const defaultMemory = 2048;

export const defineJobs = (request: PipelineExecution, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => parseJobDefinitions(request))
    .then(jobDefinitions => callback(null, jobDefinitions))
    .catch(callback);
};

const parseJobDefinitions = (request: PipelineExecution) => {
  if (!Array.isArray(request.steps) || request.steps.length < 1) {
    throw Error('request.steps must be a non-empty array');
  }
  return Promise.all(request.steps.map((step: PipelineStep, index: number) =>
    defineJob(index, step, request)));
};

const defineJob = (index: number, step: PipelineStep, request: PipelineExecution) => {

  const jobRoleArn = 'arn:aws:iam::' + process.env[envNames.accountId] + ':role/analyses/' +
    process.env[envNames.stackName] + '/' + request.analysis_id;

  const registry = process.env[envNames.accountId] + '.dkr.ecr.' +
    process.env['AWS_REGION'] + '.amazonaws.com';

  return batch.registerJobDefinition({
    type: 'container',
    jobDefinitionName: `${request.pipeline_id}-${index}`,
    containerProperties: {
      image: `${registry}/apps/${step.app}`,
      jobRoleArn,
      command: getCommand(request.analysis_id, request.datasets, step.args),
      vcpus: 1,
      memory: defaultMemory,
      volumes: [{
        name: volumeName,
        host: {
          sourcePath: `${mountPath}/${request.analysis_id}`,
        },
      }],
      mountPoints: [{
        sourceVolume: volumeName,
        containerPath: volumePath,
      }],
    },
  }).promise()
    .then(data => {
      if (data.jobDefinitionName == null || data.revision == null) {
        throw Error('Cannot determine job definition from ' + stringify(data));
      }
      return `${data.jobDefinitionName}:${data.revision}`;
    });
};

const getCommand = (analysis_id: string, datasets: Dict<string>, args: string) => {
  let command = args;
  const keys = Object.keys(datasets);
  if (keys.length < 1) {
    throw Error('Datasets must not be empty');
  }
  Object.keys(datasets).forEach(key => {
    const reKey = /^\w{1,50}$/;
    if (!reKey.test(key)) {
      throw Error(`Dataset '${key}' must satisfy pattern ${reKey}`);
    }
    const reValue = new RegExp('\\[\\/' + key + '(\\/[^\\]]*)?\\]', 'g');
    command = command.replace(reValue, `[/${datasets[key]}-d$1]`);
  });
  command = command.replace(/\[(\w[^\]]*)\]/g, `[/${analysis_id}-a/$1]`);
  return [command];
};

interface JobsSubmissionRequest {
  jobDefinitions: string[];
  jobQueue: string;
}

export const submitJobs = (request: JobsSubmissionRequest, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => batchSubmitJobs(request, []))
    .then(jobIds => callback(null, jobIds))
    .catch(callback);
};

const batchSubmitJobs = (request: JobsSubmissionRequest, jobIds: string[]): Promise<string[]> => {
  const index = jobIds.length;
  if (!Array.isArray(request.jobDefinitions) || request.jobDefinitions.length < 1) {
    throw Error('request.jobDefinitions must be a non-empty array');
  }
  if (index >= request.jobDefinitions.length) {
    return Promise.resolve(jobIds);
  }
  return batch.submitJob(Object.assign({
      jobDefinition: request.jobDefinitions[index],
      jobName: request.jobDefinitions[index],
      jobQueue: request.jobQueue,
    }, index > 0 ? {
      dependsOn: [{
        jobId: jobIds[index - 1],
      }],
    } : {}
  )).promise()
    .then(data => {
      if (data.jobId == null) {
        throw Error('Cannot determine job id from ' + stringify(data));
      }
      jobIds.push(data.jobId);
    })
    .then(() => batchSubmitJobs(request, jobIds));
};
