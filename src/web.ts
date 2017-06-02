export { IPSetDescriptor } from 'aws-sdk/clients/waf';
import { Signer } from 'aws-sdk/clients/cloudfront';
import { execSync } from 'child_process';
import * as stringify from 'json-stable-stringify';

import { Request, respond, respondWithError, validate } from './apig';
import { cloudFront, s3,
         CloudFormationRequest, CloudFormationResponse, sendCloudFormationResponse } from './aws';
import { envNames } from './env';
import { Callback, Dict } from './types';
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
          CallerReference: event.StackId,
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
          CallerReference: event.StackId,
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

export const generateSignedCookies = (event: Request, context: any, callback: Callback) => {
  validate(event, 'GET', '/weblogin')
    .then(() => {
      if (!Number(event.requestContext.authorizer.expiresAt)) {
        throw Error('Expected non-empty event.requestContext.authorizer.expiresAt');
      }
    })
    .then(() => cloudFront.getDistribution({Id: process.env[envNames.webDistributionId]}).promise())
    .then(data => data.Distribution.ActiveTrustedSigners.Items[0].KeyPairIds.Items[0])
    .then(keyPairId =>
      getSigningKey(process.env[envNames.webSigningKeyBucket], process.env[envNames.webSigningKeyPath])
      .then(key => new Signer(keyPairId, key)))
    .then(signer =>
      getCookieParams(signer, process.env[envNames.webDomain], event.requestContext.authorizer.expiresAt))
    .then(cookie => getCookieHeaders(cookie, process.env[envNames.webDomain]))
    .then(headers => respond(callback, event, undefined, 200, headers))
    .catch(err => respondWithError(callback, event, err));
};

const getSigningKey = (bucket: string, path: string) => {
  return s3.getObject({
      Bucket: bucket,
      Key: path,
    }).promise()
      .then(data => data.Body.toString());
};

const getCookieParams = (signer: Signer, domain: string, expiresAt: number | string) => {
  return signer.getSignedCookie({
    policy: stringify({
      Statement: [{
        Resource: `https://${domain}/*`,
        Condition: {
          DateLessThan: { 'AWS:EpochTime': Number(expiresAt) },
        },
      }],
    }),
  });
};

const getCookieHeaders = (cookieParams: Signer.CustomPolicy, domain: string) => {
  const headers: Dict<string> = {};
  const getCookie = (name: string) =>
    `${name}=${(cookieParams as any)[name]}; Domain=${domain}; Path=/; Secure; HttpOnly`;
  headers['Set-Cookie'] = getCookie('CloudFront-Policy');
  headers['Set-cookie'] = getCookie('CloudFront-Key-Pair-Id');
  headers['set-cookie'] = getCookie('CloudFront-Signature');
  return headers;
};
