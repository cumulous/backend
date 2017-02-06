import { AWSError } from 'aws-sdk/lib/error';
import * as stringify from 'json-stable-stringify';

import { envNames } from './env';
import { cloudFormation, stepFunctions, StateMachineDefinition,
         createStateMachine, executeStateMachine } from './states';
import * as states from './states';
import { fakeResolve, fakeReject, testError } from './fixtures/support';
import { Callback } from './types';

const fakeAccount = '098765432109';
const fakeRegion = 'us-west-1';
const fakeStack = 'fake-stack';
const fakeStateMachinePath = './fixtures/fake-state-machine.json';

let fakeDefinition: StateMachineDefinition;

beforeEach(() => {
  delete require.cache[require.resolve(fakeStateMachinePath)];
  fakeDefinition = require(fakeStateMachinePath);

  process.env[envNames.AWSRegion] = fakeRegion;
  process.env[envNames.AWSAccount] = fakeAccount;
  process.env[envNames.stackName] = fakeStack;
});

describe('createStateMachine()', () => {
  const fakeStateMachineRole = 'fakeRole';
  const fakeResourceSuffix = '-fakeSuffix';

  let spyOnCreateStateMachine: jasmine.Spy;
  let spyOnDescribeStackResource: jasmine.Spy;

  beforeEach(() => {
    spyOnCreateStateMachine = spyOn(stepFunctions, 'createStateMachine')
      .and.returnValue(fakeResolve());

    spyOnDescribeStackResource = spyOn(cloudFormation, 'describeStackResource')
      .and.callFake((data: {LogicalResourceId: string}) => fakeResolve({
        StackResourceDetail: {
          PhysicalResourceId: data.LogicalResourceId + fakeResourceSuffix,
        },
      }));
  });

  it('calls StepFunctions.createStateMachine() once with correct parameters', (done: Callback) => {
    createStateMachine(fakeDefinition, null, () => {
      Object.keys(fakeDefinition.States).forEach(stateName => {
        const resource = fakeDefinition.States[stateName].Resource;
        if (resource && resource.startsWith('function:')) {
          fakeDefinition.States[stateName].Resource =
            'arn:aws:lambda:' + fakeRegion + ':' + fakeAccount + ':' + resource + fakeResourceSuffix;
        }
      });
      const fakeRoleArn = 'arn:aws:iam::' + fakeAccount + ':' +
        'role/service-role/StatesExecutionRole-' + fakeRegion;

      expect(spyOnCreateStateMachine).toHaveBeenCalledWith({
        name: fakeDefinition.Comment + '_' + fakeStack,
        definition: stringify(fakeDefinition),
        roleArn: fakeRoleArn,
      });
      expect(spyOnCreateStateMachine).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls callback with an error if', () => {
    afterEach((done: Callback) => {
      testError(createStateMachine, fakeDefinition, done);
    });
    it('CloudFormation.describeStackResource() returns an error', () => {
      spyOnDescribeStackResource.and.returnValue(
        fakeReject('CloudFormation.describeStackResource()'));
    });
    it('StepFunctions.createStateMachine() returns an error', () => {
      spyOnCreateStateMachine.and.returnValue(
        fakeReject('StepFunctions.createStateMachine()'));
    });
  });

  it('does not produce an error when called with correct parameters and AWS does not return errors',
      (done: Callback) => {
    testError(createStateMachine, fakeDefinition, done, false);
  });
});

describe('executeStateMachine()', () => {
  let fakeEvent: any;

  let spyOnStartExecution: jasmine.Spy;

  beforeEach(() => {
    fakeEvent = {
      logicalName: fakeDefinition.Comment,
      input: {
        fake: 'input',
      },
    };

    spyOnStartExecution = spyOn(stepFunctions, 'startExecution')
      .and.returnValue(fakeResolve());
  });

  it('calls StepFunctions.startExecution() once with correct parameters', (done: Callback) => {
    executeStateMachine(fakeEvent, null, () => {
      expect(spyOnStartExecution).toHaveBeenCalledWith({
        stateMachineArn: 'arn:aws:states:' + fakeRegion + ':' + fakeAccount +
                        ':stateMachine:' + fakeEvent.logicalName + '_' + fakeStack,
        input: stringify(fakeEvent.input),
      });
      expect(spyOnStartExecution).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback with an error if StepFunctions.startExecution() returns an error',
      (done: Callback) => {
    spyOnStartExecution.and.returnValue(
      fakeReject('StepFunctions.startExecution()'));
    testError(executeStateMachine, fakeEvent, done);
  });

  it('does not produce an error when called with correct parameters and AWS does not return errors',
      (done: Callback) => {
    testError(executeStateMachine, fakeEvent, done, false);
  });
});