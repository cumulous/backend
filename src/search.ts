import { IndexField } from 'aws-sdk/clients/cloudsearch';

import { cloudSearch } from './aws';
import { Callback } from './types';

export const defineIndexFields = (event: {
      SearchDomain: string;
      FieldSuffix: string;
      Fields: IndexField[];
    }, context: any, callback: Callback) => {

  Promise.resolve(event)
    .then(event => Promise.all(event.Fields.map(field =>
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
        IndexFieldName: `${field.IndexFieldName}-${suffix}`,
      }),
    }).promise()
      .then(data => data.IndexField.Status.State);
};
