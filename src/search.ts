import { CloudSearchDomain, DynamoDB, DynamoDBStreams } from 'aws-sdk';
import { IndexField } from 'aws-sdk/clients/cloudsearch';
import * as stringify from 'json-stable-stringify';

import { Request, respond, respondWithError, validate } from './apig';
import { cloudSearch } from './aws';
import { envNames } from './env'
import { log } from './log';
import { Callback, Dict } from './types';

export const cloudSearchDomain = (endpoint: string) =>
  new CloudSearchDomain({ endpoint });

const stackSuffix = () => {
  const key = envNames.searchStackSuffix;
  const value = process.env[key];
  if (value) {
    return value;
  } else {
    throw Error(`${key} is not set`);
  }
};

export const defineIndexFields = (event: {
      SearchDomain: string;
      Fields: string;
    }, context: any, callback: Callback) => {

  Promise.resolve(event)
    .then(event => JSON.parse(event.Fields))
    .then(fields => Promise.all(fields.map((field: IndexField) =>
      defineIndexField(event.SearchDomain, field))))
    .then(states => callback(null,
      states.some(state => state == 'RequiresIndexDocuments') ?
        'RequiresIndexDocuments' : 'Processing'))
    .catch(callback);
};

const defineIndexField = (searchDomain: string, field: IndexField) => {
  return cloudSearch.defineIndexField({
      DomainName: searchDomain,
      IndexField: Object.assign(field, {
        IndexFieldName: `${field.IndexFieldName}_${stackSuffix()}`,
      }),
    }).promise()
      .then(data => data.IndexField.Status.State);
};

export const indexDocuments = (domain: string, context: any, callback: Callback) => {
  cloudSearch.indexDocuments({
    DomainName: domain,
  }).promise()
    .then(() => callback())
    .catch(callback);
};

interface StreamRecord extends DynamoDBStreams.Record {
  eventSourceARN: string;
};

export const uploadDocuments = (event: { Records: StreamRecord[] },
                                context: any, callback: Callback) => {
  Promise.resolve()
    .then(() => log.debug(`Batch upload: ${event.Records.length} items`))
    .then(() => event.Records.map(recordToDoc))
    .then(docs => cloudSearchDomain(process.env[envNames.searchDocEndpoint])
      .uploadDocuments({
        contentType: 'application/json',
        documents: stringify(docs),
      }).promise())
    .then(() => callback())
    .catch(callback);
};

const sourceTableMatcher =
  /^arn:aws:dynamodb:[\w-]+:\d+:table\/[^/]+-([^-]+)Table-[^/]+/;

const recordToDoc = (record: StreamRecord) => {
  const table = sourceTableMatcher.exec(record.eventSourceARN)[1].toLowerCase();

  if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
    const item = record.dynamodb.NewImage;
    const fields: Dict<string> = {};
    fields[`table_${stackSuffix()}`] = table;
    Object.keys(item).forEach(key => {
      if (key === 'id') return;
      fields[`${key}_${stackSuffix()}`] = DynamoDB.Converter.output(item[key]);
    });
    return {
      type: 'add',
      id: `${item.id.S}_${table}_${stackSuffix()}`,
      fields,
    };
  } else if (record.eventName === 'REMOVE') {
    return {
      type: 'delete',
      id: `${record.dynamodb.Keys.id.S}_${table}_${stackSuffix()}`,
    };
  } else {
    throw Error(`record.eventName "${record.eventName}" is unrecognized`);
  }
};

export const query = (request: Request, resource: string,
                      terms: string[] = [], callback: Callback) => {

  validate(request, 'GET', resource)
    .then(() => request.queryStringParameters)
    .then(query => cloudSearchDomain(process.env[envNames.searchQueryEndpoint])
      .search({
        queryParser: 'structured',
        query: buildQuery(query, terms, resource),
        sort: buildSort(query.sort),
        start: Number(query.offset),
        size: Number(query.limit),
      }).promise()
      .then(data => respond(callback, request, buildQueryResponse(
        data.hits.hit, Number(query.offset), Number(query.limit)))))
    .catch(err => respondWithError(callback, request, err));
};

const buildQuery = (query: Dict<string>, terms: string[], resource: string) => {
  return '' +
    '(and ' +
      `table_${stackSuffix()}:'${resource.substring(1)}'` +
      terms.map(term =>
        query[term] ? ` ${term}_${stackSuffix()}:'${query[term]}'` : ''
      ).join('') +
    ')';
};

const buildSort = (sort: string) => {
  return sort.replace(/:/g, `_${stackSuffix()} `);
};

interface QueryResponse {
  offset: number;
  items: Dict<string|string[]>[];
  next?: number;
};

const buildQueryResponse = (hits: any[], offset: number, limit: number) => {
  const keySuffix = new RegExp(`_${stackSuffix()}$`);
  const response: QueryResponse = {
    offset,
    items: hits.map(hit => {
      const result: Dict<string|string[]> = {
        id: hit.id.replace(/_.+$/,''),
      };
      Object.keys(hit.fields).forEach(key => {
        const fields = hit.fields[key];
        const keyName = key.replace(keySuffix, '');
        result[keyName] = fields.length > 1 ? fields : fields[0];
      });
      return result;
    }),
  };
  if (hits.length === limit) {
    response.next = offset + limit;
  };
  return response;
};

export const describeDomain = (domain: string, context: any, callback: Callback) => {
  cloudSearch.describeDomains({
    DomainNames: [domain],
  }).promise()
    .then(data => {
      const status = data.DomainStatusList[0];
      let state: string;
      if (status.RequiresIndexDocuments) {
        state = 'RequiresIndexDocuments';
      } else if (status.Processing) {
        state = 'Processing';
      } else {
        state = 'Active';
      }
      return {
        DocEndpoint: status.DocService.Endpoint,
        QueryEndpoint: status.SearchService.Endpoint,
        State: state,
      };
    })
    .then(config => callback(null, config))
    .catch(callback);
};
