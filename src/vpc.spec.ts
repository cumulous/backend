import { ec2 } from './aws';
import { fakeResolve, fakeReject, testArray, testError } from './fixtures/support';
import { Callback } from './types';
import { calculateSubnets, createSubnets, modifySubnets, describeSubnets, deleteSubnets } from './vpc';

const fakeVpcId = 'fake-vpc-1234';
const fakeAvailabilityZones = () => ['us-west-2a', 'us-west-2b', 'us-west-2c'];
const fakeSubnetRanges = () => ['10.0.64.0/20', '10.0.80.0/20', '10.0.96.0/20'];
const fakeSubnetIds = () => ['fake-subnet-1', 'fake-subnet-2', 'fake-subnet-3'];

describe('calculateSubnets()', () => {
  let fakeEvent: any;

  beforeEach(() => {
    fakeEvent = {
      VpcRange: '10.0.64.0/18',
      AvailabilityZones: fakeAvailabilityZones(),
    };
  });

  it('correctly determines subnet ranges when called with valid parameters', (done: Callback) => {
    calculateSubnets(fakeEvent, null, (err: Error, subnetRanges: string[]) => {
      expect(subnetRanges).toEqual(fakeSubnetRanges());
      done();
    });
  });

  describe('calls callback with an error if', () => {
    afterEach((done: Callback) => {
      testError(calculateSubnets, fakeEvent, done);
    });

    it('VpcRange is malformed', () => {
      fakeEvent.VpcRange = '10.0.0.0/33';
    });
    testArray(calculateSubnets, () => fakeEvent, 'AvailabilityZones');
  });

  it('does not produce an error when called with correct parameters', (done: Callback) => {
    testError(calculateSubnets, fakeEvent, done, false);
  });
});

describe('createSubnets()', () => {
  let fakeEvent: any;

  let spyOnCreateSubnet: jasmine.Spy;

  beforeEach(() => {
    fakeEvent = {
      VpcId: fakeVpcId,
      AvailabilityZones: fakeAvailabilityZones(),
      SubnetRanges: fakeSubnetRanges(),
    };

    spyOnCreateSubnet = spyOn(ec2, 'createSubnet')
      .and.returnValues.apply(null, fakeSubnetIds().map(subnetId =>
        fakeResolve({ Subnet: { SubnetId: subnetId }})));
  });

  describe('calls', () => {
    it('ec2.createSubnet() with correct parameters', (done: Callback) => {
      createSubnets(fakeEvent, null, () => {
        fakeAvailabilityZones().map((zone: string, index: number) => {
          expect(spyOnCreateSubnet).toHaveBeenCalledWith({
            VpcId: fakeVpcId,
            AvailabilityZone: zone,
            CidrBlock: fakeSubnetRanges()[index],
          });
        });
        expect(spyOnCreateSubnet).toHaveBeenCalledTimes(fakeAvailabilityZones().length);
        done();
      });
    });

    describe('callback with', () => {
      it('correct response when called with correct parameters', (done: Callback) => {
        createSubnets(fakeEvent, null, (err: Error, subnetIds: any) => {
          expect(err).toBeFalsy();
          expect(subnetIds).toEqual(fakeSubnetIds());
          done();
        });
      });

      describe('an error if', () => {
        it('ec2.createSubnet() produces an error', (done: Callback) => {
          spyOnCreateSubnet.and.returnValue(fakeReject('ec2.createSubnet()'));
          testError(createSubnets, fakeEvent, done);
        });

        testArray(createSubnets, () => fakeEvent, 'AvailabilityZones');
        testArray(createSubnets, () => fakeEvent, 'SubnetRanges');

        it('event.AvailabilityZones.length != event.SubnetRanges.length', (done: Callback) => {
          fakeEvent.SubnetRanges.pop();
          testError(createSubnets, fakeEvent, done);
        });
      });
    });
  });
});

describe('modifySubnets()', () => {
  let spyOnModifySubnetAttribute: jasmine.Spy;

  beforeEach(() => {
    spyOnModifySubnetAttribute = spyOn(ec2, 'modifySubnetAttribute')
      .and.returnValue(fakeResolve());
  });

  describe('calls', () => {
    it('ec2.modifySubnetAttribute() with correct parameters', (done: Callback) => {
      modifySubnets(fakeSubnetIds(), null, () => {
        fakeSubnetIds().map(subnetId => {
          expect(spyOnModifySubnetAttribute).toHaveBeenCalledWith({
            SubnetId: subnetId,
            MapPublicIpOnLaunch: {
              Value: true,
            },
          });
        });
        expect(spyOnModifySubnetAttribute).toHaveBeenCalledTimes(fakeSubnetIds().length);
        done();
      });
    });

    describe('callback', () => {
      describe('with an error if', () => {
        it('ec2.modifySubnetAttribute() produces an error', (done: Callback) => {
          spyOnModifySubnetAttribute.and.returnValue(
            fakeReject('ec2.modifySubnetAttribute()'));
          testError(modifySubnets, fakeSubnetIds(), done);
        });
        testArray(modifySubnets, fakeSubnetIds, 'subnetIds');
      });

      it('without an error when called with correct parameters', (done: Callback) => {
        testError(modifySubnets, fakeSubnetIds(), done, false);
      });
    });
  });
});

describe('describeSubnets()', () => {
  let spyOnDescribeSubnets: jasmine.Spy;

  beforeEach(() => {
    spyOnDescribeSubnets = spyOn(ec2, 'describeSubnets')
      .and.returnValue(fakeResolve({
        Subnets: fakeSubnetIds().map(subnetId => ({ SubnetId: subnetId })),
      }));
  });

  describe('calls', () => {
    it('ec2.describeSubnets() with correct parameters', (done: Callback) => {
      describeSubnets(fakeVpcId, null, () => {
        expect(spyOnDescribeSubnets).toHaveBeenCalledWith({
          Filters: [{
            Name: 'vpc-id',
            Values: [fakeVpcId],
          }]
        });
        done();
      });
    });

    describe('callback with', () => {
      it('correct response when called with correct parameters', (done: Callback) => {
        describeSubnets(fakeVpcId, null, (err: Error, subnetIds: any) => {
          expect(err).toBeFalsy();
          expect(subnetIds).toEqual(fakeSubnetIds());
          done();
        });
      });

      it('an error if ec2.describeSubnets() produces an error', (done: Callback) => {
        spyOnDescribeSubnets.and.returnValue(fakeReject('ec2.describeSubnets()'));
        testError(describeSubnets, fakeVpcId, done);
      });
    });
  });
});

describe('deleteSubnets()', () => {
  let spyOnDeleteSubnet: jasmine.Spy;

  beforeEach(() => {
    spyOnDeleteSubnet = spyOn(ec2, 'deleteSubnet')
      .and.returnValue(fakeResolve());
  });

  describe('calls', () => {
    it('ec2.deleteSubnet() with correct parameters', (done: Callback) => {
      deleteSubnets(fakeSubnetIds(), null, () => {
        fakeSubnetIds().map(subnetId => {
          expect(spyOnDeleteSubnet).toHaveBeenCalledWith({
            SubnetId: subnetId,
          });
        });
        expect(spyOnDeleteSubnet).toHaveBeenCalledTimes(fakeSubnetIds().length);
        done();
      });
    });

    describe('callback', () => {
      describe('with an error if', () => {
        it('ec2.deleteSubnet() produces an error', (done: Callback) => {
          spyOnDeleteSubnet.and.returnValue(fakeReject('ec2.deleteSubnet()'));
          testError(deleteSubnets, fakeSubnetIds(), done);
        });
        testArray(deleteSubnets, fakeSubnetIds, 'subnetIds');
      });

      it('without an error when called with correct parameters', (done: Callback) => {
        testError(deleteSubnets, fakeSubnetIds(), done, false);
      });
    });
  });
});