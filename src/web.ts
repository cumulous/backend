export { IPSetDescriptor } from 'aws-sdk/clients/waf';

import { CloudFormationRequest, CloudFormationResponse, sendCloudFormationResponse } from './aws';
import { assertNonEmptyArray } from './helpers';
import { Callback } from './types';

export const getIPSetDescriptors = (event: CloudFormationRequest,
                                  context: any, callback: Callback) => {
  Promise.resolve(event)
    .then(event => event.ResourceProperties['CIDRs'])
    .then((CIDRs: string[]) => {
      assertNonEmptyArray(CIDRs, 'CIDRs');
      return CIDRs.map(CIDR => ({
        Type: 'IPV4',
        Value: CIDR,
      }));
    })
    .then(descriptors => sendCloudFormationResponse(Object.assign(event, {
      Status: 'SUCCESS',
      Data: {
        Descriptors: descriptors,
      },
    } as CloudFormationResponse), null, callback))
    .catch(err => sendCloudFormationResponse(Object.assign(event, {
      Status: 'FAILED',
      Reason: err.message,
    } as CloudFormationResponse), null, callback));
};