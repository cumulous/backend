import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import { create, createRole, deleteRole, deleteRolePolicy, setRolePolicy,
         defaultMemory, volumeName, volumePath,
         defineJobs, submitJobs, submitExecution } from './analyses';
import * as apig from './apig';
import { ajv, ApiError } from './apig';
import { batch, dynamodb, iam, stepFunctions } from './aws';
import { envNames } from './env';
import { fakeReject, fakeResolve } from './fixtures/support';
import { mountPath }  from './instances';
import { Callback, Dict } from './types';
import { uuidNil } from './util';

const fakeAnalysisId = uuid();
const fakeAnalysesTable = 'fake-analyses-table';

describe('analyses.create()', () => {
  const fakeAnalysisDescription = 'Fake analysis';
  const fakeProjectId = uuid();
  const fakePrincipalId = uuid();
  const fakeDate = new Date().toISOString();

  const fakeAnalysisRequest = () => ({
    project_id: fakeProjectId,
    description: fakeAnalysisDescription,
  });

  const fakeContext = () => ({
    authorizer: {
      principalId: fakePrincipalId,
    },
  });

  const fakeRequest = (validated = true) => ({
    body: validated ? fakeAnalysisRequest() : stringify(fakeAnalysisRequest()),
    requestContext: fakeContext(),
  });

  const fakeAnalysisItem = () => ({
    id: fakeAnalysisId,
    project_id: fakeProjectId,
    description: fakeAnalysisDescription,
    created_by: fakePrincipalId,
    created_at: fakeDate,
    status: 'created',
  });

  const testMethod = (callback: Callback) =>
    create(fakeRequest(false), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnDynamoDbPut: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.analysesTable] = fakeAnalysesTable;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOn(uuid, 'v4').and.returnValue(fakeAnalysisId);
    spyOn(Date.prototype, 'toISOString').and.returnValue(fakeDate);
    spyOnDynamoDbPut = spyOn(dynamodb, 'put')
      .and.returnValue(fakeResolve());
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'POST', '/analyses');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls dynamodb.put() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDynamoDbPut).toHaveBeenCalledWith({
        TableName: fakeAnalysesTable,
        Item: fakeAnalysisItem(),
        ConditionExpression: 'attribute_not_exists(id)',
      });
      expect(spyOnDynamoDbPut).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), fakeAnalysisItem());
      expect(ajv.validate('spec#/definitions/Analysis', fakeAnalysisItem())).toBe(true);
      expect(spyOnRespond).toHaveBeenCalledTimes(1);
      done();
    };
    testMethod(callback);
  });

  describe('calls apig.respondWithError() immediately with the error if', () => {
    let err: Error | ApiError;

    const testError = (after: Callback, done: Callback, validated = true) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(
          callback, fakeRequest(validated), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(callback);
    };

    it('apig.validate() responds with an error', (done: Callback) => {
      err = new ApiError('validate()');
      spyOnValidate.and.returnValue(Promise.reject(err));
      testError(() => {
        expect(spyOnDynamoDbPut).not.toHaveBeenCalled();
      }, done, false);
    });

    it('dynamodb.put() responds with an error', (done: Callback) => {
      err = Error('dynamodb.put()');
      spyOnDynamoDbPut.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('apig.respond() throws an error', (done: Callback) => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
      testError(() => {}, done);
    });
  });
});

describe('analyses.submitExecution()', () => {
  const fakePipelineId = uuid();
  const fakeDatasetId1 = uuid();
  const fakeDatasetId2 = uuid();
  const fakeDatasetId2New = uuid();
  const fakeDatasetId3 = uuid();
  const fakeDatasetExtraId = uuid();
  const fakePipelinesTable = 'fake-pipelines-table';
  const fakePipelineName = 'fake-pipeline';
  const fakeExecutionStateMachine = 'arn:aws:states:::execution:FakeAnalysisStateMachine';

  const fakeDatasetsRequest = (): Dict<string> => ({
    Dataset_1: fakeDatasetId1,
    Dataset_2: fakeDatasetId2New,
    Dataset_Extra: fakeDatasetExtraId,
  });

  const fakeExecutionRequest = () => ({
    pipeline_id: fakePipelineId,
    datasets: fakeDatasetsRequest(),
  });

  const fakeRequest = (validated = true) => ({
    body: validated ? fakeExecutionRequest() : stringify(fakeExecutionRequest()),
    pathParameters: {
      analysis_id: fakeAnalysisId,
    },
  });

  const fakeSteps = () => [{
    app: 'app:1',
    args: '-i [file1_i.txt]:i -d [file1_d.txt]:d -o [file1_o.txt]:o',
  }, {
    app: 'app:2',
    args: '-i [file2_i.txt]:i -d [file2_d.txt]:d -o [file2_o.txt]:o',
  }];

  const fakePipeline = () => ({
    id: fakePipelineId,
    name: fakePipelineName,
    datasets: {
      Dataset_1: uuidNil,
      Dataset_2: fakeDatasetId2,
      Dataset_3: fakeDatasetId3,
    } as Dict<string>,
    steps: fakeSteps(),
  });

  const fakeDatasetsResponse = () => ({
    Dataset_1: fakeDatasetId1,
    Dataset_2: fakeDatasetId2New,
    Dataset_3: fakeDatasetId3,
  });

  const fakeExecution = () => ({
    analysis_id: fakeAnalysisId,
    pipeline_id: fakePipelineId,
    datasets: fakeDatasetsResponse(),
    steps: fakeSteps(),
  });

  const fakeResponse = () => ({
    analysis_id: fakeAnalysisId,
    pipeline_id: fakePipelineId,
    datasets: fakeDatasetsResponse(),
    status: 'submitted',
  });

  const testMethod = (callback: Callback) =>
    submitExecution(fakeRequest(false), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnDynamoDbGet: jasmine.Spy;
  let spyOnDynamoDbUpdate: jasmine.Spy;
  let spyOnStartExecution: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.analysesTable] = fakeAnalysesTable;
    process.env[envNames.pipelinesTable] = fakePipelinesTable;
    process.env[envNames.stateMachine] = fakeExecutionStateMachine;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOnDynamoDbGet = spyOn(dynamodb, 'get')
      .and.returnValue(fakeResolve({ Item: fakePipeline() }));
    spyOnDynamoDbUpdate = spyOn(dynamodb, 'update')
      .and.returnValue(fakeResolve());
    spyOnStartExecution = spyOn(stepFunctions, 'startExecution')
      .and.returnValue(fakeResolve());
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'POST', '/analyses/{analysis_id}/execution');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls dynamodb.get() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDynamoDbGet).toHaveBeenCalledWith({
        TableName: fakePipelinesTable,
        Key: {
          id: fakePipelineId,
        },
      });
      expect(spyOnDynamoDbGet).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls dynamodb.update() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDynamoDbUpdate).toHaveBeenCalledWith({
        TableName: fakeAnalysesTable,
        Key: {
          id: fakeAnalysisId,
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
          ':p': fakePipelineId,
        },
      });
      expect(spyOnDynamoDbUpdate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls stepFunctions.startExecution() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnStartExecution).toHaveBeenCalledWith({
        stateMachineArn: fakeExecutionStateMachine,
        input: stringify(fakeExecution()),
      });
      expect(spyOnStartExecution).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), fakeResponse());
      expect(ajv.validate('spec#/definitions/AnalysisExecution', fakeResponse())).toBe(true);
      expect(spyOnRespond).toHaveBeenCalledTimes(1);
      done();
    };
    testMethod(callback);
  });

  describe('calls apig.respondWithError() immediately with the error if', () => {
    let err: Error | ApiError | jasmine.ObjectContaining<{ code: number }>;
    const testError = (after: Callback, done: Callback, validated = true) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(
          callback, fakeRequest(validated), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(callback);
    };

    it('apig.validate() responds with an error', (done: Callback) => {
      err = new ApiError('validate()');
      spyOnValidate.and.returnValue(Promise.reject(err));
      testError(() => {
        expect(spyOnDynamoDbGet).not.toHaveBeenCalled();
      }, done, false);
    });

    it('dynamodb.get() responds with an error', (done: Callback) => {
      err = Error('dynamodb.get()');
      spyOnDynamoDbGet.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnDynamoDbUpdate).not.toHaveBeenCalled();
      }, done);
    });

    it('pipeline is not found', (done: Callback) => {
      err = jasmine.objectContaining({ code: 400 });
      spyOnDynamoDbGet.and.returnValue(fakeResolve({}));
      testError(() => {
        expect(spyOnDynamoDbUpdate).not.toHaveBeenCalled();
      }, done);
    });

    it('not all of the dataset IDs have been defined', (done: Callback) => {
      err = jasmine.objectContaining({ code: 400 });
      const fakeItem = fakePipeline();
      fakeItem.datasets.Dataset_5 = uuidNil;
      spyOnDynamoDbGet.and.returnValue(fakeResolve({ Item: fakeItem }));
      testError(() => {
        expect(spyOnDynamoDbUpdate).not.toHaveBeenCalled();
      }, done);
    });

    it('dynamodb.update() responds with an error', (done: Callback) => {
      err = Error('dynamodb.update()');
      spyOnDynamoDbUpdate.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnStartExecution).not.toHaveBeenCalled();
      }, done);
    });

    it('dynamodb.update() responds with ConditionalCheckFailedException', (done: Callback) => {
      err = jasmine.objectContaining({ code: 409 });
      const errUpdate = new ApiError('dynamodb.update()',
        undefined, 'ConditionalCheckFailedException');
      spyOnDynamoDbUpdate.and.returnValue(fakeReject(errUpdate));
      testError(() => {
        expect(spyOnStartExecution).not.toHaveBeenCalled();
      }, done);
    });

    it('stepFunctions.startExecution() responds with an error', (done: Callback) => {
      err = Error('stepFunctions.startExecution()');
      spyOnStartExecution.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('apig.respond() throws an error', (done: Callback) => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
      testError(() => {}, done);
    });
  });
});

describe('analyses.createRole()', () => {
  const fakeStackName = 'fake-stack';

  const testMethod = (callback: Callback) =>
    createRole(fakeAnalysisId, null, callback);

  let spyOnCreateRole: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.stackName] = fakeStackName;

    spyOnCreateRole = spyOn(iam, 'createRole')
      .and.returnValue(fakeResolve());
  });

  it('calls iam.createRole() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnCreateRole).toHaveBeenCalledWith({
        RoleName: fakeStackName + '-analysis-' + fakeAnalysisId,
        AssumeRolePolicyDocument: stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: {
              Service: 'ecs-tasks.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          }],
        }),
      });
      expect(spyOnCreateRole).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error upon successful request', (done: Callback) => {
    testMethod((err?: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });

  it('calls callback with an error if iam.createRole() produces an error', (done: Callback) => {
    spyOnCreateRole.and.returnValue(fakeReject('iam.createRole()'));
    testMethod((err?: Error) => {
      expect(err).toBeTruthy();
      done();
    });
  });
});

describe('analyses.setRolePolicy()', () => {
  const fakeStackName = 'fake-stack';
  const fakeDataBucket = 'fake-data-bucket';
  const fakeDatasetId1 = uuid();
  const fakeDatasetId2 = uuid();

  const fakeRequest = () => ({
    analysis_id: fakeAnalysisId,
    datasets: {
      Dataset_1: fakeDatasetId1,
      Dataset_2: fakeDatasetId2,
    },
    extra: 'property',
  });

  const testMethod = (callback: Callback) =>
    setRolePolicy(fakeRequest(), null, callback);

  let spyOnAjvCompile: jasmine.Spy;
  let spyOnAjvValidate: jasmine.Spy;
  let spyOnPutRolePolicy: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.stackName] = fakeStackName;
    process.env[envNames.dataBucket] = fakeDataBucket;

    spyOnAjvCompile = spyOn(ajv, 'compile').and.callThrough();
    spyOnAjvValidate = spyOn(ajv, 'validate').and.callThrough();
    spyOnPutRolePolicy = spyOn(iam, 'putRolePolicy')
      .and.returnValue(fakeResolve());
  });

  it('compiles correct schema once', (done: Callback) => {
    testMethod(() => {
      expect(spyOnAjvCompile).toHaveBeenCalledWith({
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
      expect(spyOnAjvCompile).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls ajv.validate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnAjvValidate).toHaveBeenCalledWith('analysisPolicyRequest', fakeRequest());
      expect(spyOnAjvValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls iam.putRolePolicy() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnPutRolePolicy).toHaveBeenCalledWith({
        RoleName: fakeStackName + '-analysis-' + fakeAnalysisId,
        PolicyName: fakeAnalysisId,
        PolicyDocument: stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Action: [
              's3:ListBucket',
            ],
            Resource: [
              'arn:aws:s3:::' + fakeDataBucket,
            ],
            Condition: {
              StringLike: {
                's3:prefix': [
                  fakeAnalysisId + '-a/*',
                  fakeDatasetId1 + '-d/*',
                  fakeDatasetId2 + '-d/*',
                ],
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
              'arn:aws:s3:::' + fakeDataBucket + '/' + fakeAnalysisId + '-a/*',
            ],
          }, {
            Effect: 'Allow',
            Action: [
              's3:GetObject',
            ],
            Resource: [
              'arn:aws:s3:::' + fakeDataBucket + '/' + fakeDatasetId1 + '-d/*',
              'arn:aws:s3:::' + fakeDataBucket + '/' + fakeDatasetId2 + '-d/*',
            ],
          }],
        }),
      });
      expect(spyOnPutRolePolicy).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error upon successful request', (done: Callback) => {
    testMethod((err?: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });

  describe('immediately calls callback with an error if', () => {
    let after: () => void;
    afterEach((done: Callback) => {
      testMethod((err?: Error) => {
        expect(err).toBeTruthy();
        after();
        done();
      });
    });
    it('ajv.compile() throws an error', () => {
      spyOnAjvCompile.and.throwError('ajv.compile()');
      after = () => {
        expect(spyOnAjvValidate).not.toHaveBeenCalled();
        expect(spyOnPutRolePolicy).not.toHaveBeenCalled();
      };
    });
    it('ajv.validate() throws an error', () => {
      spyOnAjvValidate.and.throwError('ajv.validate()');
      after = () => {
        expect(spyOnPutRolePolicy).not.toHaveBeenCalled();
      };
    });
    it('ajv.validate() returns "false"', () => {
      spyOnAjvValidate.and.returnValue(false);
      after = () => {
        expect(spyOnPutRolePolicy).not.toHaveBeenCalled();
      };
    });
    it('iam.putRolePolicy() produces an error', () => {
      spyOnPutRolePolicy.and.returnValue(fakeReject('iam.putRolePolicy()'));
      after = () => {};
    });
  });
});

describe('analyses.deleteRolePolicy()', () => {
  const fakeStackName = 'fake-stack';

  const testMethod = (callback: Callback) =>
    deleteRolePolicy(fakeAnalysisId, null, callback);

  let spyOnDeleteRolePolicy: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.stackName] = fakeStackName;

    spyOnDeleteRolePolicy = spyOn(iam, 'deleteRolePolicy')
      .and.returnValue(fakeResolve());
  });

  it('calls iam.deleteRolePolicy() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDeleteRolePolicy).toHaveBeenCalledWith({
        RoleName: fakeStackName + '-analysis-' + fakeAnalysisId,
        PolicyName: fakeAnalysisId,
      });
      expect(spyOnDeleteRolePolicy).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error upon successful request', (done: Callback) => {
    testMethod((err?: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });

  it('calls callback with an error if iam.deleteRolePolicy() produces an error', (done: Callback) => {
    spyOnDeleteRolePolicy.and.returnValue(fakeReject('iam.deleteRolePolicy()'));
    testMethod((err?: Error) => {
      expect(err).toBeTruthy();
      done();
    });
  });
});

describe('analyses.deleteRole()', () => {
  const fakeStackName = 'fake-stack';

  const testMethod = (callback: Callback) =>
    deleteRole(fakeAnalysisId, null, callback);

  let spyOnDeleteRole: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.stackName] = fakeStackName;

    spyOnDeleteRole = spyOn(iam, 'deleteRole')
      .and.returnValue(fakeResolve());
  });

  it('calls iam.deleteRole() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDeleteRole).toHaveBeenCalledWith({
        RoleName: fakeStackName + '-analysis-' + fakeAnalysisId,
      });
      expect(spyOnDeleteRole).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error upon successful request', (done: Callback) => {
    testMethod((err?: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });

  it('calls callback with an error if iam.deleteRole() produces an error', (done: Callback) => {
    spyOnDeleteRole.and.returnValue(fakeReject('iam.deleteRole()'));
    testMethod((err?: Error) => {
      expect(err).toBeTruthy();
      done();
    });
  });
});

describe('analyses.defineJobs()', () => {
  const fakeAccountId = '012345678910';
  const fakeRegion = 'us-west-1';
  const fakeStackName = 'fake-stack';
  const fakeDataBucket = 'fake-define-jobs-data-bucket';
  const fakePipelineId = uuid();
  const fakeApp1 = 'app1:1.0';
  const fakeApp2 = 'app2';
  const fakeDatasetId1 = uuid();
  const fakeDatasetId2 = uuid();
  const fakeCores = 16;
  const fakeMemory = 16384;

  const fakeSteps = () => [{
    app: fakeApp1,
    args: '-d [d:/Dataset_1/] ' +
          '-d [d:/Dataset_2/path/to/file] ' +
          '-d [d:/Dataset_2/path/to/files/] ' +
          '-d [d:path/to/file] ' +
          '-d [d:path/to/files/] ' +
          '-i [i:/Dataset_1/path/to/file] ' +
          '-i [i:path/to/file] ' +
          '-o [o:path/to/file]',
    cores: fakeCores,
    memory: fakeMemory,
  }, {
    app: fakeApp2,
    args: '-i [i:/Dataset_12/file_i.txt] ' +
          '-o [o:Dataset_12/file_o.txt]',
  }];

  const fakeRequest = () => ({
    analysis_id: fakeAnalysisId,
    pipeline_id: fakePipelineId,
    datasets: {
      Dataset_1: fakeDatasetId1,
      Dataset_2: fakeDatasetId2,
    },
    steps: fakeSteps(),
  });

  const fakeJobResponse = (index: number) => ({
    jobDefinitionName: fakePipelineId + '-' + index,
    revision: index * 10,
  });

  const testMethod = (callback: Callback) =>
    defineJobs(fakeRequest(), null, callback);

  let spyOnRegisterJobDefinition: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.accountId] = fakeAccountId;
    process.env['AWS_REGION'] = fakeRegion;
    process.env[envNames.stackName] = fakeStackName;
    process.env[envNames.dataBucket] = fakeDataBucket;

    spyOnRegisterJobDefinition = spyOn(batch, 'registerJobDefinition')
      .and.returnValues(fakeResolve(fakeJobResponse(0)), fakeResolve(fakeJobResponse(1)));
  });

  it('calls batch.registerJobDefinition() with correct parameters', (done: Callback) => {
    testMethod(() => {
      const fakeRegistry = fakeAccountId + '.dkr.ecr.' + fakeRegion + '.amazonaws.com';
      const fakeRoleArn = 'arn:aws:iam::' + fakeAccountId + ':role/' +
        fakeStackName + '-analysis-' + fakeAnalysisId;
      const fakeJobDefinition = (
          name: string, app: string, command: string,
          cores = 1, memory = defaultMemory) => ({
        type: 'container',
        jobDefinitionName: name,
        containerProperties: {
          image: fakeRegistry + '/' + fakeStackName + '/apps/' + app,
          jobRoleArn: fakeRoleArn,
          command: [command],
          vcpus: cores,
          memory,
          environment: [{
            name: 'DATA_BUCKET',
            value: fakeDataBucket,
          }, {
            name: 'DATA_PATH',
            value: volumePath,
          }],
          volumes: [{
            name: volumeName,
            host: {
              sourcePath: mountPath + '/' + fakeAnalysisId,
            },
          }],
          mountPoints: [{
            sourceVolume: volumeName,
            containerPath: volumePath,
          }],
        },
      });
      expect(spyOnRegisterJobDefinition).toHaveBeenCalledWith(
        fakeJobDefinition(fakePipelineId + '-0', fakeApp1,
          '-d [d:/' + fakeDatasetId1 + '-d/] ' +
          '-d [d:/' + fakeDatasetId2 + '-d/path/to/file] ' +
          '-d [d:/' + fakeDatasetId2 + '-d/path/to/files/] ' +
          '-d [d:/' + fakeAnalysisId + '-a/path/to/file] ' +
          '-d [d:/' + fakeAnalysisId + '-a/path/to/files/] ' +
          '-i [i:/' + fakeDatasetId1 + '-d/path/to/file] ' +
          '-i [i:/' + fakeAnalysisId + '-a/path/to/file] ' +
          '-o [o:/' + fakeAnalysisId + '-a/path/to/file]',
          fakeCores, fakeMemory,
        )
      );
      expect(spyOnRegisterJobDefinition).toHaveBeenCalledWith(
        fakeJobDefinition(fakePipelineId + '-1', fakeApp2,
          '-i [i:/Dataset_12/file_i.txt] ' +
          '-o [o:/' + fakeAnalysisId + '-a/Dataset_12/file_o.txt]',
        )
      );
      expect(spyOnRegisterJobDefinition).toHaveBeenCalledTimes(2);
      done();
    });
  });

  it('calls callback with correct parameters upon successful request', (done: Callback) => {
    testMethod((err?: Error, data?: any) => {
      expect(err).toBeFalsy();
      expect(data).toEqual([
        fakePipelineId + '-0:0',
        fakePipelineId + '-1:10',
      ]);
      done();
    });
  });

  describe('calls callback immediately with an error if', () => {
    let request: any;
    let after: () => void;
    beforeEach(() => {
      request = fakeRequest();
      after = () => {};
    });
    afterEach((done: Callback) => {
      defineJobs(request, null, (err?: Error) => {
        expect(err).toBeTruthy();
        after();
        done();
      });
    });
    describe('request', () => {
      afterEach(() => {
        after = () => {
          expect(spyOnRegisterJobDefinition).not.toHaveBeenCalled();
        };
      });
      it('is undefined', () => request = undefined);
      it('is null', () => request = null);
      it('steps are undefined', () => request.steps = undefined);
      it('steps are null', () => request.steps = null);
      it('steps are not an array', () => request.steps = {});
      it('steps are empty', () => request.steps = []);
      it('datasets are undefined', () => request.datasets = undefined);
      it('datasets are null', () => request.datasets = null);
      it('datasets are empty', () => request.datasets = {});
      it('has a dataset with an invalid name', () => request.datasets = {
        'Dataset_1.*': fakeDatasetId1,
      });
    });
    describe('batch.registerJobDefinition() produces', () => {
      let response: any;
      afterEach(() => {
        spyOnRegisterJobDefinition.and.returnValue(response);
      });
      it('an error', () => response = fakeReject('batch.registerJobDefinition()'));
      it('an undefined response', () => response = fakeResolve(undefined));
      it('a null response', () => response = fakeResolve(null));
      it('an empty response', () => response = fakeResolve({}));
    });
  });
});

describe('analyses.submitJobs()', () => {
  const fakeJobQueue = 'fake-job-queue';
  const fakeJobDefinition1 = 'fake-job-1:5';
  const fakeJobDefinition2 = 'fake-job-2:10';
  const fakeJobDefinition3 = 'fake-job-3:15';
  const fakeJobId1 = uuid();
  const fakeJobId2 = uuid();
  const fakeJobId3 = uuid();

  const fakeRequest = () => ({
    jobDefinitions: [
      fakeJobDefinition1,
      fakeJobDefinition2,
      fakeJobDefinition3,
    ],
    jobQueue: fakeJobQueue,
  });

  const fakeJobName = (jobDefinition: string) =>
    jobDefinition.replace(':', '-');

  const testMethod = (callback: Callback) =>
    submitJobs(fakeRequest(), null, callback);

  let spyOnSubmitJob: jasmine.Spy;

  beforeEach(() => {
    spyOnSubmitJob = spyOn(batch, 'submitJob')
      .and.returnValues(
        fakeResolve({ jobId: fakeJobId1 }),
        fakeResolve({ jobId: fakeJobId2 }),
        fakeResolve({ jobId: fakeJobId3 }),
      );
  });

  it('calls batch.submitJob() with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnSubmitJob).toHaveBeenCalledWith({
        jobDefinition: fakeJobDefinition1,
        jobName: fakeJobName(fakeJobDefinition1),
        jobQueue: fakeJobQueue,
      });
      expect(spyOnSubmitJob).toHaveBeenCalledWith({
        jobDefinition: fakeJobDefinition2,
        jobName: fakeJobName(fakeJobDefinition2),
        jobQueue: fakeJobQueue,
        dependsOn: [{
          jobId: fakeJobId1,
        }],
      });
      expect(spyOnSubmitJob).toHaveBeenCalledWith({
        jobDefinition: fakeJobDefinition3,
        jobName: fakeJobName(fakeJobDefinition3),
        jobQueue: fakeJobQueue,
        dependsOn: [{
          jobId: fakeJobId2,
        }],
      });
      expect(spyOnSubmitJob).toHaveBeenCalledTimes(3);
      done();
    });
  });

  it('calls callback with correct parameters upon successful request', (done: Callback) => {
    testMethod((err?: Error, data?: any) => {
      expect(err).toBeFalsy();
      expect(data).toEqual([
        fakeJobId1,
        fakeJobId2,
        fakeJobId3,
      ]);
      done();
    });
  });

  describe('calls callback with an error if', () => {
    let request: any;
    let after: () => void;
    beforeEach(() => {
      request = fakeRequest();
      after = () => {};
    });
    afterEach((done: Callback) => {
      submitJobs(request, null, (err?: Error) => {
        expect(err).toBeTruthy();
        after();
        done();
      });
    });
    describe('request', () => {
      afterEach(() => {
        after = () => {
          expect(spyOnSubmitJob).not.toHaveBeenCalled();
        };
      });
      it('is undefined', () => request = undefined);
      it('is null', () => request = null);
      it('jobDefinitions are undefined', () => request.jobDefinitions = undefined);
      it('jobDefinitions are null', () => request.jobDefinitions = null);
      it('jobDefinitions are not an array', () => request.jobDefinitions = {});
      it('jobDefinitions are empty', () => request.jobDefinitions = []);
    });
    describe('batch.submitJob() produces', () => {
      let response: any;
      afterEach(() => {
        spyOnSubmitJob.and.returnValue(response);
      });
      it('an error', () => response = fakeReject('batch.submitJob()'));
      it('an undefined response', () => response = fakeResolve(undefined));
      it('a null response', () => response = fakeResolve(null));
      it('an empty response', () => response = fakeResolve({}));
    });
  });
});
