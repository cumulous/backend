import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import { cloudSearch } from './aws';
import { envNames } from './env';
import { fakeReject, fakeResolve } from './fixtures/support';
import * as search from './search';
import { cloudSearchDomain, defineIndexFields, describeDomain,
         indexDocuments, uploadDocuments } from './search';
import { Callback } from './types';

const fakeSearchDomain = 'search-1234';
const fakeDocEndpoint = 'doc-1234.us-east-1.cloudsearch.amazonaws.com';
const fakeSearchEndpoint = 'search-1234.us-east-1.cloudsearch.amazonaws.com';

describe('search.defineIndexFields()', () => {
  const stackName = 'backend-beta';
  const fakeTextField = 'fake-text';
  const fakeTextOptions = () => ({
    SortEnabled: false,
    HighlightEnabled: true,
  });
  const fakeLiteralField = 'fake-literal';
  const fakeLiteralOptions = () => ({
    SortEnabled: false,
    FacetEnabled: false,
  });

  const fakeEvent = () => ({
    SearchDomain: fakeSearchDomain,
    StackName: stackName,
    Fields: stringify([{
      IndexFieldName: fakeTextField,
      IndexFieldType: 'text',
      TextOptions: fakeTextOptions(),
    }, {
      IndexFieldName: fakeLiteralField,
      IndexFieldType: 'literal',
      TextOptions: fakeLiteralOptions(),
    }]),
  });

  let event: any;

  let spyOnDefineIndexField: jasmine.Spy;

  beforeEach(() => {
    event = fakeEvent();
    spyOnDefineIndexField = spyOn(cloudSearch, 'defineIndexField')
      .and.returnValues(
        fakeResolve({
          IndexField: {
            Status: {
              State: 'RequiresIndexDocuments',
            },
          },
        }),
        fakeResolve({
          IndexField: {
            Status: {
              State: 'Processing',
            },
          },
        }),
      );
  });

  const testMethod = (callback: Callback) =>
    defineIndexFields(event, null, callback);

  it('calls cloudSearch.defineIndexField() for each field with correct parameters',
      (done: Callback) => {
    testMethod(() => {
      expect(spyOnDefineIndexField).toHaveBeenCalledWith({
        DomainName: fakeSearchDomain,
        IndexField: {
          IndexFieldName: fakeTextField + '_b',
          IndexFieldType: 'text',
          TextOptions: fakeTextOptions(),
        },
      });
      expect(spyOnDefineIndexField).toHaveBeenCalledWith({
        DomainName: fakeSearchDomain,
        IndexField: {
          IndexFieldName: fakeLiteralField + '_b',
          IndexFieldType: 'literal',
          TextOptions: fakeLiteralOptions(),
        },
      });
      expect(spyOnDefineIndexField).toHaveBeenCalledTimes(2);
      done();
    });
  });

  describe('appends correct field suffix when calling cloudSearch.defineIndexField()', () => {
    let event: any;
    let fieldSuffix: string;

    beforeEach(() => event = fakeEvent());

    afterEach((done: Callback) => {
      defineIndexFields(event, null, () => {
        expect(spyOnDefineIndexField).toHaveBeenCalledWith({
          DomainName: fakeSearchDomain,
          IndexField: {
            IndexFieldName: fakeTextField + '_' + fieldSuffix,
            IndexFieldType: 'text',
            TextOptions: fakeTextOptions(),
          },
        });
        done();
      });
    });

    it('for the "backend-beta" stack', () => {
      event.StackName = 'backend-beta';
      fieldSuffix = 'b';
    });
    it('for the "backend-release" stack', () => {
      event.StackName = 'backend-release';
      fieldSuffix = 'r';
    });
  });

  describe('calls callback with an error if', () => {
    afterEach((done: Callback) => {
      testMethod((err?: Error) => {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    });
    it('event is undefined', () => event = undefined);
    it('event is null', () => event = null);
    it('event.StackName is undefined', () => event.StackName = undefined);
    it('event.StackName is null', () => event.StackName = null);
    it('event.StackName is unrecognized', () => event.StackName = 'backend');
    it('event.Fields is undefined', () => event.Fields = undefined);
    it('event.Fields is null', () => event.Fields = null);
    it('event.Fields is not an array', () => event.Fields = {});
    it('event.Fields could not be parsed', () => event.Fields = '[');
    it('cloudSearch.defineIndexField() produces an error', () => {
      spyOnDefineIndexField.and.returnValue(fakeReject('defineIndexField()'));
    });
  });

  describe('calls callback with correct parameters if', () => {
    let state: string;
    afterEach((done: Callback) => {
      testMethod((err?: Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual(state);
        done();
      });
    });
    it('at least one field returns state "RequiresIndexDocuments"', () => {
      state = 'RequiresIndexDocuments';
    });
    it('none of the fields returns state "RequiresIndexDocuments"', () => {
      state = 'Processing';
      spyOnDefineIndexField.and.returnValue(
        fakeResolve({
          IndexField: {
            Status: {
              State: 'Processing',
            },
          },
        }),
      );
    });
  });
});

describe('search.indexDocuments()', () => {

  let spyOnIndexDocuments: jasmine.Spy;

  beforeEach(() => {
    spyOnIndexDocuments = spyOn(cloudSearch, 'indexDocuments')
      .and.returnValue(fakeResolve());
  });

  const testMethod = (callback: Callback) =>
    indexDocuments(fakeSearchDomain, null, callback);

  it('calls cloudSearch.indexDocuments() once with correct parameters',
      (done: Callback) => {
    testMethod(() => {
      expect(spyOnIndexDocuments).toHaveBeenCalledWith({
        DomainName: fakeSearchDomain,
      });
      expect(spyOnIndexDocuments).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls callback with an error if cloudSearch.indexDocuments() produces an error',
      (done: Callback) => {
    spyOnIndexDocuments.and.returnValue(fakeReject('indexDocuments()'));
    testMethod((err?: Error) => {
      expect(err).toEqual(jasmine.any(Error));
      done();
    });
  });

  it('calls callback without an error for correct parameters', (done: Callback) => {
    testMethod((err?: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });
});

describe('search.cloudSearchDomain()', () => {
  it('correctly constructs CloudSearchDomain', () => {
    const instance = cloudSearchDomain(fakeDocEndpoint);
    expect(instance.endpoint.hostname).toEqual(fakeDocEndpoint);
  });
  it('throws an Error if endpoint is undefined', (done: Callback) => {
    try {
      cloudSearchDomain(undefined);
    } catch (err) {
      done();
    }
  });
});

describe('search.uploadDocuments()', () => {
  const fakeCreateDocumentId = uuid();
  const fakeUpdateDocumentId = uuid();
  const fakeDeleteDocumentId = uuid();
  const fakeDocumentValue = 'Value-1';
  const fakeDocument = () => ({
    fake_key: {
      S: fakeDocumentValue,
    },
  });
  const fakeTableName = 'Items';
  const fakeStreamArn = (stackName = 'backend-beta') =>
    'arn:aws:dynamodb:us-east-1:123456789012:table/' +
    stackName + '-' + fakeTableName + 'Table-ABCD/stream/2016-11-16T20:42:48.104';
  const fakeDeletionEvent = () => ({
    Records: [{
      eventSourceARN: fakeStreamArn(),
      eventName: 'REMOVE' as any,
      dynamodb: {
        Keys: {
          id: {
            S: fakeCreateDocumentId,
          },
        },
      },
    }],
  });

  let spyOnCloudSearchDomain: jasmine.Spy;
  let spyOnUploadDocuments: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.searchDocEndpoint] = fakeDocEndpoint;

    spyOnUploadDocuments = jasmine.createSpy('uploadDocuments')
      .and.returnValue(fakeResolve());

    spyOnCloudSearchDomain = spyOn(search, 'cloudSearchDomain')
      .and.returnValue({
        uploadDocuments: spyOnUploadDocuments,
      });
  });

  it('calls cloudSearchDomain() once with correct parameters', (done: Callback) => {
    uploadDocuments(fakeDeletionEvent(), null, () => {
      expect(spyOnCloudSearchDomain).toHaveBeenCalledWith(fakeDocEndpoint);
      expect(spyOnCloudSearchDomain).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls cloudSearchDomain().uploadDocuments() with correct parameters if ' +
           'eventSourceARN table name starts with', () => {

    let stackName: string;
    let stackSuffix: string;

    afterEach((done: Callback) => {
      const eventSourceARN = fakeStreamArn(stackName);
      uploadDocuments({
        Records: [{
          eventSourceARN,
          eventName: 'INSERT',
          dynamodb: {
            NewImage: Object.assign({
              id: {
                S: fakeCreateDocumentId,
              },
            }, fakeDocument()),
          },
        }, {
          eventSourceARN,
          eventName: 'MODIFY',
          dynamodb: {
            NewImage: Object.assign({
              id: {
                S: fakeUpdateDocumentId,
              },
            }, fakeDocument()),
          },
        }, {
          eventSourceARN,
          eventName: 'REMOVE',
          dynamodb: {
            Keys: {
              id: {
                S: fakeDeleteDocumentId,
              },
            },
          },
        }],
      }, null, () => {
        const fakeFields: any = {
          table: fakeTableName.toLowerCase(),
        };
        fakeFields[`fake_key_${stackSuffix}`] = fakeDocumentValue;
        const idSuffix = fakeFields.table + '_' + stackSuffix;
        expect(spyOnUploadDocuments).toHaveBeenCalledWith({
          contentType: 'application/json',
          documents: stringify([{
            type: 'add',
            id: fakeCreateDocumentId + '_' + idSuffix,
            fields: fakeFields,
          }, {
            type: 'add',
            id: fakeUpdateDocumentId + '_' + idSuffix,
            fields: fakeFields,
          }, {
            type: 'delete',
            id: fakeDeleteDocumentId + '_' + idSuffix,
          }]),
        });
        expect(spyOnUploadDocuments).toHaveBeenCalledTimes(1);
        done();
      });
    });
    it('"backend-beta"', () => {
      stackName = 'backend-beta';
      stackSuffix = 'b';
    });
    it('"backend-release"', () => {
      stackName = 'backend-release';
      stackSuffix = 'r';
    });
  });

  describe('calls callback with an error if', () => {
    let event: any;
    afterEach((done: Callback) => {
      uploadDocuments(event, null, (err?: Error) => {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    });
    it('event is undefined', () => event = undefined);
    it('event is null', () => event = null);
    it('event.Records is undefined', () => event = {});
    it('event.Records is null', () => event = { Records: null });
    describe('record', () => {
      let record: any;
      let eventSourceARN: string;
      beforeEach(() => eventSourceARN = undefined);
      afterEach(() => {
        event = {
          Records: [
            Object.assign({
              eventSourceARN: eventSourceARN || fakeStreamArn(),
            }, record),
          ],
        };
      });
      it('eventName is undefined', () => record = {});
      it('eventName is not recognized', () => record = {
        eventName: 'EVENT',
      });
      describe('eventName is', () => {
        const testEventType = (action: 'INSERT' | 'MODIFY') => {
          describe(`${action}, but`, () => {
            let dynamodb: any;
            beforeEach(() => {
              dynamodb = {
                NewImage: {
                  fake_key: {
                    S: fakeDocumentValue,
                  },
                },
              };
            });
            afterEach(() => {
              record = {
                eventName: action,
                dynamodb,
              };
            });
            it('eventSourceARN is not recognized', () => {
              eventSourceARN = fakeStreamArn('backend-test');
            });
            it('dynamodb is undefined', () => dynamodb = undefined);
            it('dynamodb is null', () => dynamodb = null);
            it('dynamodb.NewImage is undefined', () => delete dynamodb.NewImage);
            it('dynamodb.NewImage is null', () => dynamodb.NewImage = null);
            it('dynamodb.NewImage[key] is undefined', () => {
              delete dynamodb.NewImage.fake_key;
            });
            it('dynamodb.NewImage[key] is null', () => dynamodb = {
              NewImage: {
                fake_key: null,
              },
            });
          });
        };
        testEventType('INSERT');
        testEventType('MODIFY');

        describe('REMOVE, but', () => {
          let dynamodb: any;
          beforeEach(() => {
            dynamodb = {
              Keys: {
                id: {
                  S: fakeDeleteDocumentId,
                },
              },
            };
          });
          afterEach(() => {
            record = {
              eventName: 'REMOVE',
              dynamodb,
            };
          });
          it('eventSourceARN is not recognized', () => {
            eventSourceARN = fakeStreamArn('backend-test');
          });
          it('dynamodb is undefined', () => dynamodb = undefined);
          it('dynamodb is null', () => dynamodb = null);
          it('dynamodb.Keys is undefined', () => delete dynamodb.Keys);
          it('dynamodb.Keys is null', () => dynamodb.Keys = null);
          it('dynamodb.Keys.id is undefined', () => delete dynamodb.Keys.id);
          it('dynamodb.Keys.id is null', () => dynamodb.Keys.id = null);
        });
      });
    });
    it('cloudSearchDomain() produces an error', () => {
      event = fakeDeletionEvent();
      spyOnCloudSearchDomain.and.throwError('cloudSearchDomain()');
    });
    it('cloudSearchDomain().uploadDocuments() produces an error', () => {
      event = fakeDeletionEvent();
      spyOnUploadDocuments.and.returnValue(fakeReject('uploadDocuments()'));
    });
  });

  it('calls callback without an error for correct parameters', (done: Callback) => {
    uploadDocuments(fakeDeletionEvent(), null, (err?: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });
});

describe('search.describeDomain()', () => {
  let requiresIndexDocuments: boolean;
  let processing: boolean;

  const fakeStatus = (requiresIndexDocuments: boolean, processing: boolean) => {
    return fakeResolve({
      DomainStatusList: [{
        DocService: {
          Endpoint: fakeDocEndpoint,
        },
        SearchService: {
          Endpoint: fakeSearchEndpoint,
        },
        RequiresIndexDocuments: requiresIndexDocuments,
        Processing: processing,
      }],
    });
  };

  let spyOnDescribeDomains: jasmine.Spy;

  beforeEach(() => {
    spyOnDescribeDomains = spyOn(cloudSearch, 'describeDomains')
      .and.returnValue(fakeStatus(false, false));
  });

  const testMethod = (callback: Callback) =>
    describeDomain(fakeSearchDomain, null, callback);

  it('calls cloudSearch.describeDomains() once with correct parameters',
      (done: Callback) => {
    testMethod(() => {
      expect(spyOnDescribeDomains).toHaveBeenCalledWith({
        DomainNames: [fakeSearchDomain],
      });
      expect(spyOnDescribeDomains).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls callback with an error if', () => {
    afterEach((done: Callback) => {
      testMethod((err?: Error) => {
        expect(err).toEqual(jasmine.any(Error));
        done();
      });
    });
    it('cloudSearch.describeDomains() produces an error', () => {
      spyOnDescribeDomains.and.returnValue(fakeReject('describeDomains()'));
    });
    it('domain status list is empty', () => {
      spyOnDescribeDomains.and.returnValue(fakeResolve({
        DomainStatusList: [],
      }));
    });
  });

  describe('calls callback with correct parameters if', () => {
    let state: string;
    afterEach((done: Callback) => {
      testMethod((err?: Error, data?: any) => {
        expect(err).toBeFalsy();
        expect(data).toEqual({
          DocEndpoint: fakeDocEndpoint,
          SearchEndpoint: fakeSearchEndpoint,
          State: state,
        });
        done();
      });
    });
    it('RequiresIndexDocuments is "false", Processing is "false"', () => {
      spyOnDescribeDomains.and.returnValue(fakeStatus(false, false));
      state = 'Active';
    });
    it('RequiresIndexDocuments is "false", Processing is "true"', () => {
      spyOnDescribeDomains.and.returnValue(fakeStatus(false, true));
      state = 'Processing';
    });
    it('RequiresIndexDocuments is "true", Processing is "false"', () => {
      spyOnDescribeDomains.and.returnValue(fakeStatus(true, false));
      state = 'RequiresIndexDocuments';
    });
    it('RequiresIndexDocuments is "true", Processing is "true"', () => {
      spyOnDescribeDomains.and.returnValue(fakeStatus(true, true));
      state = 'RequiresIndexDocuments';
    });
  });
});
