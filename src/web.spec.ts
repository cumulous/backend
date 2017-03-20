import * as aws from './aws';
import { Callback } from './types';
import { testArray } from './fixtures/support';
import { getIPSetDescriptors, IPSetDescriptor } from './web';

const fakePhysicalResourceId = 'fake-physical-resource-id-1234-abcd';

describe('getIPSetDescriptors()', () => {
  const fakeIpRange1 = '192.68.0.0/16';
  const fakeIpRange2 = '10.0.0.0/8';

  let fakeEvent: () => any;
  let fakeDescriptors: IPSetDescriptor[];

  let spyOnSendCloudFormationResponse: jasmine.Spy;

  beforeEach(() => {
    fakeEvent = () => ({
      PhysicalResourceId: fakePhysicalResourceId,
      ResourceProperties: {
        CIDRs: [fakeIpRange1, fakeIpRange2],
      },
    });
    fakeDescriptors = [{
      Type: 'IPV4',
      Value: fakeIpRange1,
    },{
      Type: 'IPV4',
      Value: fakeIpRange2,
    }];

    spyOnSendCloudFormationResponse = spyOn(aws, 'sendCloudFormationResponse')
      .and.callFake((event: any, context: any, callback: Callback) => callback());
  });

  describe('calls', () => {
    describe('aws.sendCloudFormationResponse() once with', () => {
      it('correct result if valid CIDRs were supplied', (done: Callback) => {
        const callback = () => {
          expect(spyOnSendCloudFormationResponse).toHaveBeenCalledWith(Object.assign(fakeEvent(), {
            Status: 'SUCCESS',
            Data: {
              Descriptors: fakeDescriptors,
            },
          }), null, callback);
          expect(spyOnSendCloudFormationResponse).toHaveBeenCalledTimes(1);
          done();
        };
        getIPSetDescriptors(fakeEvent(), null, callback);
      });
      describe('an error response if', () => {
        let event: any;
        let fakeResponse: any;
        beforeEach(() => {
          event = fakeEvent();
          fakeResponse = Object.assign(fakeEvent(), {
            Status: 'FAILED',
            Reason: jasmine.any(String),
          });
        });
        afterEach((done: Callback) => {
          fakeResponse.ResourceProperties = event.ResourceProperties;
          const callback = () => {
            expect(spyOnSendCloudFormationResponse).toHaveBeenCalledWith(fakeResponse, null, callback);
            expect(spyOnSendCloudFormationResponse).toHaveBeenCalledTimes(1);
            done();
          };
          getIPSetDescriptors(event, null, callback);
        });
        describe('ResourceProperties is', () => {
          it('undefined', () => event.ResourceProperties = undefined);
          it('null', () => event.ResourceProperties = null);
        });
        describe('ResourceProperties.CIDRs is', () => {
          it('undefined', () => event.ResourceProperties.CIDRs = undefined);
          it('null', () => event.ResourceProperties.CIDRs = null);
          it('empty', () => event.ResourceProperties.CIDRs = []);
          it('not an array', () => event.ResourceProperties.CIDRs = { fake: 'value' });
        });
      });
    });
  });
});