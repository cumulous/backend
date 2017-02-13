import { EC2, S3, StepFunctions } from 'aws-sdk';

export const ec2 = new EC2();
export const s3 = new S3({ signatureVersion: 'v4' });
export const stepFunctions = new StepFunctions();