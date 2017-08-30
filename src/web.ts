import * as assert from 'assert';
import { Signer } from 'aws-sdk/clients/cloudfront';
import { execSync } from 'child_process';
import * as stringify from 'json-stable-stringify';

import { Request, respond, respondWithError, validate } from './apig';
import { cloudFront, s3,
         CloudFormationRequest, CloudFormationResponse, sendCloudFormationResponse } from './aws';
import { envNames } from './env';
import { Callback, Dict } from './types';
import { assertNonEmptyArray } from './util';

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

interface KeyObject {
  Bucket: string;
  Path: string;
  EncryptionKeyId?: string;
}

interface KeyRequest {
  KeySize: number;
  PrivateKey: KeyObject;
  PublicKey: KeyObject;
}

export const createAndExportSigningKey = (request: KeyRequest, context: any, callback: Callback) => {

  Promise.resolve()
    .then(() => assert.notEqual(request.PrivateKey, null))
    .then(() => assert.notEqual(request.PublicKey, null))
    .then(() => execSync(`openssl genrsa ${request.KeySize}`))
    .then(key => storeSigningKey(request.PrivateKey, key)
      .then(() => execSync('openssl rsa -pubout', { input: key })))
    .then(pubkey => storeSigningKey(request.PublicKey, pubkey))
    .then(() => callback(null, request.PublicKey))
    .catch(callback);
};

const storeSigningKey = (key: KeyObject, value: Buffer) => {
  return s3.putObject(Object.assign({
      Bucket: key.Bucket,
      Key: key.Path,
      Body: value,
    }, key.EncryptionKeyId == null ? {} : {
      SSEKMSKeyId: key.EncryptionKeyId,
      ServerSideEncryption: 'aws:kms',
    })).promise();
};
