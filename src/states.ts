import { CloudFormation, StepFunctions } from 'aws-sdk';
import { AWSError } from 'aws-sdk/lib/error';
import * as stringify from 'json-stable-stringify';

import { envNames } from './env';
import { Callback } from './types';

export const cloudFormation = new CloudFormation();
export const stepFunctions = new StepFunctions();

export class StateMachineDefinition {
  Comment: string;
  States: {
    [StateName: string]: {
      Resource?: string;
    }
  }
}

export function createStateMachine(definition: StateMachineDefinition,
                                      context: any, callback: Callback) {
  transformDefinition(definition)
    .then(createStateMachineRequest)
    .then(() => callback())
    .catch(callback);
}

export function executeStateMachine(event: {logicalName: string, input: any},
                                  context: any, callback: Callback) {
  stepFunctions.startExecution({
    stateMachineArn: getStateMachineArn(event.logicalName),
    input: stringify(event.input),
  }).promise()
    .then(() => callback())
    .catch(callback);
}

function getStateMachineArn(logicalName: string) {
  return 'arn:aws:states:' + process.env[envNames.AWSRegion] + ':' +
          process.env[envNames.AWSAccount] + ':stateMachine:' +
          getStateMachineName(logicalName);
}

function getStateMachineName(logicalName: string) {
  return logicalName + '_' + process.env[envNames.stackName];
}

function transformDefinition(definition: StateMachineDefinition) {
  return Promise.all(
    Object.keys(definition.States).map(state =>
      transformState(definition.States[state])))
    .then(() => definition);

}

function transformState(state: {Resource?: string}) {
  return transformResource(state.Resource)
    .then(resource => {
      state.Resource = resource;
    });
}

function transformResource(resource: string) {
  return (resource && resource.startsWith('function:')) ?
      transformFunctionResource(resource.split(':')[1])
    : Promise.resolve(resource);
}

function transformFunctionResource(functionName: string) {
  return getPhysicalResourceId(functionName)
      .then(getFunctionArn);
}

function getPhysicalResourceId(logicalResourceId: string) {
  return cloudFormation.describeStackResource({
      StackName: process.env[envNames.stackName],
      LogicalResourceId: logicalResourceId,
    }).promise()
      .then(data => data.StackResourceDetail.PhysicalResourceId);
}

function getFunctionArn(functionId: string) {
  return 'arn:aws:lambda:' + process.env[envNames.AWSRegion] + ':' +
          process.env[envNames.AWSAccount] + ':function:' + functionId;
}

function createStateMachineRequest(definition: StateMachineDefinition) {
  return stepFunctions.createStateMachine({
      name: getStateMachineName(definition.Comment),
      definition: stringify(definition),
      roleArn: getStatesExecutionRole(),
    }).promise();
}

function getStatesExecutionRole() {
  return 'arn:aws:iam::' + process.env[envNames.AWSAccount] + ':' +
         'role/service-role/StatesExecutionRole-' + process.env[envNames.AWSRegion];
}