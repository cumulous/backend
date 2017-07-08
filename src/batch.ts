import { CreateComputeEnvironmentRequest as ComputeEnvironmentProperties,
         UpdateComputeEnvironmentRequest, DeleteComputeEnvironmentRequest } from 'aws-sdk/clients/batch';
import * as stringify from 'json-stable-stringify';
import * as jsonpath from 'jsonpath';

import { ApiError } from './apig';
import { batch, CloudFormationRequest } from './aws';
import { Callback } from './types';

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
      state: request.state,
      serviceRole: request.serviceRole,
    }).promise())
    .then(() => callback())
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
      throw new ApiError(`Incompatible change for ${path}: ${oldValue} -> ${newValue}`,
        undefined, 409, 'RequiresReplacement');
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
    .then(() => callback())
    .catch(callback);
};

export const deleteComputeEnvironment = (name: string, context: any, callback: Callback) => {
  batch.deleteComputeEnvironment({
    computeEnvironment: name,
  }).promise()
    .then(() => callback())
    .catch(callback);
};

export const describeComputeEnvironment = (name: string, context: any, callback: Callback) => {
  batch.describeComputeEnvironments({
    computeEnvironments: [ name ],
  }).promise()
    .then(data => callback(null, data.computeEnvironments[0]))
    .catch(callback);
};
