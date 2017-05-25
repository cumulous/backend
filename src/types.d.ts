import { AWSError } from 'aws-sdk/lib/error';

export type AWSError = AWSError;
export type Callback = (err?: Error | string, data?: any) => void;
export type Dict<T> = { [key: string]: T };
export type HttpMethod = 'POST' | 'GET' | 'PATCH' | 'DELETE';
export type Lambda = (event: any, context: any, callback: Callback) => void;
