export { IPSetDescriptor } from 'aws-sdk/clients/waf';
import { Signer } from 'aws-sdk/clients/cloudfront';
import { execSync } from 'child_process';
import * as stringify from 'json-stable-stringify';

import { makeResponse } from './apig';
import { cloudFront, s3,
         CloudFormationRequest, CloudFormationResponse, sendCloudFormationResponse } from './aws';
import { envNames } from './env';
import { Callback, Dict } from './types';
import { assertNonEmptyArray, promise } from './util';

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

export const createAndExportSigningKey = (key: {
    Bucket: string,
    Path: string,
    EncryptionKeyId: string,
    Size: number,
  }, context: any, callback: Callback) => {

  Promise.resolve(key)
    .then(key => execSync(`openssl genrsa ${key.Size}`))
    .then(keyValue => storeSigningKey(key.Bucket, key.Path, keyValue, key.EncryptionKeyId))
    .then(keyValue => execSync('openssl rsa -pubout', { input: keyValue }))
    .then(pubkey => callback(null, pubkey.toString()))
    .catch(callback);
};

const storeSigningKey = (bucket: string, path: string, value: Buffer, encryptionKeyId: string) => {
  return s3.putObject({
      Bucket: bucket,
      Key: path,
      Body: value,
      SSEKMSKeyId: encryptionKeyId,
      ServerSideEncryption: 'aws:kms',
    }).promise()
      .then(() => value);
};

export const generateSignedCookies = (event: { requestContext: { authorizer: { expiresAt: number } } },
                                    context: any, callback: Callback) => {
  if (event == null || event.requestContext == null ||
      event.requestContext.authorizer == null || event.requestContext.authorizer.expiresAt == null) {
    return callback(Error('Expected non-empty event.requestContext.authorizer.expiresAt'));
  }
  Promise.resolve()
    .then(() => cloudFront.getDistribution({Id: process.env[envNames.webDistributionId]}).promise())
    .then(data => data.Distribution.ActiveTrustedSigners.Items[0].KeyPairIds.Items[0])
    .then(keyPairId =>
      getSigningKey(process.env[envNames.webSigningKeyBucket], process.env[envNames.webSigningKeyPath])
      .then(key => new Signer(keyPairId, key)))
    .then(signer =>
      getCookieParams(signer, process.env[envNames.webDomain], event.requestContext.authorizer.expiresAt))
    .then(cookie => getCookieHeaders(cookie, process.env[envNames.webDomain]))
    .then(headers => callback(null, makeResponse(undefined, 200, headers)))
    .catch(callback);
};

const getSigningKey = (bucket: string, path: string) => {
  return s3.getObject({
      Bucket: bucket,
      Key: path,
    }).promise()
      .then(data => data.Body.toString());
};

const getCookieParams = (signer: Signer, domain: string, expiresAt: number) => {
  return signer.getSignedCookie({
    url: `https://${domain}/*`,
    expires: expiresAt,
  });
};

const getCookieHeaders = (cookieParams: Signer.CannedPolicy, domain: string) => {
  const prefix = `Domain=${domain}; Path=/*; Secure; HttpOnly;`;
  const headers: Dict<string> = {};
  headers['Set-Cookie'] = `${prefix} CloudFront-Expires=${cookieParams['CloudFront-Expires']}`;
  headers['Set-cookie'] = `${prefix} CloudFront-Key-Pair-Id=${cookieParams['CloudFront-Key-Pair-Id']}`;
  headers['set-cookie'] = `${prefix} CloudFront-Signature=${cookieParams['CloudFront-Signature']}`;
  headers['Access-Control-Allow-Origin'] = `https://${process.env[envNames.webDomain]}`;
  return headers;
};
