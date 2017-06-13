import { CloudSearchDomain } from 'aws-sdk';
import { IndexField } from 'aws-sdk/clients/cloudsearch';
import * as stringify from 'json-stable-stringify';

import { cloudSearch } from './aws';
import { envNames } from './env'
import { Callback, Dict } from './types';

export const cloudSearchDomain = (endpoint: string) =>
  new CloudSearchDomain({ endpoint });

const getFieldSuffix = (stackName: string) => {
  switch (stackName) {
    case 'backend-beta': return 'b';
    case 'backend-release': return 'r';
    default: throw Error(`Invalid stack name: "${stackName}"`);
  }
};

export const defineIndexFields = (event: {
      SearchDomain: string;
      StackName: string;
      Fields: string;
    }, context: any, callback: Callback) => {

  Promise.resolve(event)
    .then(event => JSON.parse(event.Fields))
    .then(fields => Promise.all(fields.map((field: IndexField) =>
      defineIndexField(event.SearchDomain, field, event.StackName))))
    .then(states => callback(null,
      states.some(state => state == 'RequiresIndexDocuments') ?
        'RequiresIndexDocuments' : 'Processing'))
    .catch(callback);
};

const defineIndexField = (searchDomain: string, field: IndexField, stackName: string) => {
  return cloudSearch.defineIndexField({
      DomainName: searchDomain,
      IndexField: Object.assign(field, {
        IndexFieldName: `${field.IndexFieldName}_${getFieldSuffix(stackName)}`,
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

interface StreamRecord {
  eventSourceARN: string;
  eventName: 'INSERT' | 'MODIFY' | 'REMOVE';
  dynamodb?: {
    Keys?: {
      id: {
        S: string;
      };
    };
    NewImage?: Dict<{
      S: string;
    }>;
  };
};

export const uploadDocuments = (event: { Records: StreamRecord[] },
                                context: any, callback: Callback) => {
  Promise.resolve()
    .then(suffix => event.Records.map(recordToDoc))
    .then(docs => cloudSearchDomain(process.env[envNames.searchDocEndpoint])
      .uploadDocuments({
        contentType: 'application/json',
        documents: stringify(docs),
      }).promise())
    .then(() => callback())
    .catch(callback);
};

const sourceTableMatcher =
  /^arn:aws:dynamodb:[\w-]+:\d+:table\/((backend-(beta|release))-([^-]+)Table)/;

const recordToDoc = (record: StreamRecord) => {
  const tableName = sourceTableMatcher.exec(record.eventSourceARN);
  const stackSuffix = getFieldSuffix(tableName[2]);
  const tableSuffix = tableName[4].toLowerCase();

  if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
    const item = record.dynamodb.NewImage;
    const fields: Dict<string> = {};
    fields[`table_${stackSuffix}`] = tableSuffix;
    Object.keys(item).forEach(key => {
      if (key === 'id') return;
      const keyName = `${key}_${stackSuffix}`;
      const field: Dict<any> = item[key];
      fields[keyName] = field[Object.keys(field)[0]];
    });
    return {
      type: 'add',
      id: `${item.id.S}_${tableSuffix}_${stackSuffix}`,
      fields,
    };
  } else if (record.eventName === 'REMOVE') {
    return {
      type: 'delete',
      id: `${record.dynamodb.Keys.id.S}_${tableSuffix}_${stackSuffix}`,
    };
  } else {
    throw Error(`record.eventName "${record.eventName}" is unrecognized`);
  }
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
        SearchEndpoint: status.SearchService.Endpoint,
        State: state,
      };
    })
    .then(config => callback(null, config))
    .catch(callback);
};
