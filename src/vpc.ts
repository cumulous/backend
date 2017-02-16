import { Netmask } from 'netmask';

import { ec2 } from './aws';
import { envNames } from './env';
import { testEmpty } from './helpers';
import { Callback } from './types';

export const calculateSubnets = (event: any, context: any, callback: Callback) => {
  try {
    testEmpty(event.AvailabilityZones, 'AvailabilityZones');

    const vpc = new Netmask(event.VpcRange);
    const subnetBits = countBits(event.AvailabilityZones.length);

    let subnet = new Netmask(vpc.base, (vpc.bitmask + subnetBits).toString());
    callback(null, event.AvailabilityZones.map(() => {
      const subnetString = subnet.toString();
      subnet = subnet.next();
      return subnetString;
    }));
  } catch (err) {
    callback(err);
  }
};

const countBits = (n: number) => {
  let bits = 0;
  for ( let i = 1; i < n; i <<= 1, bits++ );
  return bits;
};

export const createSubnets = (event: { VpcId: string, AvailabilityZones: string[], SubnetRanges: string[] },
                            context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => {
      testEmpty(event.AvailabilityZones, 'AvailabilityZones');
      testEmpty(event.SubnetRanges, 'SubnetRanges');
      if (event.AvailabilityZones.length !== event.SubnetRanges.length) {
        throw Error('Expected AvailabilityZones[] and SubnetRanges[] of equal length');
      }
    })
    .then(() => Promise.all(event.AvailabilityZones
      .map((zone: string, index: number) =>
        createSubnet(event.VpcId, zone, event.SubnetRanges[index]))))
    .then(subnetIds => callback(null, subnetIds))
    .catch(callback);
};

const createSubnet = (vpcId: string, zone: string, subnetRange: string) => {
  return ec2.createSubnet({
      VpcId: vpcId,
      AvailabilityZone: zone,
      CidrBlock: subnetRange,
    }).promise()
      .then(data => data.Subnet.SubnetId);
};

const handleSubnets = (subnetIds: string[], handler: (subnetId: string) => void, callback: Callback) => {
  Promise.resolve(subnetIds)
    .then(subnetIds => testEmpty(subnetIds, 'subnetIds'))
    .then(() => Promise.all(subnetIds.map(handler)))
    .then(() => callback())
    .catch(callback);
};

export const modifySubnets = (subnetIds: string[], context: any, callback: Callback) => {
  handleSubnets(subnetIds, modifySubnet, callback);
};

const modifySubnet = (subnetId: string) => {
  return ec2.modifySubnetAttribute({
      SubnetId: subnetId,
      MapPublicIpOnLaunch: { Value: true },
    }).promise();
};

export const routeSubnets = (subnetIds: string[], context: any, callback: Callback) => {
  handleSubnets(subnetIds, routeSubnet, callback);
};

const routeSubnet = (subnetId: string) => {
  return ec2.associateRouteTable({
      SubnetId: subnetId,
      RouteTableId: process.env[envNames.routeTable],
    }).promise();
};

export const describeSubnets = (vpcId: string, context: any, callback: Callback) => {
  ec2.describeSubnets({
    Filters: [{
      Name: 'vpc-id',
      Values: [vpcId],
    }],
  }).promise()
    .then(data => callback(null, data.Subnets.map(subnet => subnet.SubnetId)))
    .catch(callback);
};

export const deleteSubnets = (subnetIds: string[], context: any, callback: Callback) => {
  handleSubnets(subnetIds, deleteSubnet, callback);
};

const deleteSubnet = (subnetId: string) => {
  return ec2.deleteSubnet({
      SubnetId: subnetId,
    }).promise();
};