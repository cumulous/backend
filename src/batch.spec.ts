import { batch, CloudFormationRequestType } from './aws';
import { checkUpdateEnvironment, checkUpdateJobQueue, ComputeEnvironmentProperties,
         createComputeEnvironment, createJobQueue, deleteComputeEnvironment, deleteJobQueue,
         describeComputeEnvironment, describeJobQueue, describeJobQueueMinusEnvironment,
         JobQueueProperties, updateComputeEnvironment, updateJobQueue } from './batch';
import { fakeReject, fakeResolve, testError } from './fixtures/support';
import { Callback, Dict } from './types';

const fakeResponseURL = 'https://example.org';
const fakeStackId = 'arn:aws:cloudformation:us-east-2:012345678910:stack/stack-name/guid';
const fakeRequestId = 'fake-request-abcd-1234';
const fakeResourceType = 'fake-resource';
const fakeLogicalResourceId = 'fake-logical-id-1234';
const fakePhysicalResourceId = 'fake-physical-id-abcd';

const fakeComputeEnvironment = 'fake-compute-environment';
const fakeMinVCpus = 0;
const fakeMaxVCpus = 128;
const fakeAmiId = 'fake-ami';
const fakeKeyPair = 'fake-key-pair';
const fakeInstanceRole = 'fake-instance-role';
const fakeBidPercentage = 30;
const fakeSpotFleetRole = 'fake-spot-fleet-role';
const fakeServiceRole = 'fake-service-role';
const fakeComputeEnvironmentArn =
  'arn:aws:batch:us-east-2:012345678910:compute-environment/' + fakeComputeEnvironment;

const fakeInstanceTypes = () => ['c4.large', 'm4.large'];
const fakeSubnets = () => ['subnet-1234', 'subnet-abcd'];
const fakeSecurityGroups = () => ['sg-1234', 'sg-abcd'];
const fakeInstanceTags = () => ({ fake: 'tag' });

const fakeComputeEnvironmentProperties = (): ComputeEnvironmentProperties => ({
  type: 'MANAGED',
  computeEnvironmentName: fakeComputeEnvironment,
  computeResources: {
    type: 'SPOT',
    minvCpus: fakeMinVCpus,
    maxvCpus: fakeMaxVCpus,
    desiredvCpus: 0,
    instanceTypes: fakeInstanceTypes(),
    imageId: fakeAmiId,
    subnets: fakeSubnets(),
    securityGroupIds: fakeSecurityGroups(),
    ec2KeyPair: fakeKeyPair,
    instanceRole: fakeInstanceRole,
    tags: fakeInstanceTags(),
    bidPercentage: fakeBidPercentage,
    spotIamFleetRole: fakeSpotFleetRole,
  },
  serviceRole: fakeServiceRole,
});

const fakeCloudFormationRequest = (
    requestType: CloudFormationRequestType,
    properties: any, oldProperties: any = {}) => ({
  RequestType: requestType,
  ResponseURL: fakeResponseURL,
  StackId: fakeStackId,
  RequestId: fakeRequestId,
  ResourceType: fakeResourceType,
  LogicalResourceId: fakeLogicalResourceId,
  PhysicalResourceId: fakePhysicalResourceId,
  ResourceProperties: properties,
  OldResourceProperties: oldProperties,
});

describe('batch.createComputeEnvironment()', () => {

  const fakeRequest = (): any => {
    const properties: any = fakeComputeEnvironmentProperties();
    properties.extra = 'property';
    properties.computeResources.extra = 'property';
    return properties;
  };

  let spyOnCreateComputeEnvironment: jasmine.Spy;

  beforeEach(() => {
    spyOnCreateComputeEnvironment = spyOn(batch, 'createComputeEnvironment')
      .and.returnValue(fakeResolve({
        computeEnvironmentArn: fakeComputeEnvironmentArn,
      }));
  });

  it('calls batch.createComputeEnvironment() once with correct parameters', (done: Callback) => {
    createComputeEnvironment(fakeRequest(), null, () => {
      expect(spyOnCreateComputeEnvironment).toHaveBeenCalledWith(
        Object.assign(fakeComputeEnvironmentProperties(), {
          state: 'ENABLED',
        })
      );
      expect(spyOnCreateComputeEnvironment).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback with correct parameters on successful request', (done: Callback) => {
    createComputeEnvironment(fakeRequest(), null, (err?: Error, data?: any) => {
      expect(err).toBeFalsy();
      expect(data).toEqual(fakeComputeEnvironmentArn);
      done();
    });
  });

  it('calls callback with an error if batch.createComputeEnvironment() produces an error',
      (done: Callback) => {
    spyOnCreateComputeEnvironment.and.returnValue(fakeReject('batch.createComputeEnvironment()'));
    testError(createComputeEnvironment, fakeRequest(), done);
  });
});

describe('batch.checkUpdateEnvironment()', () => {

  let properties: any;
  beforeEach(() => {
    properties = fakeComputeEnvironmentProperties();
  });

  describe('calls callback with "RequiresReplacement" error if', () => {
    afterEach((done: Callback) => {
      const request = fakeCloudFormationRequest('Update', properties,
        fakeComputeEnvironmentProperties());
      checkUpdateEnvironment(request, null, (err: Error) => {
        expect(err).toEqual(jasmine.any(Error));
        expect(err.name).toEqual('RequiresReplacement');
        done();
      });
    });
    it('computeEnvironmentName is different', () => {
      properties.computeEnvironmentName += '-new';
    });
    it('compute environment type is different', () => {
      properties.type = 'UNMANAGED';
    });
    it('computeResources.type is different', () => {
      properties.computeResources.type = 'EC2';
    });
    it('computeResources.instanceTypes is different', () => {
      properties.computeResources.instanceTypes.push('r4.large');
    });
    it('computeResources.imageId is different', () => {
      properties.computeResources.imageId += '-new';
    });
    it('computeResources.subnets is different', () => {
      properties.computeResources.subnets.push(['subnet-5678']);
    });
    it('computeResources.securityGroupIds is different', () => {
      properties.computeResources.securityGroupIds.push('sg-5678');
    });
    it('computeResources.ec2KeyPair is different', () => {
      properties.computeResources.ec2KeyPair += '-new';
    });
    it('computeResources.instanceRole is different', () => {
      properties.computeResources.instanceRole += '-new';
    });
    it('computeResources.tags is different', () => {
      properties.computeResources.tags = {};
    });
    it('computeResources.bidPercentage is different', () => {
      properties.computeResources.bidPercentage++;
    });
    it('computeResources.spotIamFleetRole is different', () => {
      properties.computeResources.spotIamFleetRole += '-new';
    });
  });

  describe('calls callback without an error if', () => {
    afterEach((done: Callback) => {
      const request = fakeCloudFormationRequest('Update', properties,
        fakeComputeEnvironmentProperties());
      checkUpdateEnvironment(request, null, (err: Error) => {
        expect(err).toBeFalsy();
        done();
      });
    });
    it('state is different', () => {
      properties.state = 'DISABLED';
    });
    it('serviceRole is different', () => {
      properties.serviceRole += '-new';
    });
    it('computeResources.minvCpus is different', () => {
      properties.computeResources.minvCpus++;
    });
    it('computeResources.maxvCpus is different', () => {
      properties.computeResources.maxvCpus++;
    });
    it('computeResources.desiredvCpus is different', () => {
      properties.computeResources.desiredvCpus++;
    });
  });
});

describe('batch.updateComputeEnvironment()', () => {

  const fakeUpdatedProperties = (): any => ({
    state: 'ENABLED',
    computeResources: {
      minvCpus: fakeMinVCpus + 1,
      maxvCpus: fakeMaxVCpus + 1,
      desiredvCpus: 1,
    },
    serviceRole: fakeServiceRole,
  });

  const fakeRequest = (): any => {
    const properties = fakeUpdatedProperties();
    properties.computeEnvironmentName = fakeComputeEnvironment;
    properties.extra = 'property';
    properties.computeResources.extra = 'property';
    return properties;
  };

  let spyOnUpdateComputeEnvironment: jasmine.Spy;

  beforeEach(() => {
    spyOnUpdateComputeEnvironment = spyOn(batch, 'updateComputeEnvironment')
      .and.returnValue(fakeResolve({
        computeEnvironmentArn: fakeComputeEnvironmentArn,
      }));
  });

  it('calls batch.updateComputeEnvironment() once with correct parameters', (done: Callback) => {
    updateComputeEnvironment(fakeRequest(), null, () => {
      expect(spyOnUpdateComputeEnvironment).toHaveBeenCalledWith(
        Object.assign(fakeUpdatedProperties(), {
          computeEnvironment: fakeComputeEnvironment,
        })
      );
      expect(spyOnUpdateComputeEnvironment).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without with correct parameters on successful request', (done: Callback) => {
    updateComputeEnvironment(fakeRequest(), null, (err?: Error, data?: any) => {
      expect(err).toBeFalsy();
      expect(data).toEqual(fakeComputeEnvironmentArn);
      done();
    });
  });

  it('calls callback with an error if batch.updateComputeEnvironment() produces an error',
      (done: Callback) => {
    spyOnUpdateComputeEnvironment.and.returnValue(fakeReject('batch.updateComputeEnvironment()'));
    testError(updateComputeEnvironment, fakeRequest(), done);
  });
});

describe('batch.deleteComputeEnvironment()', () => {

  let spyOnDeleteComputeEnvironment: jasmine.Spy;

  beforeEach(() => {
    spyOnDeleteComputeEnvironment = spyOn(batch, 'deleteComputeEnvironment')
      .and.returnValue(fakeResolve());
  });

  it('calls batch.deleteComputeEnvironment() once with correct parameters', (done: Callback) => {
    deleteComputeEnvironment(fakeComputeEnvironment, null, () => {
      expect(spyOnDeleteComputeEnvironment).toHaveBeenCalledWith({
        computeEnvironment: fakeComputeEnvironment,
      });
      expect(spyOnDeleteComputeEnvironment).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error on successful request', (done: Callback) => {
    testError(deleteComputeEnvironment, fakeComputeEnvironment, done, false);
  });

  it('calls callback with an error if batch.deleteComputeEnvironment() produces an error',
      (done: Callback) => {
    spyOnDeleteComputeEnvironment.and.returnValue(fakeReject('batch.deleteComputeEnvironment()'));
    testError(deleteComputeEnvironment, fakeComputeEnvironment, done);
  });
});

describe('batch.describeComputeEnvironment()', () => {

  let spyOnDescribeComputeEnvironments: jasmine.Spy;

  beforeEach(() => {
    spyOnDescribeComputeEnvironments = spyOn(batch, 'describeComputeEnvironments')
      .and.returnValue(fakeResolve({
        computeEnvironments: [ fakeComputeEnvironmentProperties() ],
      }));
  });

  it('calls batch.describeComputeEnvironments() once with correct parameters', (done: Callback) => {
    describeComputeEnvironment(fakeComputeEnvironment, null, () => {
      expect(spyOnDescribeComputeEnvironments).toHaveBeenCalledWith({
        computeEnvironments: [fakeComputeEnvironment],
      });
      expect(spyOnDescribeComputeEnvironments).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls callback with correct parameters when batch.describeComputeEnvironments() returns', () => {
    let response: any;
    afterEach((done: Callback) => {
      describeComputeEnvironment(fakeComputeEnvironment, null, (err?: Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual(response);
        done();
      });
    });
    it('full response', () => {
      response = fakeComputeEnvironmentProperties();
    });
    it('"null" response', () => {
      spyOnDescribeComputeEnvironments.and.returnValue(fakeResolve({
        computeEnvironments: [ null ],
      }));
      response = {
        status: 'DELETED',
      };
    });
  });

  it('calls callback with an error if batch.describeComputeEnvironments() produces an error',
      (done: Callback) => {
    spyOnDescribeComputeEnvironments.and.returnValue(fakeReject('batch.describeComputeEnvironments()'));
    testError(describeComputeEnvironment, fakeComputeEnvironment, done);
  });
});

const fakeJobQueue = 'fake-job-queue';

const fakeJobQueueProperties = (order = 2): any => ({
  computeEnvironmentOrder: [{
    order: 1,
    computeEnvironment: fakeComputeEnvironmentArn,
  }, {
    order,
    computeEnvironment: fakeComputeEnvironmentArn + '-' + order,
  }, {
    order,
    computeEnvironment: fakeComputeEnvironmentArn + '-' + order + '-extra',
  }],
  priority: 10,
});

describe('batch.createJobQueue()', () => {

  const fakeRequest = (): any => {
    const properties: any = fakeJobQueueProperties();
    properties.jobQueueName = fakeJobQueue;
    properties.extra = 'property';
    properties.computeEnvironmentOrder.forEach(
      (entry: Dict<string|number>) => entry.extra = 'property');
    return properties;
  };

  let spyOnCreateJobQueue: jasmine.Spy;

  beforeEach(() => {
    spyOnCreateJobQueue = spyOn(batch, 'createJobQueue')
      .and.returnValue(fakeResolve());
  });

  it('calls batch.createJobQueue() once with correct parameters', (done: Callback) => {
    createJobQueue(fakeRequest(), null, () => {
      expect(spyOnCreateJobQueue).toHaveBeenCalledWith(
        Object.assign(fakeJobQueueProperties(), {
          jobQueueName: fakeJobQueue,
          state: 'ENABLED',
        })
      );
      expect(spyOnCreateJobQueue).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error on successful request', (done: Callback) => {
    testError(createJobQueue, fakeRequest(), done, false);
  });

  it('calls callback with an error if batch.createJobQueue() produces an error', (done: Callback) => {
    spyOnCreateJobQueue.and.returnValue(fakeReject('batch.createJobQueue()'));
    testError(createJobQueue, fakeRequest(), done);
  });
});

describe('batch.describeJobQueue()', () => {

  let spyOnDescribeJobQueues: jasmine.Spy;

  beforeEach(() => {
    spyOnDescribeJobQueues = spyOn(batch, 'describeJobQueues')
      .and.returnValue(fakeResolve({
        jobQueues: [ fakeJobQueueProperties() ],
      }));
  });

  it('calls batch.describeJobQueues() once with correct parameters', (done: Callback) => {
    describeJobQueue(fakeJobQueue, null, () => {
      expect(spyOnDescribeJobQueues).toHaveBeenCalledWith({
        jobQueues: [ fakeJobQueue ],
      });
      expect(spyOnDescribeJobQueues).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls callback with correct parameters when batch.describeJobQueues() returns', () => {
    let response: any;
    afterEach((done: Callback) => {
      describeJobQueue(fakeJobQueue, null, (err?: Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual(response);
        done();
      });
    });
    it('full response', () => {
      response = fakeJobQueueProperties();
    });
    it('"null" response', () => {
      spyOnDescribeJobQueues.and.returnValue(fakeResolve({
        jobQueues: [ null ],
      }));
      response = {
        status: 'DELETED',
      };
    });
  });

  it('calls callback with an error if batch.describeJobQueues() produces an error',
      (done: Callback) => {
    spyOnDescribeJobQueues.and.returnValue(fakeReject('batch.describeJobQueues()'));
    testError(describeJobQueue, fakeJobQueue, done);
  });
});

describe('batch.describeJobQueueMinusEnvironment()', () => {
  const fakeNextToken = 'fake-next-token';

  const fakeJobQueueParameters = (order: number) => {
    const properties = fakeJobQueueProperties(order);
    properties.jobQueueName = fakeJobQueue + '-' + order;
    properties.priority = order;
    return properties;
  };

  let spyOnDescribeJobQueues: jasmine.Spy;

  beforeEach(() => {
    spyOnDescribeJobQueues = spyOn(batch, 'describeJobQueues')
      .and.returnValues(fakeResolve({
        jobQueues: [ fakeJobQueueParameters(4), fakeJobQueueParameters(3) ],
        nextToken: fakeNextToken,
      }), fakeResolve({
        jobQueues: [ fakeJobQueueParameters(2), fakeJobQueueParameters(1) ],
        nextToken: fakeNextToken + 2,
      }), fakeResolve({
        jobQueues: [ fakeJobQueueParameters(6), fakeJobQueueParameters(5) ],
        nextToken: null,
      }));
  });

  it('calls batch.describeJobQueues() correct number of times with correct parameters', (done: Callback) => {
    describeJobQueueMinusEnvironment(fakeComputeEnvironment + '-2', null, () => {
      expect(spyOnDescribeJobQueues).toHaveBeenCalledWith({});
      expect(spyOnDescribeJobQueues).toHaveBeenCalledWith({
        nextToken: fakeNextToken,
      });
      expect(spyOnDescribeJobQueues).toHaveBeenCalledTimes(2);
      done();
    });
  });

  describe('calls callback with correct parameters when', () => {
    let computeEnvironment: string;
    let response: any;
    beforeEach(() => {
      computeEnvironment = fakeComputeEnvironment;
    });
    afterEach((done: Callback) => {
      describeJobQueueMinusEnvironment(computeEnvironment, null, (err?: Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual(response);
        done();
      });
    });
    describe('a matching queue is', () => {
      it('found', () => {
        computeEnvironment += '-2';
        response = fakeJobQueueParameters(2);
        const order = response.computeEnvironmentOrder;
        response.computeEnvironmentOrder = [order[0], order[2]];
      });
      it('not found', () => {
        computeEnvironment += '-10';
        response = { status: 'DELETED' };
      });
    });
    it('the list of queues was empty', () => {
      spyOnDescribeJobQueues.and.returnValue(fakeResolve({
        jobQueues: [],
      }));
      response = { status: 'DELETED' };
    });
  });

  it('calls callback with an error if batch.describeJobQueues() produces an error',
      (done: Callback) => {
    spyOnDescribeJobQueues.and.returnValue(fakeReject('batch.describeJobQueues()'));
    testError(describeJobQueueMinusEnvironment, fakeJobQueue, done);
  });
});

describe('batch.checkUpdateJobQueue()', () => {

  let oldProperties: any;
  let properties: any;
  beforeEach(() => {
    oldProperties = fakeJobQueueProperties();
    properties = fakeJobQueueProperties();
    properties.state = 'ENABLED';
  });

  it('calls callback with "RequiresReplacement" error if jobQueueName has changed', (done: Callback) => {
    properties.jobQueueName += '-new';
    const request = fakeCloudFormationRequest('Update', properties, oldProperties);
    checkUpdateJobQueue(request, null, (err: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      expect(err.name).toEqual('RequiresReplacement');
      done();
    });
  });

  describe('calls callback without an error if', () => {
    afterEach((done: Callback) => {
      const request = fakeCloudFormationRequest('Update', properties, oldProperties);
      checkUpdateJobQueue(request, null, (err: Error) => {
        expect(err).toBeFalsy();
        done();
      });
    });
    it('state is different', () => {
      properties.state = 'DISABLED';
    });
    it('priority is different', () => {
      properties.priority++;
    });
    it('computeEnvironmentOrder is different', () => {
      properties.computeEnvironmentOrder.push({
        order: 3,
        computeEnvironment: fakeComputeEnvironmentArn + '-3',
      });
    });
  });
});

describe('batch.updateJobQueue()', () => {
  const fakeJobQueueState = 'DISABLED';

  const fakeRequest = (): any => {
    const properties: any = fakeJobQueueProperties();
    properties.jobQueueName = fakeJobQueue;
    properties.state = fakeJobQueueState;
    properties.extra = 'property';
    properties.computeEnvironmentOrder.forEach(
      (entry: Dict<string|number>) => entry.extra = 'property');
    return properties;
  };

  let spyOnUpdateJobQueue: jasmine.Spy;

  beforeEach(() => {
    spyOnUpdateJobQueue = spyOn(batch, 'updateJobQueue')
      .and.returnValue(fakeResolve());
  });

  it('calls batch.updateJobQueue() once with correct parameters', (done: Callback) => {
    updateJobQueue(fakeRequest(), null, () => {
      expect(spyOnUpdateJobQueue).toHaveBeenCalledWith(
        Object.assign(fakeJobQueueProperties(), {
          jobQueue: fakeJobQueue,
          state: fakeJobQueueState,
        }),
      );
      expect(spyOnUpdateJobQueue).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error on successful request', (done: Callback) => {
    testError(updateJobQueue, fakeRequest(), done, false);
  });

  it('calls callback with an error if batch.updateJobQueue() produces an error', (done: Callback) => {
    spyOnUpdateJobQueue.and.returnValue(fakeReject('batch.updateJobQueue()'));
    testError(updateJobQueue, fakeRequest(), done);
  });
});

describe('batch.deleteJobQueue()', () => {

  let spyOnDeleteJobQueue: jasmine.Spy;

  beforeEach(() => {
    spyOnDeleteJobQueue = spyOn(batch, 'deleteJobQueue')
      .and.returnValue(fakeResolve());
  });

  it('calls batch.deleteJobQueue() once with correct parameters', (done: Callback) => {
    deleteJobQueue(fakeJobQueue, null, () => {
      expect(spyOnDeleteJobQueue).toHaveBeenCalledWith({
        jobQueue: fakeJobQueue,
      });
      expect(spyOnDeleteJobQueue).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error on successful request', (done: Callback) => {
    testError(deleteJobQueue, fakeJobQueue, done, false);
  });

  it('calls callback with an error if batch.deleteJobQueue() produces an error', (done: Callback) => {
    spyOnDeleteJobQueue.and.returnValue(fakeReject('batch.deleteJobQueue()'));
    testError(deleteJobQueue, fakeJobQueue, done);
  });
});
