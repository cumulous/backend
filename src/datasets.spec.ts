import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import * as apig from './apig';
import { ajv, ApiError, Request } from './apig';
import { dynamodb } from './aws';
import { create } from './datasets';
import { envNames } from './env';
import { fakeReject, fakeResolve } from './fixtures/support';
import { Callback } from './types';

const fakeMemberId = uuid();
const fakeDatasetsTable = 'datasets-table';
const fakeDatasetId = uuid();
const fakeProjectId = uuid();
const fakeDescription = 'Fake dataset';
const fakeDate = new Date().toISOString();
const fakeExpiresAt = String(new Date().getTime());

describe('create()', () => {
  const fakeBody = () => ({
    projectId: fakeProjectId,
    description: fakeDescription,
  });
  const fakeContext = () => ({
    authorizer: {
      principalId: fakeMemberId,
    },
  });
  const fakeRequest = () => ({
    body: stringify(fakeBody()),
    requestContext: fakeContext(),
  });
  const fakeItem = () => ({
    id: fakeDatasetId,
    projectId: fakeProjectId,
    creatorId: fakeMemberId,
    dateCreated: fakeDate,
    description: fakeDescription,
    status: 'Created',
  });

  const testMethod = (callback: Callback) =>
    create(fakeRequest(), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnDynamoDbPut: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOnDynamoDbPut = spyOn(dynamodb, 'put')
      .and.returnValue(fakeResolve());
    spyOn(uuid, 'v4').and.returnValue(fakeDatasetId);
    spyOn(Date.prototype, 'toISOString').and.returnValue(fakeDate);
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());

    process.env[envNames.datasetsTable] = fakeDatasetsTable;
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    spyOnValidate.and.returnValue(Promise.resolve());
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'POST', '/datasets');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls dynamodb.put() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDynamoDbPut).toHaveBeenCalledWith({
        TableName: fakeDatasetsTable,
        Item: fakeItem(),
        ConditionExpression: 'attribute_not_exists(Id)',
      });
      expect(spyOnDynamoDbPut).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback, {
        body: fakeBody(),
        requestContext: fakeContext(),
      }, fakeItem());
      expect(ajv.validate('spec#/definitions/Dataset', fakeItem())).toBe(true);
      expect(spyOnRespond).toHaveBeenCalledTimes(1);
      done();
    };
    create(fakeRequest(), null, callback);
  });

  describe('calls apig.respondWithError() immediately with the error if', () => {
    let err: Error | ApiError | jasmine.Any;

    const testError = (after: Callback, done: Callback, validated = true) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(callback, {
          body: validated ? fakeBody() : stringify(fakeBody()),
          requestContext: fakeContext(),
        }, err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      create(fakeRequest(), null, callback);
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

    it('apig.respond() produces an error', (done: Callback) => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
      testError(() => {}, done);
    });
  });
});
