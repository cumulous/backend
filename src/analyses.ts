import * as stringify from 'json-stable-stringify';
import { v4 as uuid } from 'uuid';

import { ajv, ApiError, Request, respond, respondWithError, validate } from './apig';
import { batch, cloudWatchEvents, dynamodb, iam, stepFunctions } from './aws';
import { envNames } from './env';
import { mountPath } from './instances';
import { Pipeline, PipelineStep } from './pipelines';
import { query } from './search';
import { Callback, Dict } from './types';
import { uuidNil } from './util';

interface AnalysisCreationRequest {
  project_id: string;
  description?: string;
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
  project_id: request.project_id,
  description: request.description,
  created_at: new Date().toISOString(),
  created_by: principalId,
  status: 'created',
});

export const list = (request: Request, context: any, callback: Callback) => {
  query(request, '/analyses', ['project_id', 'status'], callback);
};

export const submitExecution = (request: Request, context: any, callback: Callback) => {
  validate(request, 'POST', '/analyses/{analysis_id}/execution')
    .then(() => request.pathParameters.analysis_id)
    .then(analysis_id => getPipeline(request.body)
      .then(pipeline => storeExecution(analysis_id, pipeline.id, pipeline.datasets)
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

const storeExecution = (analysis_id: string, pipeline_id: string, datasets: Dict<string>) => {
  return dynamodb.update({
    TableName: process.env[envNames.analysesTable],
    Key: {
      id: analysis_id,
    },
    UpdateExpression: 'set #s = :sub, #p = :p, #d = :d, #e = :e, #j = :j',
    ConditionExpression: '(#s = :c) or (#s = :f) or (#s = :suc)',
    ExpressionAttributeNames: {
      '#s': 'status',
      '#p': 'pipeline_id',
      '#d': 'datasets',
      '#e': 'error',
      '#j': 'jobs',
    },
    ExpressionAttributeValues: {
      ':c': 'created',
      ':sub': 'submitted',
      ':f': 'failed',
      ':suc': 'succeeded',
      ':p': pipeline_id,
      ':d': datasets,
      ':e': '-',
      ':j': [],
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

const roleName = (analysis_id: string) =>
  `${process.env[envNames.stackName]}-analysis-${analysis_id}`;

export const createRole = (analysis_id: string, context: any, callback: Callback) => {
  iam.createRole({
    RoleName: roleName(analysis_id),
    AssumeRolePolicyDocument: stringify(roleTrustPolicy()),
  }).promise()
    .then(() => callback())
    .catch(callback);
};

const roleTrustPolicy = () => ({
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Principal: {
      Service: 'ecs-tasks.amazonaws.com',
    },
    Action: 'sts:AssumeRole',
  }],
});

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
    .then(() => ajv.compile(analysisPolicyRequestSchema()))
    .then(() => {
      if (!ajv.validate('analysisPolicyRequest', request)) {
        throw Error(stringify(ajv.errors));
      }
    });
}

const analysisPolicyRequestSchema = () => ({
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
});

const getDatasetIds = (datasets: Dict<string>) => {
  return Object.keys(datasets).map(key => datasets[key]);
};

const putRolePolicy = (analysis_id: string, dataset_ids: string[]) => {
  return iam.putRolePolicy({
    RoleName: roleName(analysis_id),
    PolicyName: analysis_id,
    PolicyDocument: stringify(rolePolicy(analysis_id, dataset_ids)),
  }).promise();
};

const rolePolicy = (analysis_id: string, dataset_ids: string[]) => {
  const bucket = process.env[envNames.dataBucket];
  return {
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
  };
};

export const deleteRolePolicy = (analysis_id: string, context: any, callback: Callback) => {
  iam.deleteRolePolicy({
    RoleName: roleName(analysis_id),
    PolicyName: analysis_id,
  }).promise()
    .then(() => callback())
    .catch(callback);
};

export const deleteRole = (analysis_id: string, context: any, callback: Callback) => {
  iam.deleteRole({
    RoleName: roleName(analysis_id),
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
  return batch.registerJobDefinition({
    type: 'container',
    jobDefinitionName: `${request.pipeline_id}-${index}`,
    containerProperties: containerProperties(request, step, index),
  }).promise()
    .then(data => {
      if (data.jobDefinitionName == null || data.revision == null) {
        throw Error('Cannot determine job definition from ' + stringify(data));
      }
      return `${data.jobDefinitionName}:${data.revision}`;
    });
};

export const volumeName = 'data';
export const volumePath = '/data';

const containerProperties = (request: PipelineExecution, step: PipelineStep, index: number) => {
  const image = process.env[envNames.accountId] + '.dkr.ecr.' +
                process.env['AWS_REGION'] + '.amazonaws.com/' +
                process.env[envNames.stackName] + '/apps/' + step.app;
  const jobRoleArn = 'arn:aws:iam::' + process.env[envNames.accountId] +
                     ':role/' + roleName(request.analysis_id);
  return {
    image,
    jobRoleArn,
    command: getCommand(request.analysis_id, request.datasets, step.args),
    vcpus: step.cores,
    memory: Math.round(step.memory * 1000),
    environment: [{
      name: 'DATA_BUCKET',
      value: process.env[envNames.dataBucket],
    }, {
      name: 'DATA_PATH',
      value: volumePath,
    }, {
      name: 'LOG_DEST',
      value: `${request.analysis_id}-a/logs/${request.pipeline_id}-${index}.log`,
    }],
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
  };
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
    const reValue = new RegExp('\\[([di]):\\/' + key + '\\/([^\\]]*)\\]', 'g');
    command = command.replace(reValue, `[$1:/${datasets[key]}-d/$2]`);
  });
  command = command.replace(/\[([dio]):(\w[^\]]*)\]/g, `[$1:/${analysis_id}-a/$2]`);
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
      jobName: request.jobDefinitions[index].replace(':', '-'),
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

interface JobWatcherRequest {
  analysis_id: string;
  jobIds: string[];
}

export const describeJobs = (request: { jobIds: string[] }, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => batch.describeJobs({
      jobs: request.jobIds,
    }).promise())
    .then(data => {
      const jobs: Dict<JobStatus> = {};
      data.jobs.map(job => jobs[job.jobId] = Object.assign({
        status: job.status,
      }, job.status === 'FAILED' ? {
        reason: job.statusReason,
      } : {}));
      return request.jobIds.map(jobId => jobs[jobId]);
    })
    .then(jobs => callback(null, jobs))
    .catch(callback);
};

interface JobStatus {
  status: string;
  reason?: string;
}

export const checkJobsUpdated = (
      request: { jobs: JobStatus[], oldJobs: JobStatus[] },
      context: any, callback: Callback
    ) => {
  Promise.resolve()
    .then(() => {
      if (!Array.isArray(request.jobs) || !Array.isArray(request.oldJobs) ||
          request.jobs.length < 1 || request.jobs.length !== request.oldJobs.length) {
        throw Error('jobs and oldJobs must be non-empty arrays of equal length');
      }
    })
    .then(() => request.jobs.some((job: JobStatus, index: number) =>
      job.status !== request.oldJobs[index].status))
    .then(result => callback(null, result))
    .catch(callback);
};

export const calculateStatus = (request: { jobs: JobStatus[] }, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => {
      if (!Array.isArray(request.jobs) || request.jobs.length < 1) {
        throw Error('request.jobs must be a non-empty array');
      }
      let error = '';
      const count: Dict<number> = {
        SUBMITTED: 0,
        PENDING: 0,
        RUNNABLE: 0,
        STARTING: 0,
        RUNNING: 0,
        SUCCEEDED: 0,
        FAILED: 0,
      };
      request.jobs.forEach(job => {
        if (count[job.status] === undefined) {
          throw Error('Unexpected job status: ' + stringify(job.status));
        }
        count[job.status]++;

        if (job.status !== 'FAILED' || job.reason === undefined) {
          return;
        }
        if (typeof job.reason !== 'string') {
          throw Error('Unexpected reason: ' + stringify(job.reason));
        }
        error = error || job.reason;
      });

      const total = request.jobs.length;
      let status: string;
      if (count.SUCCEEDED === total) {
        status = 'succeeded';
      } else if (count.FAILED + count.SUCCEEDED == total) {
        status = 'failed';
      } else if (count.FAILED) {
        status = 'failing';
      } else if (count.RUNNING) {
        status = 'running';
      } else if (count.SUCCEEDED && count.SUCCEEDED < total) {
        status = 'running';
      } else {
        status = 'pending';
      }
      return {
        status,
        error,
      } as AnalysisStatus;
    })
    .then(status => callback(null, status))
    .catch(callback);
};

interface AnalysisStatus {
  status: string;
  error?: string;
}

export const updateStatus = (
      request: { analysis_id: string, analysis: AnalysisStatus, jobs: JobStatus[], jobIds: string[] },
      context: any, callback: Callback
    ) => {
  Promise.resolve()
    .then(() => request.analysis)
    .then(analysis => dynamodb.update({
      TableName: process.env[envNames.analysesTable],
      Key: {
        id: request.analysis_id,
      },
      UpdateExpression: 'set #s = :s, #e = :e, #j = :j, #ji = :ji',
      ExpressionAttributeNames: {
        '#s': 'status',
        '#e': 'error',
        '#j': 'jobs',
        '#ji': 'job_ids',
      },
      ExpressionAttributeValues: {
        ':s': analysis.status,
        ':e': analysis.error || '-',
        ':j': request.jobs ? request.jobs.map(job => job.status.toLowerCase()) : [],
        ':ji': request.jobIds || [],
      },
    }).promise())
    .then(() => callback(null, request.analysis.error))
    .catch(err => {
      err.name = err.code;
      callback(err);
    });
};

export const cancelExecution = (request: Request, context: any, callback: Callback) => {
  validate(request, 'DELETE', '/analyses/{analysis_id}/execution')
    .then(() => setCancellationStatus(request.pathParameters.analysis_id))
    .then(analysis => cancelJobs(analysis.job_ids)
      .then(() => respond(callback, request, {
        analysis_id: analysis.id,
        pipeline_id: analysis.pipeline_id,
        datasets: analysis.datasets,
        status: analysis.status,
        error: analysis.error,
      }))
    )
    .catch(err => respondWithError(callback, request, err));
};

export const cancellationReason = 'Canceled by user';

const setCancellationStatus = (id: string) => {
  return dynamodb.update({
    TableName: process.env[envNames.analysesTable],
    Key: {
      id,
    },
    UpdateExpression: 'set #s = :c, #e = :e',
    ConditionExpression: '(#s = :p) or (#s = :r) or (#s = :c)',
    ExpressionAttributeNames: {
      '#s': 'status',
      '#e': 'error',
    },
    ExpressionAttributeValues: {
      ':p': 'pending',
      ':r': 'running',
      ':c': 'canceling',
      ':e': cancellationReason,
    },
    ReturnValues: 'ALL_NEW',
  }).promise()
    .then(data => data.Attributes)
    .catch(err => {
      if (err.code === 'ConditionalCheckFailedException') {
        err = new ApiError('Conflict', [
          "Analysis must have 'pending', 'running' or 'canceling' status before it can be canceled",
        ], 409);
      }
      throw err;
    });
}

const cancelJobs = (jobIds: string[]) => {
  if (!Array.isArray(jobIds)) {
    throw new ApiError('Conflict', ['Unable to find jobs to be terminated'], 409);
  }
  return Promise.all(jobIds.map(jobId => batch.terminateJob({
    jobId,
    reason: cancellationReason,
  }).promise()));
};
