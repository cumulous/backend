import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import * as apig from './apig';
import { ajv, ApiError } from './apig';
import { dynamodb } from './aws';
import { envNames } from './env';
import { create, defaultMemory } from './pipelines';
import { fakeReject, fakeResolve } from './fixtures/support';
import { Callback, Dict } from './types';
import { uuidNil } from './util';

describe('pipelines.create()', () => {
  const fakePipelinesTable = 'fake-pipelines-table';
  const fakePipelineName = 'fake-pipeline';
  const fakePipelineId = uuid();
  const fakeDatasetId1 = uuid();
  const fakeDatasetId2 = uuid();
  const fakeDatasetIdX = uuid();
  const fakePrincipalId = uuid();
  const fakeDate = new Date().toISOString();
  const fakeCores = 24;
  const fakeMemory = 72;

  const fakeDatasets = (): Dict<string> => ({
    'Dataset_1': fakeDatasetId1,
    'Dataset_2': fakeDatasetId2,
    'Dataset_3': uuidNil,
    'Dataset_X': fakeDatasetIdX,
  });

  const fakeSteps = (processed?: boolean, extraProperty?: boolean) => {
    const steps: any[] = [{
      app: 'app1',
      args: '-i [i:file_i.txt] -d [d:file_d.txt] -o [o:file_o.txt]',
    }, {
      app: 'app:1.0.1a',
      args: '-i [i:files/file_i.txt] -d [d:files/file_d.txt] -o [o:files/file_o.txt]',
      cores: fakeCores,
      memory: fakeMemory,
    }, {
      app: 'app1',
      args: '-i [i:/Dataset_1/file_i.txt] -d [d:/Dataset_1/file_d.txt]',
    }, {
      app: 'app2',
      args: '-d [d:/Dataset_2/] -d [d:/Dataset_2/files/]',
    }, {
      app: 'app3',
      args: '-i [i:/Dataset_3/files/file_i.txt] -d [d:/Dataset_3/files/file_d.txt]',
    }, {
      app: 'app4',
      args: '-i [i:/Dataset_4/file_i.txt] -d [d:/Dataset_4/file_d.txt]',
    }];
    if (processed) {
      steps.forEach(step => {
        step.cores = step.cores || 1;
        step.memory = step.memory || defaultMemory;
      });
    }
    if (extraProperty) {
      steps.forEach(step => step.extra = 'property');
    }
    return steps;
  };

  const fakePipelineRequest = (extraProperty?: boolean) => ({
    name: fakePipelineName,
    datasets: fakeDatasets(),
    steps: fakeSteps(false, extraProperty),
  });

  const fakeContext = () => ({
    authorizer: {
      principalId: fakePrincipalId,
    },
  });

  const fakeRequest = (validated = true) => ({
    body: validated ? fakePipelineRequest() : stringify(fakePipelineRequest(true)),
    requestContext: fakeContext(),
  });

  const fakeResponse = () => ({
    id: fakePipelineId,
    name: fakePipelineName,
    datasets: {
      'Dataset_1': fakeDatasetId1,
      'Dataset_2': fakeDatasetId2,
      'Dataset_3': uuidNil,
      'Dataset_4': uuidNil,
    } as Dict<string>,
    steps: fakeSteps(true),
    created_at: fakeDate,
    created_by: fakePrincipalId,
    status: 'active',
  });

  const testMethod = (callback: Callback) =>
    create(fakeRequest(false), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnDynamoDbPut: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.pipelinesTable] = fakePipelinesTable;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOn(uuid, 'v4').and.returnValue(fakePipelineId);
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
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'POST', '/pipelines');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls dynamodb.put() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDynamoDbPut).toHaveBeenCalledWith({
        TableName: fakePipelinesTable,
        Item: fakeResponse(),
        ConditionExpression: 'attribute_not_exists(id)',
      });
      expect(spyOnDynamoDbPut).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), fakeResponse());
      expect(ajv.validate('spec#/definitions/Pipeline', fakeResponse())).toBe(true);
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
