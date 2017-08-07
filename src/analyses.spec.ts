import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import { create, list,
         createRole, deleteRole, deleteRolePolicy, setRolePolicy,
         defineJobs, submitJobs, describeJobs, checkJobsUpdated, cancelJobs,
         submitExecution, calculateStatus, updateStatus, cancelExecution,
         volumeName, volumePath } from './analyses';
import * as apig from './apig';
import { ajv, ApiError } from './apig';
import { batch, cloudWatchEvents, dynamodb, iam, stepFunctions } from './aws';
import { envNames } from './env';
import { fakeReject, fakeResolve } from './fixtures/support';
import { mountPath }  from './instances';
import * as search from './search';
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

describe('analyses.list()', () => {
  const fakeProjectId = uuid();

  const fakeRequest = () => ({
    queryStringParameters: {
      project_id: fakeProjectId,
    },
  });

  let spyOnSearchQuery: jasmine.Spy;

  beforeEach(() => {
    spyOnSearchQuery = spyOn(search, 'query')
      .and.callFake((request: Request, resource: string,
                    terms: string[] = [], callback: Callback) => callback());
  });

  it('calls search.query() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnSearchQuery).toHaveBeenCalledWith(
        fakeRequest(), '/analyses', ['project_id', 'status'], callback);
      expect(spyOnSearchQuery).toHaveBeenCalledTimes(1);
      done();
    };
    list(fakeRequest(), null, callback);
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
          ':p': fakePipelineId,
          ':d': fakeDatasetsResponse(),
          ':e': '-',
          ':j': [],
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
  const fakeMemory = 32.7681;

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
    cores: fakeCores * 2,
    memory: fakeMemory * 2,
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
          name: string, app: string, command: string, cores: number, memory: number) => ({
        type: 'container',
        jobDefinitionName: name,
        containerProperties: {
          image: fakeRegistry + '/' + fakeStackName + '/apps/' + app,
          jobRoleArn: fakeRoleArn,
          command: [command],
          vcpus: cores,
          memory: Math.round(memory * 1000),
          environment: [{
            name: 'DATA_BUCKET',
            value: fakeDataBucket,
          }, {
            name: 'DATA_PATH',
            value: volumePath,
          }, {
            name: 'LOG_DEST',
            value: fakeAnalysisId + '-a/logs/' + name + '.log',
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
          fakeCores * 2, fakeMemory * 2,
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

describe('analyses.describeJobs()', () => {
  const fakeJobId1 = uuid();
  const fakeJobId2 = uuid();
  const fakeJobId3 = uuid();
  const fakeStatusReason = 'Out of memory';

  const fakeJobIds = () => [fakeJobId1, fakeJobId2, fakeJobId3];

  const fakeRequest = () => ({
    analysis_id: fakeAnalysisId,
    jobIds: fakeJobIds(),
  });

  const testMethod = (callback: Callback) =>
    describeJobs(fakeRequest(), null, callback);

  const fakeJobs = () => [{
    jobId: fakeJobId2,
    status: 'FAILED',
    statusReason: fakeStatusReason,
  }, {
    jobId: fakeJobId1,
    status: 'SUCCEEDED',
    statusReason: 'OK',
  }, {
    jobId: fakeJobId3,
    status: 'PENDING',
  }];

  let spyOnDescribeJobs: jasmine.Spy;

  beforeEach(() => {
    spyOnDescribeJobs = spyOn(batch, 'describeJobs')
      .and.returnValue(fakeResolve({
        jobs: fakeJobs(),
      }));
  });

  it('calls batch.describeJobs() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDescribeJobs).toHaveBeenCalledWith({
        jobs: fakeJobIds(),
      });
      expect(spyOnDescribeJobs).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback with correct parameters', (done: Callback) => {
    testMethod((err?: Error, data?: any) => {
      expect(err).toBeFalsy();
      expect(data).toEqual([{
        status: 'SUCCEEDED',
      }, {
        status: 'FAILED',
        reason: fakeStatusReason,
      }, {
        status: 'PENDING',
      }]);
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
      describeJobs(request, null, (err?: Error) => {
        expect(err).toBeTruthy();
        after();
        done();
      });
    });
    describe('request', () => {
      afterEach(() => {
        after = () => {
          expect(spyOnDescribeJobs).not.toHaveBeenCalled();
        };
      });
      it('is undefined', () => request = undefined);
      it('is null', () => request = null);
    });
    it('batch.describeJobs() produces an error', () => {
      spyOnDescribeJobs.and.returnValue(fakeReject('batch.describeJobs()'));
    });
  });
});

describe('analyses.checkJobsUpdated()', () => {
  const fakeJobs = () => [
    { status: 'SUBMITTED' },
    { status: 'PENDING' },
    { status: 'RUNNABLE' },
    { status: 'STARTING' },
    { status: 'RUNNING' },
    { status: 'FAILED', reason: 'Fake failure reason' },
    { status: 'SUCCEEDED' },
  ];

  describe('calls callback with correct parameters if', () => {
    let jobs: any[];
    let oldJobs: any[];
    let result: boolean;

    beforeEach(() => {
      jobs = fakeJobs();
      oldJobs = fakeJobs();
      result = undefined;
    });

    afterEach((done: Callback) => {
      checkJobsUpdated({ jobs, oldJobs }, null, (err?: Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual(result);
        done();
      });
    });

    it('all job statuses are the same', () => {
      result = false;
    });

    it("at least one job's status has changed", () => {
      jobs[3] = 'RUNNING';
      result = true;
    });
  });

  describe('calls callback immediately with an error if request', () => {
    let request: any;
    beforeEach(() => {
      request = {
        jobs: fakeJobs(),
        oldJobs: fakeJobs(),
      };
    });
    afterEach((done: Callback) => {
      checkJobsUpdated(request, null, (err?: Error, data?: any) => {
        expect(err).toBeTruthy();
        expect(data).toBeUndefined();
        done();
      });
    });
    it('is undefined', () => request = undefined);
    it('is null', () => request = null);
    it('jobs is undefined', () => request.jobs = undefined);
    it('jobs is null', () => request.jobs = null);
    it('jobs is not an array', () => request.jobs = {});
    it('jobs is empty', () => request.jobs = []);
    it('jobs element is undefined', () => request.jobs[0] = undefined);
    it('jobs element is null', () => request.jobs[0] = null);
    it('oldJobs is undefined', () => request.oldJobs = undefined);
    it('oldJobs is null', () => request.oldJobs = null);
    it('oldJobs is not an array', () => request.oldJobs = {});
    it('oldJobs is empty', () => request.oldJobs = []);
    it('oldJobs element is undefined', () => request.oldJobs[0] = undefined);
    it('oldJobs element is null', () => request.oldJobs[0] = null);
    it('jobs and oldJobs are of different length', () => request.jobs.push({ status: 'RUNNING' }));
  });
});

describe('analyses.calculateStatus()', () => {
  describe('calls callback with correct parameters if', () => {
    const fakeStatusReason = 'Out of memory';

    let jobs: any[];
    let status: string;
    let error: string;

    beforeEach(() => {
      jobs = undefined;
      status = undefined;
      error = '';
    });
    afterEach((done: Callback) => {
      calculateStatus({ jobs }, null, (err?: Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual({
          status,
          error,
        });
        done();
      });
    });
    it('all jobs are < RUNNING', () => {
      jobs = [
        { status: 'SUBMITTED' },
        { status: 'PENDING' },
        { status: 'RUNNABLE' },
        { status: 'STARTING' },
      ];
      status = 'pending';
    });
    it('at least one job is RUNNING, and no jobs are FAILED', () => {
      jobs = [
        { status: 'SUBMITTED' },
        { status: 'PENDING' },
        { status: 'RUNNABLE' },
        { status: 'STARTING' },
        { status: 'RUNNING' },
      ];
      status = 'running';
    });
    it('at least one job is SUCCEEDED, and all of the others are < RUNNING', () => {
      jobs = [
        { status: 'SUBMITTED' },
        { status: 'PENDING' },
        { status: 'RUNNABLE' },
        { status: 'STARTING' },
        { status: 'SUCCEEDED' },
      ];
      status = 'running';
    });
    it('at least one job is FAILED, and at least one job is <= RUNNING', () => {
      jobs = [
        { status: 'SUBMITTED' },
        { status: 'PENDING' },
        { status: 'RUNNABLE' },
        { status: 'STARTING' },
        { status: 'RUNNING', reason: fakeStatusReason + 0 },
        { status: 'FAILED', reason: fakeStatusReason },
        { status: 'FAILED', reason: fakeStatusReason + 2 },
        { status: 'SUCCEEDED' },
      ];
      status = 'failing';
      error = fakeStatusReason;
    });
    it('at least one job is FAILED, one SUCCEEDED, ' +
       'and all of the others are either SUCCEEDED or FAILED', () => {
      jobs = [
        { status: 'SUCCEEDED' },
        { status: 'SUCCEEDED', reason: fakeStatusReason + 0 },
        { status: 'FAILED', reason: fakeStatusReason },
        { status: 'FAILED', reason: fakeStatusReason + 2 },
        { status: 'SUCCEEDED' },
      ];
      status = 'failed';
      error = fakeStatusReason;
    });
    it('all of the jobs are FAILED', () => {
      jobs = [
        { status: 'FAILED', reason: fakeStatusReason },
        { status: 'FAILED', reason: fakeStatusReason + 2 },
      ];
      status = 'failed';
      error = fakeStatusReason;
    });
    it('all of the jobs are SUCCEEDED', () => {
      jobs = [
        { status: 'SUCCEEDED' },
        { status: 'SUCCEEDED' },
        { status: 'SUCCEEDED' },
      ];
      status = 'succeeded';
    });
  });

  describe('calls callback immediately with an error if request', () => {
    let request: any;
    beforeEach(() => {
      request = {};
    });
    afterEach((done: Callback) => {
      calculateStatus(request, null, (err?: Error, data?: any) => {
        expect(err).toBeTruthy();
        expect(data).toBeUndefined();
        done();
      });
    });
    it('is undefined', () => request = undefined);
    it('is null', () => request = null);
    it('jobs is undefined', () => request.jobs = undefined);
    it('jobs is null', () => request.jobs = null);
    it('jobs is not an array', () => request.jobs = {});
    it('jobs is empty', () => request.jobs = []);
    describe('job status', () => {
      let status: any;
      afterEach(() => request.jobs = [
        { status },
        { status: 'RUNNING' },
      ]);
      it('is unrecognized', () => status = 'STATUS');
      it('is undefined', () => status = undefined);
      it('is null', () => status = null);
      it('is not a string', () => status = {});
    });
    it('reason is not a string', () => request.jobs = [
      { status: 'FAILED', reason: {} },
    ]);
  });
});

describe('analyses.updateStatus()', () => {
  const fakeAnalysesTable = 'fake-analyses-table-' + uuid();
  const fakeStatus = 'failing';
  const fakeError = 'Fake failure';

  const fakeJobs = () => [
    { status: 'SUBMITTED' },
    { status: 'PENDING' },
    { status: 'RUNNABLE' },
    { status: 'STARTING' },
    { status: 'RUNNING' },
    { status: 'FAILED', reason: fakeError },
    { status: 'SUCCEEDED' },
  ];

  const fakeJobStatuses = () => fakeJobs().map(job => job.status.toLowerCase());

  const fakeAnalysis = (error?: string) => Object.assign({
    status: fakeStatus,
  }, error ? {
    error: fakeError,
  } : {});

  const fakeRequest = (error?: string, jobs?: any[]) => ({
    analysis_id: fakeAnalysisId,
    analysis: fakeAnalysis(error),
    jobs,
  });

  let spyOnDynamoDbUpdate: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.analysesTable] = fakeAnalysesTable;

    spyOnDynamoDbUpdate = spyOn(dynamodb, 'update')
      .and.returnValue(fakeResolve());
  });

  describe('calls dynamodb.update() once with correct parameters when', () => {
    let error: string;
    let jobs: any[];
    beforeEach(() => {
      error = undefined;
      jobs = undefined;
    });
    afterEach((done: Callback) => {
      updateStatus(fakeRequest(error, jobs), null, () => {
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledWith({
          TableName: fakeAnalysesTable,
          Key: {
            id: fakeAnalysisId,
          },
          UpdateExpression: error ?
            (jobs ? 'set #s = :s, #e = :e, #j = :j' : 'set #s = :s, #e = :e') :
            (jobs ? 'set #s = :s, #j = :j' : 'set #s = :s'),
          ConditionExpression: 'not (#s = :c)',
          ExpressionAttributeNames: error ? (jobs ? {
            '#s': 'status',
            '#e': 'error',
            '#j': 'jobs',
          } : {
            '#s': 'status',
            '#e': 'error',
          }) : (jobs ? {
            '#s': 'status',
            '#j': 'jobs',
          } : {
            '#s': 'status',
          }),
          ExpressionAttributeValues: Object.assign({
            ':s': fakeStatus,
            ':c': 'canceling',
          }, error ? (jobs ? {
            ':e': error,
            ':j': fakeJobStatuses(),
          } : {
            ':e': error,
          }) : (jobs ? {
            ':j': fakeJobStatuses(),
          } : {})),
        });
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledTimes(1);
        done();
      });
    });
    it('analysis error is undefined', () => error = undefined);
    it('analysis error is null', () => error = null);
    it('analysis error is empty', () => error = '');
    it('analysis error is non-empty', () => error = fakeError);
    it('jobs is undefined', () => jobs = undefined);
    it('jobs is null', () => jobs = null);
    it('jobs is defined', () => jobs = fakeJobs());
    it('analysis error is non-empty and jobs is defined', () => {
      error = fakeError;
      jobs = fakeJobs();
    });
  });

  it('calls callback with correct parameters on successful update', (done: Callback) => {
    updateStatus(fakeRequest(fakeError), null, (err?: Error, data?: any) => {
      expect(err).toBeFalsy();
      expect(data).toEqual(fakeError);
      done();
    });
  });

  describe('calls callback immediately with an error if', () => {
    let request: any;
    let after: (err?: Error) => void;
    beforeEach(() => {
      request = fakeRequest();
      after = () => {
        expect(spyOnDynamoDbUpdate).not.toHaveBeenCalled();
      };
    });
    afterEach((done: Callback) => {
      updateStatus(request, null, (err?: Error, data?: any) => {
        expect(err).toBeTruthy();
        expect(data).toBeUndefined();
        after(err);
        done();
      });
    });
    it('request is undefined', () => request = undefined);
    it('request is null', () => request = null);
    it('analysis is undefined', () => request.analysis = undefined);
    it('analysis is null', () => request.analysis = null);
    it('analysis is cancelled', () => {
      const errUpdate = new ApiError('dynamodb.update()',
        undefined, 'ConditionalCheckFailedException');
      spyOnDynamoDbUpdate.and.returnValue(fakeReject(errUpdate));
      after = (err?: Error) => {
        expect(err.name).toEqual('ConditionalCheckFailedException');
      };
    });
  });
});

describe('analyses.cancelJobs()', () => {
  const fakeJobId1 = uuid();
  const fakeJobId2 = uuid();
  const fakeJobId3 = uuid();

  const fakeJobIds = () => [fakeJobId1, fakeJobId2, fakeJobId3];

  const fakeRequest = () => ({
    jobIds: fakeJobIds(),
  });

  const testMethod = (callback: Callback) =>
    cancelJobs(fakeRequest(), null, callback);

  let spyOnTerminateJob: jasmine.Spy;

  beforeEach(() => {
    spyOnTerminateJob = spyOn(batch, 'terminateJob')
      .and.returnValue(fakeResolve());
  });

  it('calls batch.terminateJob() with correct parameters', (done: Callback) => {
    testMethod(() => {
      const reason = 'Canceled by user';
      expect(spyOnTerminateJob).toHaveBeenCalledWith({
        jobId: fakeJobId1,
        reason,
      });
      expect(spyOnTerminateJob).toHaveBeenCalledWith({
        jobId: fakeJobId2,
        reason,
      });
      expect(spyOnTerminateJob).toHaveBeenCalledWith({
        jobId: fakeJobId3,
        reason,
      });
      expect(spyOnTerminateJob).toHaveBeenCalledTimes(3);
      done();
    });
  });

  it('calls callback without an error for a correct request', (done: Callback) => {
    testMethod((err?: Error, data?: any) => {
      expect(err).toBeFalsy();
      expect(data).toBeUndefined();
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
      cancelJobs(request, null, (err?: Error) => {
        expect(err).toBeTruthy();
        after();
        done();
      });
    });
    describe('request', () => {
      afterEach(() => {
        after = () => {
          expect(spyOnTerminateJob).not.toHaveBeenCalled();
        };
      });
      it('is undefined', () => request = undefined);
      it('is null', () => request = null);
      it('jobIds is undefined', () => request.jobIds = undefined);
      it('jobIds is null', () => request.jobIds = null);
      it('jobIds is not an array', () => request.jobIds = {});
    });
    it('batch.terminateJob() produces an error', () => {
      spyOnTerminateJob.and.returnValues(
        fakeResolve(),
        fakeReject('batch.terminateJob()'),
        fakeResolve(),
      );
    });
  });
});

describe('analyses.cancelExecution()', () => {
  const fakePipelineId = uuid();
  const fakeDatasetId1 = uuid();
  const fakeDatasetId2 = uuid();
  const fakeDate = new Date().toISOString();

  const fakeRequest = () => ({
    pathParameters: {
      analysis_id: fakeAnalysisId,
    },
  });

  const fakeDatasets = () => ({
    Dataset_1: fakeDatasetId1,
    Dataset_2: fakeDatasetId2,
  });

  const fakeUpdateResponse = () => ({
    id: fakeAnalysisId,
    pipeline_id: fakePipelineId,
    created_at: fakeDate,
    datasets: fakeDatasets(),
    status: 'canceling',
  });

  const fakeResponse = () => ({
    analysis_id: fakeAnalysisId,
    pipeline_id: fakePipelineId,
    datasets: fakeDatasets(),
    status: 'canceling',
  });

  const testMethod = (callback: Callback) =>
    cancelExecution(fakeRequest(), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnDynamoDbUpdate: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.analysesTable] = fakeAnalysesTable;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOnDynamoDbUpdate = spyOn(dynamodb, 'update')
      .and.returnValue(fakeResolve({ Attributes: fakeUpdateResponse() }));
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'DELETE', '/analyses/{analysis_id}/execution');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
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
        UpdateExpression: 'set #s = :c',
        ConditionExpression: '#s in (:s, :p, :r, :c)',
        ExpressionAttributeNames: {
          '#s': 'status',
        },
        ExpressionAttributeValues: {
          ':s': 'submitted',
          ':p': 'pending',
          ':r': 'running',
          ':c': 'canceling',
        },
        ReturnValues: 'ALL_NEW',
      });
      expect(spyOnDynamoDbUpdate).toHaveBeenCalledTimes(1);
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
    let after: () => void;
    beforeEach(() => {
      after = () => {};
    });
    afterEach((done: Callback) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(callback, fakeRequest(), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(callback);
    });

    it('apig.validate() responds with an error', () => {
      err = new ApiError('validate()');
      spyOnValidate.and.returnValue(Promise.reject(err));
      after = () => {
        expect(spyOnDynamoDbUpdate).not.toHaveBeenCalled();
      };
    });

    it('dynamodb.update() responds with a generic error', () => {
      err = Error('dynamodb.update()');
      spyOnDynamoDbUpdate.and.returnValue(fakeReject(err));
    });

    it('dynamodb.update() responds with ConditionalCheckFailedException', () => {
      err = jasmine.objectContaining({ code: 409 });
      const errUpdate = new ApiError('dynamodb.update()',
        undefined, 'ConditionalCheckFailedException');
      spyOnDynamoDbUpdate.and.returnValue(fakeReject(errUpdate));
    });

    it('apig.respond() throws an error', () => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
    });
  });
});
