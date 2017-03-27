export { IPSetDescriptor } from 'aws-sdk/clients/waf';

import { cloudFront, s3,
         CloudFormationRequest, CloudFormationResponse, sendCloudFormationResponse } from './aws';
import { assertNonEmptyArray } from './helpers';
import { Callback } from './types';

export const getIPSetDescriptors = (event: CloudFormationRequest,
                                  context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => event.ResourceProperties['CIDRs'])
    .then((CIDRs: string[]) => {
      assertNonEmptyArray(CIDRs, 'CIDRs');
      return CIDRs.map(CIDR => ({
        Type: 'IPV4',
        Value: CIDR,
      }));
    })
    .then(descriptors => sendCloudFormationResponse(Object.assign(event, {
      Status: 'SUCCESS',
      Data: {
        Descriptors: descriptors,
      },
    } as CloudFormationResponse), null, callback))
    .catch(err => sendCloudFormationResponse(Object.assign(event, {
      Status: 'FAILED',
      Reason: err.message,
    } as CloudFormationResponse), null, callback));
};

export const createOriginAccessIdentity = (event: CloudFormationRequest,
                                        context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => cloudFront.createCloudFrontOriginAccessIdentity({
        CloudFrontOriginAccessIdentityConfig: {
          CallerReference:  event.RequestId,
          Comment: event.ResourceProperties['Comment'],
        },
      }).promise())
    .then(data => callback(null, data.CloudFrontOriginAccessIdentity))
    .catch(callback);
};

export const updateOriginAccessIdentity = (event: CloudFormationRequest,
                                         context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => cloudFront.updateCloudFrontOriginAccessIdentity({
        CloudFrontOriginAccessIdentityConfig: {
          CallerReference:  event.RequestId,
          Comment: event.ResourceProperties['Comment'],
        },
        Id: event.ResourceProperties['Id'],
      }).promise())
    .then(data => callback(null, data.CloudFrontOriginAccessIdentity))
    .catch(callback);
};

export const deleteOriginAccessIdentity = (event: CloudFormationRequest,
                                         context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => cloudFront.deleteCloudFrontOriginAccessIdentity({
        Id: event.ResourceProperties['Id'],
      }).promise())
    .then(() => callback())
    .catch(callback);
};

export const storeOriginAccessIdentity = (event: CloudFormationRequest & CloudFormationResponse,
                                        context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => s3.putObject({
        Bucket: event.ResourceProperties['Bucket'],
        Key: event.ResourceProperties['Path'],
        Body: event.Data['Id'],
      }).promise())
    .then(() => callback())
    .catch(callback);
};

export const retrieveOriginAccessIdentity = (event: { Bucket: string, Path: string },
                                           context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => s3.getObject({
        Bucket: event.Bucket,
        Key: event.Path,
      }).promise())
    .then(data => callback(null, data.Body.toString()))
    .catch(callback);
};
