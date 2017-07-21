import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import * as apig from './apig';
import { ajv, ApiError } from './apig';
import { dynamodb } from './aws';
import { envNames } from './env';
import { create } from './pipelines';
import { fakeReject, fakeResolve } from './fixtures/support';
import { Callback, Dict } from './types';

describe('pipelines.create()', () => {
  const fakePipelinesTable = 'fake-pipelines-table';
  const fakePipelineName = 'fake-pipeline';
  const fakePipelineId = uuid();
  const fakeDatasetId1 = uuid();
  const fakeDatasetId2 = uuid();
  const fakeDatasetIdX = uuid();
  const fakePrincipalId = uuid();
  const fakeDate = new Date().toISOString();

  const fakeDatasets = (): Dict<string> => ({
    'Dataset_1': fakeDatasetId1,
    'Dataset_2': fakeDatasetId2,
    'Dataset_3': '',
    'Dataset_X': fakeDatasetIdX,
  });

  const fakeSteps = () => [{
    app: 'app',
    args: '-i [file_i.txt]:i -d [file_d.txt]:d -o [file_o.txt]:o',
  }, {
    app: 'app1:1.0.1a',
    args: '-i [/Dataset_1/file_i.txt]:i -d [/Dataset_1/file_d.txt]:d -o [file_o.txt]:o',
  }, {
    app: 'app2',
    args: '-d [/Dataset_2]:d -o [file o.txt]:o',
  }, {
    app: 'app3',
    args: '-i [/Dataset_3/file_i.txt]:i -d [/Dataset_3/file_d.txt]:d -o [file_o.txt]:o',
  }, {
    app: 'app4',
    args: '-i [/Dataset_4/file_i.txt]:i -d [/Dataset_4/file_d.txt]:d -o [file_o.txt]:o',
  }];

  const fakePipeline = () => ({
    name: fakePipelineName,
    datasets: fakeDatasets(),
    steps: fakeSteps(),
  });

  const fakeContext = () => ({
    authorizer: {
      principalId: fakePrincipalId,
    },
  });

  const fakeRequest = (validated = true) => ({
    body: validated ? fakePipeline() : stringify(fakePipeline()),
    requestContext: fakeContext(),
  });

  const fakeItem = () => ({
    id: fakePipelineId,
    name: fakePipelineName,
    datasets: {
      'Dataset_1': fakeDatasetId1,
      'Dataset_2': fakeDatasetId2,
      'Dataset_3': '',
      'Dataset_4': '',
    } as Dict<string>,
    steps: fakeSteps(),
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
        Item: fakeItem(),
        ConditionExpression: 'attribute_not_exists(id)',
      });
      expect(spyOnDynamoDbPut).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), fakeItem());
      expect(ajv.validate('spec#/definitions/Pipeline', fakeItem())).toBe(true);
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
