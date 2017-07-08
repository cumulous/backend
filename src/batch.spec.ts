import { CreateComputeEnvironmentRequest, DeleteComputeEnvironmentRequest,
         UpdateComputeEnvironmentRequest } from 'aws-sdk/clients/batch';

import { batch, CloudFormationRequestType } from './aws';
import { checkUpdateEnvironment, createComputeEnvironment, deleteComputeEnvironment,
         describeComputeEnvironment, updateComputeEnvironment } from './batch';
import { fakeReject, fakeResolve, testError } from './fixtures/support';
import { Callback } from './types';

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

const fakeInstanceTypes = () => ['c4.large', 'm4.large'];
const fakeSubnets = () => ['subnet-1234', 'subnet-abcd'];
const fakeSecurityGroups = () => ['sg-1234', 'sg-abcd'];
const fakeInstanceTags = () => ({ fake: 'tag' });

const fakeComputeEnvironmentProperties = (): CreateComputeEnvironmentRequest => ({
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
  state: 'ENABLED',
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
      .and.returnValue(fakeResolve());
  });

  it('calls batch.createComputeEnvironment() once with correct parameters', (done: Callback) => {
    createComputeEnvironment(fakeRequest(), null, () => {
      expect(spyOnCreateComputeEnvironment).toHaveBeenCalledWith(fakeComputeEnvironmentProperties());
      expect(spyOnCreateComputeEnvironment).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback without an error on successful request', (done: Callback) => {
    testError(createComputeEnvironment, fakeRequest(), done, false);
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
        expect(err).toBeTruthy();
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
    properties.computeEnvironmentName = fakeComputeEnvironment,
    properties.extra = 'property';
    properties.computeResources.extra = 'property';
    return properties;
  };

  let spyOnUpdateComputeEnvironment: jasmine.Spy;

  beforeEach(() => {
    spyOnUpdateComputeEnvironment = spyOn(batch, 'updateComputeEnvironment')
      .and.returnValue(fakeResolve());
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

  it('calls callback without an error on successful request', (done: Callback) => {
    testError(updateComputeEnvironment, fakeRequest(), done, false);
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

  it('calls callback with correct parameters on successful request', (done: Callback) => {
    describeComputeEnvironment(fakeComputeEnvironment, null, (err?: Error, data?: any) => {
      expect(err).toBeFalsy();
      expect(data).toEqual(fakeComputeEnvironmentProperties());
      done();
    });
  });

  it('calls callback with an error if batch.describeComputeEnvironments() produces an error',
      (done: Callback) => {
    spyOnDescribeComputeEnvironments.and.returnValue(fakeReject('batch.describeComputeEnvironments()'));
    testError(describeComputeEnvironment, fakeComputeEnvironment, done);
  });
});
