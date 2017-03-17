import { apiGateway } from './aws';
import { Callback } from './types';

export const createDomainName = (event: { Name: string, Certificate: string },
                               context: any, callback: Callback) => {
  if (event == null) {
    return callback(Error('Expected non-empty event with Name and Certificate'));
  };
  apiGateway.createDomainName({
    domainName: event.Name,
    certificateName: event.Name,
    certificateArn: event.Certificate,
  }).promise()
    .then(data => callback(null, data.distributionDomainName))
    .catch(callback);
}

export const updateDomainName = (event: { Name: string, Certificate: string },
                               context: any, callback: Callback) => {
  if (event == null) {
    return callback(Error('Expected non-empty event with Name and Certificate'));
  };
  apiGateway.updateDomainName({
    domainName: event.Name,
    patchOperations: [{
      op: 'replace',
      path: '/certificateArn',
      value: event.Certificate,
    }],
  }).promise()
    .then(() => callback())
    .catch(callback);
}

export const deleteDomainName = (name: string,
                              context: any, callback: Callback) => {
  apiGateway.deleteDomainName({
    domainName: name,
  }).promise()
    .then(() => callback())
    .catch(callback);
}