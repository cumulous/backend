import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import * as apig from './apig';
import { ajv, ApiError } from './apig';
import { dynamodb, s3 } from './aws';
import { envNames } from './env';
import { create, list, update } from './projects';
import { fakeReject, fakeResolve } from './fixtures/support';
import * as search from './search';
import { AWSError, Callback } from './types';

const fakeAccountId = '123456789012';
const fakeRegion = 'us-west-1';
const fakeDomain = 'example.org';
const fakeMemberId = uuid();
const fakeProjectId = uuid();
const fakeProjectName = 'Fake project';
const fakeProjectDescription = 'This is a fake project for unit testing';
const fakeDate = new Date().toISOString();
const fakeProjectsTable = 'projects-table';
const fakeDataBucket = 'fake-data-bucket';
const fakeLogsBucketArn = 'arn:aws:s3:::fake-logs-bucket';

describe('projects.create()', () => {
  const fakeBody = () => ({
    name: fakeProjectName,
    description: fakeProjectDescription,
  });

  const fakeContext = () => ({
    accountId: fakeAccountId,
    authorizer: {
      principalId: fakeMemberId,
    },
  });

  const fakeRequest = () => ({
    body: stringify(fakeBody()),
    requestContext: fakeContext(),
  });

  const fakeItem = () => ({
    id: fakeProjectId,
    name: fakeProjectName,
    description: fakeProjectDescription,
    created_at: fakeDate,
    created_by: fakeMemberId,
    status: 'active',
  });

  let spyOnValidate: jasmine.Spy;
  let spyOnS3PutAnalyticsConfig: jasmine.Spy;
  let spyOnDynamoDbPut: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  const testMethod = (callback: Callback) =>
    create(fakeRequest(), null, callback);

  beforeEach(() => {
    process.env.AWS_REGION = fakeRegion;
    process.env[envNames.webDomain] = fakeDomain;
    process.env[envNames.projectsTable] = fakeProjectsTable;
    process.env[envNames.dataBucket] = fakeDataBucket;
    process.env[envNames.logsBucket] = fakeLogsBucketArn;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOn(uuid, 'v4').and.returnValue(fakeProjectId);
    spyOnS3PutAnalyticsConfig = spyOn(s3, 'putBucketAnalyticsConfiguration')
      .and.returnValue(fakeResolve());
    spyOnDynamoDbPut = spyOn(dynamodb, 'put')
      .and.returnValue(fakeResolve());
    spyOn(Date.prototype, 'toISOString').and.returnValue(fakeDate);
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });


  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    spyOnValidate.and.returnValue(Promise.resolve());
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'POST', '/projects');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls s3.putBucketAnalyticsConfiguration() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnS3PutAnalyticsConfig).toHaveBeenCalledWith({
        Id: fakeProjectId,
        Bucket: fakeDataBucket,
        AnalyticsConfiguration: {
          Id: fakeProjectId,
          Filter: {
            Tag: {
              Key: 'ProjectId',
              Value: fakeProjectId,
            },
          },
          StorageClassAnalysis: {
            DataExport: {
              OutputSchemaVersion: 'V_1',
              Destination: {
                S3BucketDestination: {
                  Bucket: fakeLogsBucketArn,
                  BucketAccountId: fakeAccountId,
                  Prefix: fakeDataBucket + '/',
                  Format: 'CSV',
                },
              },
            },
          },
        },
      });
      expect(spyOnS3PutAnalyticsConfig).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls dynamodb.put() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnDynamoDbPut).toHaveBeenCalledWith({
        TableName: fakeProjectsTable,
        Item: fakeItem(),
        ConditionExpression: 'attribute_not_exists(id)',
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
      expect(ajv.validate('spec#/definitions/Project', fakeItem())).toBe(true);
      expect(spyOnRespond).toHaveBeenCalledTimes(1);
      done();
    };
    testMethod(callback);
  });

  describe('calls apig.respondWithError() immediately with the error if', () => {
    let err: Error | ApiError;

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
        expect(spyOnS3PutAnalyticsConfig).not.toHaveBeenCalled();
      }, done, false);
    });

    it('s3.putBucketAnalyticsConfiguration() responds with an error', (done: Callback) => {
      err = Error('s3.putBucketAnalyticsConfiguration()');
      spyOnS3PutAnalyticsConfig.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnDynamoDbPut).not.toHaveBeenCalled();
      }, done);
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

describe('projects.list()', () => {
  const fakeRequest = () => ({
    queryStringParameters: {
      status: 'active',
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
        fakeRequest(), '/projects', ['status'], callback);
      expect(spyOnSearchQuery).toHaveBeenCalledTimes(1);
      done();
    };
    list(fakeRequest(), null, callback);
  });
});

describe('projects.update()', () => {
  const fakeBody = (name: string, description: string) => {
    const body = { name, description };
    if (name === null) {
      delete body.name;
    }
    if (description === null) {
      delete body.description;
    }
    return body;
  };

  const fakeRequest = (name: string, description: string, validated = true) => {
    const body = fakeBody(name, description);
    return {
      body: validated ? body : stringify(body),
      pathParameters: {
        project_id: fakeProjectId,
      },
    };
  };

  const fakeProject = () => ({
    id: fakeProjectId,
    name: fakeProjectName,
    description: fakeProjectDescription,
    created_at: fakeDate,
    created_by: fakeMemberId,
    status: 'active',
  });

  let spyOnValidate: jasmine.Spy;
  let spyOnDynamoDbUpdate: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  const testMethod = (callback: Callback, name = fakeProjectName, description = fakeProjectDescription) =>
    update(fakeRequest(name, description, false), null, callback);

  beforeEach(() => {
    process.env[envNames.projectsTable] = fakeProjectsTable;

    spyOnValidate = spyOn(apig, 'validate')
      .and.callThrough();
    spyOnDynamoDbUpdate = spyOn(dynamodb, 'update')
      .and.returnValue(fakeResolve({ Attributes: fakeProject() }));
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback());
  });


  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    spyOnValidate.and.returnValue(Promise.resolve());
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(
        fakeRequest(fakeProjectName, fakeProjectDescription, false), 'PATCH', '/projects/{project_id}');
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      expect(ajv.errors).toBeFalsy();
      done();
    });
  });

  describe('calls dynamodb.update() once with correct parameters if', () => {
    it('both "name" and "description" are specified', (done: Callback) => {
      testMethod(() => {
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledWith({
          TableName: fakeProjectsTable,
          Key: {
            id: fakeProjectId,
          },
          UpdateExpression: 'set #n = :n, #d = :d',
          ExpressionAttributeNames: {
            '#n': 'name',
            '#d': 'description',
          },
          ExpressionAttributeValues: {
            ':n': fakeProjectName,
            ':d': fakeProjectDescription,
          },
          ReturnValues: 'ALL_NEW',
        });
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledTimes(1);
        done();
      });
    });
    it('only "name" is specified', (done: Callback) => {
      testMethod(() => {
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledWith({
          TableName: fakeProjectsTable,
          Key: {
            id: fakeProjectId,
          },
          UpdateExpression: 'set #n = :n',
          ExpressionAttributeNames: {
            '#n': 'name',
          },
          ExpressionAttributeValues: {
            ':n': fakeProjectName,
          },
          ReturnValues: 'ALL_NEW',
        });
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledTimes(1);
        done();
      }, fakeProjectName, null);
    });
    it('only "description" is specified', (done: Callback) => {
      testMethod(() => {
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledWith({
          TableName: fakeProjectsTable,
          Key: {
            id: fakeProjectId,
          },
          UpdateExpression: 'set #d = :d',
          ExpressionAttributeNames: {
            '#d': 'description',
          },
          ExpressionAttributeValues: {
            ':d': fakeProjectDescription,
          },
          ReturnValues: 'ALL_NEW',
        });
        expect(spyOnDynamoDbUpdate).toHaveBeenCalledTimes(1);
        done();
      }, null, fakeProjectDescription);
    });
  });

  it('calls apig.respond() once with correct parameters', (done: Callback) => {
    const callback = () => {
      expect(spyOnRespond).toHaveBeenCalledWith(callback,
        fakeRequest(fakeProjectName, fakeProjectDescription), fakeProject());
      expect(ajv.validate('spec#/definitions/Project', fakeProject())).toBe(true);
      expect(spyOnRespond).toHaveBeenCalledTimes(1);
      done();
    };
    testMethod(callback);
  });

  describe('calls apig.respondWithError() immediately with the error if', () => {
    let err: Error | ApiError | jasmine.ObjectContaining<{ code: number }>;
    let name: string;
    let description: string;

    const testError = (after: Callback, done: Callback, validated = true) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(callback,
          fakeRequest(name, description, validated), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(callback, name, description);
    };

    beforeEach(() => {
      name = fakeProjectName;
      description = fakeProjectDescription;
    });

    it('apig.validate() responds with an error', (done: Callback) => {
      err = new ApiError('validate()');
      spyOnValidate.and.returnValue(Promise.reject(err));
      testError(() => {
        expect(spyOnDynamoDbUpdate).not.toHaveBeenCalled();
      }, done, false);
    });

    it('request is empty', (done: Callback) => {
      err = jasmine.objectContaining({ code: 400 });
      name = null;
      description = null;
      testError(() => {
        expect(spyOnDynamoDbUpdate).not.toHaveBeenCalled();
      }, done);
    });

    it('dynamodb.update() responds with an error', (done: Callback) => {
      err = Error('dynamodb.update()');
      spyOnDynamoDbUpdate.and.returnValue(fakeReject(err));
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
