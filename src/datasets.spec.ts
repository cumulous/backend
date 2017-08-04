import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import * as apig from './apig';
import { ajv, ApiError, Request } from './apig';
import { dynamodb, s3, sts } from './aws';
import { create, CredentialsAction, list,
         requestCredentials, setStorage, StorageType } from './datasets';
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
const fakeDataBucket = 'fake-data-bucket';

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
    created_by: fakeMemberId,
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

    it('apig.respond() throws an error', (done: Callback) => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
      testError(() => {}, done);
    });
  });
});

describe('datasets.list()', () => {
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
        Resource: 'arn:aws:s3:::' + fakeDataBucket,
        Condition: {
          StringLike: {
            's3:prefix': fakeDatasetId + '-d/*',
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
        Resource: 'arn:aws:s3:::' + fakeDataBucket + '/' + fakeDatasetId + '-d/*',
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
    bucket: fakeDataBucket,
    prefix: fakeDatasetId + '-d/',
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
    process.env[envNames.dataBucket] = fakeDataBucket;
    process.env[envNames.roleArn] = fakeDatasetsRoleArn;

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
    let err: Error | ApiError | jasmine.ObjectContaining<any>;
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
      afterEach((done: Callback) => {
        err = jasmine.objectContaining({ code: 409 });
        const errUpdate = new ApiError('dynamodb.update()',
          undefined, 'ConditionalCheckFailedException');
        spyOnDynamoDbUpdate.and.returnValue(fakeReject(errUpdate));
        testError(() => {
          expect(spyOnAssumeRole).not.toHaveBeenCalled();
        }, done);
      });
      it('"upload" action', () => action = 'upload');
      it('"download" action', () => action = 'download');
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

    it('apig.respond() throws an error', (done: Callback) => {
      err = Error('apig.respond()');
      spyOnRespond.and.throwError(err.message);
      testError(() => {}, done);
    });
  });
});

describe('datasets.setStorage()', () => {
  const fakeContinuationToken = 'fake-continuation-token';

  const fakeBody = (type: StorageType) => ({
    type,
  });
  const fakePathParameters = () => ({
    dataset_id: fakeDatasetId,
  });
  const fakeRequest = (type: StorageType, validated = true) => ({
    body: validated ? fakeBody(type) : stringify(fakeBody(type)),
    pathParameters: fakePathParameters(),
  });
  const fakeAttributes = (status: string) => ({
    id: fakeDatasetId,
    project_id: fakeProjectId,
    status,
  });
  const fakeObjects = (index: number) => [{
    Key: fakeDatasetId + '/fake-object-A-' + index,
  }, {
    Key: fakeDatasetId + '/fake-object-B-' + index,
  }];
  const fakeResponse = (type: StorageType) => ({
    id: fakeDatasetId,
    type,
  });

  const testMethod = (type: StorageType, callback: Callback) =>
    setStorage(fakeRequest(type, false), null, callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnDynamoDbUpdate: jasmine.Spy;
  let spyOnListObjects: jasmine.Spy;
  let spyOnPutObjectTagging: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.datasetsTable] = fakeDatasetsTable;
    process.env[envNames.dataBucket] = fakeDataBucket;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOnDynamoDbUpdate = spyOn(dynamodb, 'update')
      .and.returnValue(fakeResolve({
        Attributes: fakeAttributes('uploading'),
      }));
    spyOnListObjects = spyOn(s3, 'listObjectsV2')
      .and.returnValues(fakeResolve({
        Contents: fakeObjects(1),
        NextContinuationToken: fakeContinuationToken,
        IsTruncated: true,
      }), fakeResolve({
        Contents: fakeObjects(2),
      }));
    spyOnPutObjectTagging = spyOn(s3, 'putObjectTagging')
      .and.returnValue(fakeResolve());
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod('available', () => {
      expect(spyOnValidate).toHaveBeenCalledWith(
        fakeRequest('available'), 'PUT', '/datasets/{dataset_id}/storage');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls dynamodb.update() once with correct parameters for "available" type', (done: Callback) => {
    testMethod('available', () => {
      expect(spyOnDynamoDbUpdate).toHaveBeenCalledWith({
        TableName: fakeDatasetsTable,
        Key: {
          id: fakeDatasetId,
        },
        UpdateExpression: 'set #s = :a',
        ConditionExpression: '(#s = :u) or (#s = :a)',
        ExpressionAttributeNames: {
          '#s': 'status',
        },
        ExpressionAttributeValues: {
          ':a': 'available',
          ':u': 'uploading',
        },
        ReturnValues: 'ALL_OLD',
      });
      expect(spyOnDynamoDbUpdate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls s3.listObjectsV2() multiple times with correct parameters for "available" type',
      (done: Callback) => {
    testMethod('available', () => {
      expect(spyOnListObjects).toHaveBeenCalledWith({
        Bucket: fakeDataBucket,
        Prefix: fakeDatasetId + '-d/',
        ContinuationToken: fakeContinuationToken,
      });
      expect(spyOnListObjects).toHaveBeenCalledWith({
        Bucket: fakeDataBucket,
        Prefix: fakeDatasetId + '-d/',
      });
      expect(spyOnListObjects).toHaveBeenCalledTimes(2);
      done();
    });
  });

  it('calls s3.putObjectTagging() for each object', (done: Callback) => {
    testMethod('available', () => {
      fakeObjects(1).concat(fakeObjects(2)).map(obj => {
        expect(spyOnPutObjectTagging).toHaveBeenCalledWith({
          Bucket: fakeDataBucket,
          Key: obj.Key,
          Tagging: {
            TagSet: [{
              Key: 'project_id',
              Value: fakeProjectId,
            }],
          },
        });
      });
      expect(spyOnPutObjectTagging).toHaveBeenCalledTimes(4);
      done();
    });
  });

  it('resets dataset status to "uploading" if no files were found for "available" type',
      (done: Callback) => {
    spyOnListObjects.and.returnValue(fakeResolve({ Contents: [] }));
    testMethod('available', () => {
      expect(spyOnDynamoDbUpdate).toHaveBeenCalledWith({
        TableName: fakeDatasetsTable,
        Key: {
          id: fakeDatasetId,
        },
        UpdateExpression: 'set #s = :u',
        ExpressionAttributeNames: {
          '#s': 'status',
        },
        ExpressionAttributeValues: {
          ':u': 'uploading',
        },
      });
      expect(spyOnDynamoDbUpdate).toHaveBeenCalledTimes(2);
      done();
    });
  });

  describe('calls apig.respond()', () => {
    let status: string;
    let type: StorageType;
    beforeEach(() => {
      type = 'available';
    });

    const test = (after: Callback, done: Callback) => {
      spyOnDynamoDbUpdate.and.returnValue(fakeResolve({
        Attributes: fakeAttributes(status),
      }));
      const callback = () => {
        expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(type), fakeResponse(type));
        expect(ajv.validate('spec#/definitions/DatasetStorageResponse',
          fakeResponse(type))).toBe(true);
        expect(spyOnRespond).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(type, callback);
    };

    it('once with correct parameters for "available" type if dataset status is "uploading"',
        (done: Callback) => {
      status = 'uploading';
      test(() => {}, done);
    });

    it('immediately with correct parameters for "available" type if dataset status is "available"',
        (done: Callback) => {
      status = 'available';
      test(() => {
        expect(spyOnListObjects).not.toHaveBeenCalled();
      }, done);
    });
  });

  describe('calls apig.respondWithError() immediately with an error if', () => {
    let err: Error | ApiError | jasmine.ObjectContaining<any>;
    let type: StorageType;
    beforeEach(() => {
      type = 'available';
    });

    const testError = (after: Callback, done: Callback, validated = true) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(callback, fakeRequest(type, validated), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(type, callback);
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
        expect(spyOnListObjects).not.toHaveBeenCalled();
      }, done);
    });

    it('dynamodb.update() responds with ConditionalCheckFailedException for "available" type',
        (done: Callback) => {
      const errUpdate = new ApiError('dynamodb.update()', undefined,
        'ConditionalCheckFailedException');
      err = jasmine.objectContaining({ code: 409 });
      spyOnDynamoDbUpdate.and.returnValue(fakeReject(errUpdate));
      testError(() => {
        expect(spyOnListObjects).not.toHaveBeenCalled();
      }, done);
    });

    it('type is "archived"', (done: Callback) => {
      err = jasmine.objectContaining({
        message: 'Not Implemented',
        code: 501,
      });
      type = 'archived';
      testError(() => {
        expect(spyOnListObjects).not.toHaveBeenCalled();
      }, done);
    });

    it('first s3.listObjectsV2() responds with an error', (done: Callback) => {
      err = Error('s3.listObjectsV2() 1');
      spyOnListObjects.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnPutObjectTagging).not.toHaveBeenCalled();
      }, done);
    });

    it('next s3.listObjectsV2() responds with an error', (done: Callback) => {
      err = Error('s3.listObjectsV2() 2');
      spyOnListObjects.and.returnValues(fakeResolve({
        Contents: fakeObjects(1),
        NextContinuationToken: fakeContinuationToken,
        IsTruncated: true,
      }), fakeReject(err));
      testError(() => {
        expect(spyOnPutObjectTagging).not.toHaveBeenCalled();
      }, done);
    });

    it('next s3.listObjectsV2() produces an empty list', (done: Callback) => {
      err = jasmine.objectContaining({ code: 409 });
      spyOnListObjects.and.returnValue(fakeResolve({ Contents: [] }));
      testError(() => {
        expect(spyOnPutObjectTagging).not.toHaveBeenCalled();
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
    });

    it('at least one of s3.putObjectTagging() responds with an error', (done: Callback) => {
      err = Error('s3.putObjectTagging()');
      spyOnPutObjectTagging.and.returnValues(
        fakeResolve(), fakeReject(err), fakeResolve(), fakeResolve());
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
