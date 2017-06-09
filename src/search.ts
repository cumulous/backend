import { IndexField } from 'aws-sdk/clients/cloudsearch';

import { cloudSearch } from './aws';
import { Callback } from './types';

export const defineIndexFields = (event: {
      SearchDomain: string;
      FieldSuffix: string;
      Fields: string;
    }, context: any, callback: Callback) => {

  Promise.resolve(event)
    .then(event => JSON.parse(event.Fields))
    .then(fields => Promise.all(fields.map((field: IndexField) =>
      defineIndexField(event.SearchDomain, field, event.FieldSuffix))))
    .then(states => callback(null,
      states.some(state => state == 'RequiresIndexDocuments') ?
        'RequiresIndexDocuments' : 'Processing'))
    .catch(callback);
};

const defineIndexField = (searchDomain: string, field: IndexField, suffix: string) => {
  return cloudSearch.defineIndexField({
      DomainName: searchDomain,
      IndexField: Object.assign(field, {
        IndexFieldName: `${field.IndexFieldName}_${suffix}`,
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

export const describeDomainState = (domain: string, context: any, callback: Callback) => {
  cloudSearch.describeDomains({
    DomainNames: [domain],
  }).promise()
    .then(data => {
      const status = data.DomainStatusList[0];
      if (status.RequiresIndexDocuments) {
        return 'RequiresIndexDocuments';
      } else if (status.Processing) {
        return 'Processing';
      } else {
        return 'Active';
      }
    })
    .then(state => callback(null, state))
    .catch(callback);
};
