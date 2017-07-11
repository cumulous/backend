import { CreateComputeEnvironmentRequest, CreateJobQueueRequest } from 'aws-sdk/clients/batch';
import * as stringify from 'json-stable-stringify';
import * as jsonpath from 'jsonpath';

import { batch, CloudFormationRequest } from './aws';
import { Callback } from './types';

export type ComputeEnvironmentProperties = CreateComputeEnvironmentRequest;
export type JobQueueProperties = CreateJobQueueRequest;

export const createComputeEnvironment = (
    request: ComputeEnvironmentProperties, context: any, callback: Callback) => {

  Promise.resolve()
    .then(() => request.computeResources)
    .then(computeResources => batch.createComputeEnvironment({
      computeEnvironmentName: request.computeEnvironmentName,
      type: request.type,
      computeResources: {
        type: computeResources.type,
        minvCpus: computeResources.minvCpus,
        maxvCpus: computeResources.maxvCpus,
        desiredvCpus: computeResources.desiredvCpus,
        instanceTypes: computeResources.instanceTypes,
        imageId: computeResources.imageId,
        subnets: computeResources.subnets,
        securityGroupIds: computeResources.securityGroupIds,
        ec2KeyPair: computeResources.ec2KeyPair,
        instanceRole: computeResources.instanceRole,
        tags: computeResources.tags,
        bidPercentage: computeResources.bidPercentage,
        spotIamFleetRole: computeResources.spotIamFleetRole,
      },
      serviceRole: request.serviceRole,
      state: 'ENABLED',
    }).promise())
    .then(data => callback(null, data.computeEnvironmentArn))
    .catch(callback);
};

export const checkUpdateEnvironment = (request: CloudFormationRequest, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => assertEqualProperties(request, [
      'computeEnvironmentName',
      'type',
      'computeResources.type',
      'computeResources.instanceTypes',
      'computeResources.imageId',
      'computeResources.subnets',
      'computeResources.securityGroupIds',
      'computeResources.ec2KeyPair',
      'computeResources.instanceRole',
      'computeResources.tags',
      'computeResources.bidPercentage',
      'computeResources.spotIamFleetRole',
    ]))
    .then(() => callback())
    .catch(callback);
};

const assertEqualProperties = (request: CloudFormationRequest, propertyPaths: string[]) => {
  propertyPaths.forEach(path => {
    const oldValue = stringify(jsonpath.value(request, `OldResourceProperties.${path}`));
    const newValue = stringify(jsonpath.value(request, `ResourceProperties.${path}`));
    if (oldValue !== newValue) {
      const err = Error(`Incompatible change for ${path}: ${oldValue} -> ${newValue}`);
      err.name = 'RequiresReplacement';
      throw err;
    }
  });
}

export const updateComputeEnvironment = (
    request: ComputeEnvironmentProperties, context: any, callback: Callback) => {

  Promise.resolve()
    .then(() => batch.updateComputeEnvironment({
      computeEnvironment: request.computeEnvironmentName,
      state: request.state,
      computeResources: {
        minvCpus: request.computeResources.minvCpus,
        maxvCpus: request.computeResources.maxvCpus,
        desiredvCpus: request.computeResources.desiredvCpus,
      },
      serviceRole: request.serviceRole,
    }).promise())
    .then(data => callback(null, data.computeEnvironmentArn))
    .catch(callback);
};

export const deleteComputeEnvironment = (name: string, context: any, callback: Callback) => {
  batch.deleteComputeEnvironment({
    computeEnvironment: name,
  }).promise()
    .then(() => callback())
    .catch(callback);
};

const deletedResource = { status: 'DELETED' };

export const describeComputeEnvironment = (name: string, context: any, callback: Callback) => {
  batch.describeComputeEnvironments({
    computeEnvironments: [ name ],
  }).promise()
    .then(data => callback(null, data.computeEnvironments[0] || deletedResource))
    .catch(callback);
};

export const createJobQueue = (request: JobQueueProperties, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => batch.createJobQueue({
      jobQueueName: request.jobQueueName,
      priority: request.priority,
      computeEnvironmentOrder: request.computeEnvironmentOrder,
      state: 'ENABLED',
    }).promise())
    .then(() => callback())
    .catch(callback);
};

export const describeJobQueue = (name: string, context: any, callback: Callback) => {
  batch.describeJobQueues({
    jobQueues: [ name ],
  }).promise()
    .then(data => callback(null, data.jobQueues[0] || deletedResource))
    .catch(callback);
};

export const describeJobQueueMinusEnvironment = (computeEnvironment: string, context: any, callback: Callback) => {
  describeJobQueueWithEnvironment(computeEnvironment)
    .then(queue => callback(null, queue || deletedResource))
    .catch(callback);
};

export const describeJobQueueWithEnvironment = (computeEnvironment: string, nextToken?: string): Promise<any> => {
  return batch.describeJobQueues(nextToken == null ? {} : {
    nextToken,
  }).promise()
    .then(data => {
      const matchedQueue = data.jobQueues.find(queue => {
        const matchedIndex = queue.computeEnvironmentOrder.findIndex(entry =>
          entry.computeEnvironment === computeEnvironment);
        const foundMatch = matchedIndex >= 0;
        if (foundMatch) {
          queue.computeEnvironmentOrder.splice(matchedIndex, 1);
        }
        return foundMatch;
      });
      if (matchedQueue != null) {
        return matchedQueue;
      }
      if (data.nextToken != null) {
        return describeJobQueueWithEnvironment(computeEnvironment, data.nextToken);
      }
    });
};

export const checkUpdateJobQueue = (request: CloudFormationRequest, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => assertEqualProperties(request, [ 'jobQueueName' ]))
    .then(() => callback())
    .catch(callback);
};

export const updateJobQueue = (request: JobQueueProperties, context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => batch.updateJobQueue({
      jobQueue: request.jobQueueName,
      priority: request.priority,
      state: request.state,
      computeEnvironmentOrder: request.computeEnvironmentOrder,
    }).promise())
    .then(() => callback())
    .catch(callback);
};

export const deleteJobQueue = (name: string, context: any, callback: Callback) => {
  batch.deleteJobQueue({
    jobQueue: name,
  }).promise()
    .then(() => callback())
    .catch(callback);
};
