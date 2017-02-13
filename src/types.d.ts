import { AWSError } from 'aws-sdk/lib/error';

export type AWSError = AWSError;
export type Callback = (err?: Error, data?: any) => void;
export type Dict<T> = { [key: string]: T };
export type Lambda = (event: any, context: any, callback: Callback) => void;