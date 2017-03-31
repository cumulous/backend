export { IPSetDescriptor } from 'aws-sdk/clients/waf';
import * as stringify from 'json-stable-stringify';

import { cloudFront, s3,
         CloudFormationRequest, CloudFormationResponse, sendCloudFormationResponse } from './aws';
import { Callback } from './types';
import { assertNonEmptyArray } from './util';

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
          CallerReference:  event.LogicalResourceId,
          Comment: event.ResourceProperties['Comment'],
        },
      }).promise())
    .then(data => callback(null, {
      Id: data.CloudFrontOriginAccessIdentity.Id,
      S3CanonicalUserId: data.CloudFrontOriginAccessIdentity.S3CanonicalUserId,
      ETag: data.ETag,
    }))
    .catch(callback);
};

export const deleteOriginAccessIdentity = (event: { Id: string, ETag: string },
                                         context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => cloudFront.deleteCloudFrontOriginAccessIdentity({
        Id: event.Id,
        IfMatch: event.ETag,
      }).promise())
    .then(() => callback())
    .catch(callback);
};

export const updateOriginAccessIdentity = (event: CloudFormationRequest & CloudFormationResponse,
                                         context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => cloudFront.updateCloudFrontOriginAccessIdentity({
        CloudFrontOriginAccessIdentityConfig: {
          CallerReference:  event.LogicalResourceId,
          Comment: event.ResourceProperties['Comment'],
        },
        Id: event.Data['Id'],
        IfMatch: event.Data['ETag'],
      }).promise())
    .then(data => callback(null, {
      Id: data.CloudFrontOriginAccessIdentity.Id,
      S3CanonicalUserId: data.CloudFrontOriginAccessIdentity.S3CanonicalUserId,
      ETag: data.ETag,
    }))
    .catch(callback);
};

export const storeOriginAccessIdentity = (event: CloudFormationRequest & CloudFormationResponse,
                                        context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => s3.putObject({
        Bucket: event.ResourceProperties['Bucket'],
        Key: event.ResourceProperties['Path'],
        Body: stringify({
          Id: event.Data.Id,
          ETag: event.Data.ETag,
        }),
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
    .then(data => {
      const config = data.Body.toString();
      callback(null, JSON.parse(config));
    })
    .catch(callback);
};
