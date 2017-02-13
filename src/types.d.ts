import { AWSError } from 'aws-sdk/lib/error';

export type AWSError = AWSError;
export type Callback = (err?: Error, data?: any) => void;
export type Dict<T> = { [key: string]: T };