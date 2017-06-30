import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import * as apig from './apig';
import { ajv, ApiError, Request } from './apig';
import { dynamodb, sts } from './aws';
import { create, CredentialsAction, list, requestCredentials } from './datasets';
import { envNames } from './env';
import { fakeReject, fakeResolve } from './fixtures/support';
import * as search from './search';
import { Callback } from './types';

const fakeMemberId = uuid();
const fakeDatasetsTable = 'datasets-table';
const fakeDatasetId = uuid();
const fakeProjectId = uuid();
const fakeDescription = 'Fake dataset';
const fakeDate = new Date().toISOString();
const fakeExpiresAt = String(new Date().getTime());
const fakeDatasetsBucket = 'fake-datasets-bucket';

describe('datasets.create()', () => {
  const fakeBody = () => ({
    project_id: fakeProjectId,
    description: fakeDescription,
  });
  const fakeContext = () => ({
    authorizer: {
      principalId: fakeMemberId,
    },
  });
  const fakeRequest = (validated = true) => ({
    body: validated ? fakeBody() : stringify(fakeBody()),
    requestContext: fakeContext(),
  });
  const fakeItem = () => ({
    id: fakeDatasetId,
    project_id: fakeProjectId,
    creator_id: fakeMemberId,
    created_at: fakeDate,
    description: fakeDescription,
    status: 'created',
  });

  const testMethod = (callback: Callback) =>
    create(fakeRequest(false), null, callback);

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
        ConditionExpression: 'attribute_not_exists(id)',
      });
      expect(spyOnDynamoDbPut).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), fakeItem());
      expect(ajv.validate('spec#/definitions/Dataset', fakeItem())).toBe(true);
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

    it('apig.respond() produces an error', (done: Callback) => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
      testError(() => {}, done);
    });
  });
});

describe('datasets.credentials()', () => {
  const fakeStatus = 'available';
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
        fakeRequest(), '/datasets', ['project_id', 'status'], callback);
      expect(spyOnSearchQuery).toHaveBeenCalledTimes(1);
      done();
    };
    list(fakeRequest(), null, callback);
  });
});

describe('datasets.requestCredentials()', () => {
  const fakeDatasetsRoleArn = 'arn:aws:iam::123456789012:role/fake-datasets-role';
  const fakeAccessKeyId = 'AKIAIOSFODNN7EXAMPLE';
  const fakeSecretAccessKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYzEXAMPLEKEY';
  const fakeSessionToken = 'AQoDYXdzEPT//////////wEXAMPLE';

  const fakeBody = (action: CredentialsAction) => ({
    action,
  });

  const fakePathParameters = () => ({
    dataset_id: fakeDatasetId,
  });

  const fakeRequest = (action: CredentialsAction, validated = true) => ({
    body: validated ? fakeBody(action) : stringify(fakeBody(action)),
    pathParameters: fakePathParameters(),
  });

  const fakePolicy = (action: CredentialsAction) => stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: 's3:ListBucket',
        Resource: 'arn:aws:s3:::' + fakeDatasetsBucket,
        Condition: {
          StringLike: {
            's3:prefix': fakeDatasetId + '/*',
          },
        },
      },
      {
        Effect: 'Allow',
        Action: action === 'upload' ? [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
        ] : [
          's3:GetObject',
        ],
        Resource: 'arn:aws:s3:::' + fakeDatasetsBucket + '/' + fakeDatasetId + '/*',
      },
    ],
  });

  const fakeCredentials = () => ({
    AccessKeyId: fakeAccessKeyId,
    Expiration: fakeDate,
    SecretAccessKey: fakeSecretAccessKey,
    SessionToken: fakeSessionToken,
  });

  const fakeResponse = (action: CredentialsAction) => ({
    id: fakeDatasetId,
    action,
    credentials: {
      access_key_id: fakeAccessKeyId,
      secret_access_key: fakeSecretAccessKey,
      session_token: fakeSessionToken,
    },
    expires_at: fakeDate,
    bucket: fakeDatasetsBucket,
  });

  const testMethod = (action: CredentialsAction, callback: Callback) =>
    requestCredentials(fakeRequest(action, false), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnDynamoDbUpdate: jasmine.Spy;
  let spyOnAssumeRole: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.datasetsTable] = fakeDatasetsTable;
    process.env[envNames.datasetsBucket] = fakeDatasetsBucket;
    process.env[envNames.datasetsRole] = fakeDatasetsRoleArn;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOnDynamoDbUpdate = spyOn(dynamodb, 'update')
      .and.returnValue(fakeResolve());
    spyOnAssumeRole = spyOn(sts, 'assumeRole')
      .and.returnValue(fakeResolve({
        Credentials: fakeCredentials(),
      }));
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod('upload', () => {
      expect(spyOnValidate).toHaveBeenCalledWith(
        fakeRequest('upload'), 'POST', '/datasets/{dataset_id}/credentials');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls dynamodb.update() once with correct parameters for', () => {
    it('"upload" request', (done: Callback) => {
      testMethod('upload', () => {
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledWith({
          TableName: fakeDatasetsTable,
          Key: {
            id: fakeDatasetId,
          },
          UpdateExpression: 'set #s = :u',
          ConditionExpression: '(#s = :c) or (#s = :u)',
          ExpressionAttributeNames: {
            '#s': 'status',
          },
          ExpressionAttributeValues: {
            ':c': 'created',
            ':u': 'uploading',
          },
        });
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledTimes(1);
        done();
      });
    });
    it('"download" request', (done: Callback) => {
      testMethod('download', () => {
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledWith({
          TableName: fakeDatasetsTable,
          Key: {
            id: fakeDatasetId,
          },
          ConditionExpression: '#s = :a',
          ExpressionAttributeNames: {
            '#s': 'status',
          },
          ExpressionAttributeValues: {
            ':a': 'available',
          },
        });
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  describe('calls sts.assumeRole() once with correct parameters for', () => {
    let action: CredentialsAction;
    afterEach((done: Callback) => {
      testMethod(action, () => {
        expect(spyOnAssumeRole).toHaveBeenCalledWith({
          RoleArn: fakeDatasetsRoleArn,
          RoleSessionName: fakeDatasetId,
          Policy: fakePolicy(action),
        });
        expect(spyOnAssumeRole).toHaveBeenCalledTimes(1);
        done();
      });
    });
    it('"upload" request', () => action = 'upload');
    it('"download" request', () => action = 'download');
  });

  describe('calls apig.respond() once with correct parameters for', () => {
    let action: CredentialsAction;
    afterEach((done: Callback) => {
      const callback = () => {
        expect(spyOnRespond).toHaveBeenCalledWith(
          callback, fakeRequest(action), fakeResponse(action));
        expect(ajv.validate('spec#/definitions/DatasetCredentialsResponse',
          fakeResponse(action))).toBe(true);
        expect(spyOnRespond).toHaveBeenCalledTimes(1);
        done();
      };
      testMethod(action, callback);
    });
    it('"upload" request', () => action = 'upload');
    it('"download" request', () => action = 'download');
  });

  describe('calls apig.respondWithError() immediately with an error if', () => {
    let err: Error | ApiError | jasmine.Any;
    let action: CredentialsAction;
    beforeEach(() => {
      action = 'upload';
    });

    const testError = (after: Callback, done: Callback, validated = true) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(
          callback, fakeRequest(action, validated), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(action, callback);
    };

    it('apig.validate() responds with an error', (done: Callback) => {
      err = new ApiError('validate()');
      spyOnValidate.and.returnValue(Promise.reject(err));
      testError(() => {
        expect(spyOnDynamoDbUpdate).not.toHaveBeenCalled();
      }, done, false);
    });

    it('dynamodb.update() responds with a generic error', (done: Callback) => {
      err = Error('dynamodb.update()');
      spyOnDynamoDbUpdate.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnAssumeRole).not.toHaveBeenCalled();
      }, done);
    });

    describe('dynamodb.update() responds with ConditionalCheckFailedException for', () => {
      let statuses: string;
      afterEach((done: Callback) => {
        err = new ApiError('Invalid request',
          ['Dataset status must equal ' + statuses + ' for "' + action + '" request'], 400);
        const errUpdate = new ApiError('dynamodb.update()',
          undefined, 'ConditionalCheckFailedException');
        spyOnDynamoDbUpdate.and.returnValue(fakeReject(errUpdate));
        testError(() => {
          expect(spyOnAssumeRole).not.toHaveBeenCalled();
        }, done);
      });
      it('"upload" action', () => {
        action = 'upload';
        statuses = '"created" or "uploading"';
      });
      it('"download" action', () => {
        action = 'download';
        statuses = '"available"';
      });
    });

    it('sts.assumeRole() responds with an error', (done: Callback) => {
      err = Error('sts.assumeRole()');
      spyOnAssumeRole.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('sts.assumeRole() does not return credentials', (done: Callback) => {
      err = jasmine.any(Error);
      spyOnAssumeRole.and.returnValue(fakeResolve({}));
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
