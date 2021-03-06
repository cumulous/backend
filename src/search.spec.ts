import * as stringify from 'json-stable-stringify';
import * as uuid from 'uuid';

import * as apig from './apig';
import { ApiError } from './apig';
import { cloudSearch } from './aws';
import { envNames } from './env';
import { fakeReject, fakeResolve } from './fixtures/support';
import * as search from './search';
import { cloudSearchDomain, defineIndexFields, describeDomain,
         indexDocuments, query, uploadDocuments } from './search';
import { Callback, Dict } from './types';

const fakeSearchDomain = 'search-1234';
const fakeDocEndpoint = 'doc-1234.us-east-1.cloudsearch.amazonaws.com';
const fakeQueryEndpoint = 'search-1234.us-east-1.cloudsearch.amazonaws.com';

describe('search.defineIndexFields()', () => {
  const fakeStackSuffix = 'd';
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

    process.env[envNames.searchStackSuffix] = fakeStackSuffix;

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
          IndexFieldName: fakeTextField + '_' + fakeStackSuffix,
          IndexFieldType: 'text',
          TextOptions: fakeTextOptions(),
        },
      });
      expect(spyOnDefineIndexField).toHaveBeenCalledWith({
        DomainName: fakeSearchDomain,
        IndexField: {
          IndexFieldName: fakeLiteralField + '_' + fakeStackSuffix,
          IndexFieldType: 'literal',
          TextOptions: fakeLiteralOptions(),
        },
      });
      expect(spyOnDefineIndexField).toHaveBeenCalledTimes(2);
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
    it('event is undefined', () => event = undefined);
    it('event is null', () => event = null);
    it(`${envNames.searchStackSuffix} is undefined`, () => {
      delete process.env[envNames.searchStackSuffix];
    });
    it(`${envNames.searchStackSuffix} is empty`, () => {
      process.env[envNames.searchStackSuffix] = '';
    });
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
  const fakeStackSuffix = 'u';
  const fakeCreateDocumentId = uuid();
  const fakeUpdateDocumentId = uuid();
  const fakeDeleteDocumentId = uuid();
  const fakeDocumentValue = 'Value-1';
  const fakeTableName = 'Items';

  const fakeStreamArn = (tableName = fakeTableName + 'Table-ABCD') =>
    'arn:aws:dynamodb:us-east-1:123456789012:table/' +
    'fake-stack-' + tableName + '/stream/2016-11-16T20:42:48.104';

  const fakeDocument = () => ({
    fake_key: {
      S: fakeDocumentValue,
    },
    fake_map: {
      M: {
        fake_key: {S: fakeDocumentValue}
      },
    },
    fake_list: {
      L: [{
        M: {
          fake_key: {S: fakeDocumentValue}
        },
      }],
    },
    fake_list_string: {
      L: [{
        S: fakeDocumentValue,
      }],
    },
  });

  const fakeRecord = (eventName: string, id: string) => ({
    eventSourceARN: fakeStreamArn(),
    eventName,
    dynamodb: Object.assign({
      Keys: {
        id: {
          S: id,
        },
      },
    }, eventName === 'REMOVE' ? {} : {
      NewImage: Object.assign({
        id: {
          S: id,
        },
      }, fakeDocument()),
    }),
  });

  const fakeEvent = () => ({
    Records: [
      fakeRecord('INSERT', fakeCreateDocumentId),
      fakeRecord('INSERT', fakeUpdateDocumentId),
      fakeRecord('MODIFY', fakeUpdateDocumentId),
      fakeRecord('INSERT', fakeDeleteDocumentId),
      fakeRecord('MODIFY', fakeDeleteDocumentId),
      fakeRecord('REMOVE', fakeDeleteDocumentId),
    ],
  });

  let spyOnCloudSearchDomain: jasmine.Spy;
  let spyOnUploadDocuments: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.searchStackSuffix] = fakeStackSuffix;
    process.env[envNames.searchDocEndpoint] = fakeDocEndpoint;

    spyOnUploadDocuments = jasmine.createSpy('uploadDocuments')
      .and.returnValue(fakeResolve());

    spyOnCloudSearchDomain = spyOn(search, 'cloudSearchDomain')
      .and.returnValue({
        uploadDocuments: spyOnUploadDocuments,
      });
  });

  it('calls cloudSearchDomain() once with correct parameters', (done: Callback) => {
    uploadDocuments(fakeEvent(), null, () => {
      expect(spyOnCloudSearchDomain).toHaveBeenCalledWith(fakeDocEndpoint);
      expect(spyOnCloudSearchDomain).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls cloudSearchDomain().uploadDocuments() with correct parameters',
      (done: Callback) => {
    uploadDocuments(fakeEvent(), null, (err: Error) => {
      const idSuffix = fakeTableName.toLowerCase() + '_' + fakeStackSuffix;
      const fakeFields: Dict<any> = {};

      fakeFields[`fake_key_${fakeStackSuffix}`] = fakeDocumentValue;
      fakeFields[`fake_map_${fakeStackSuffix}`] = stringify({
        fake_key: fakeDocumentValue,
      });
      fakeFields[`fake_list_${fakeStackSuffix}`] = [
        stringify({
          fake_key: fakeDocumentValue,
        }),
      ];
      fakeFields[`fake_list_string_${fakeStackSuffix}`] = [ fakeDocumentValue ];
      fakeFields[`table_${fakeStackSuffix}`] = fakeTableName.toLowerCase();

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
      it('eventName is undefined', () => {
        record = fakeRecord(undefined, fakeCreateDocumentId);
      });
      it('eventName is not recognized', () => {
        record = fakeRecord('EVENT', fakeDeleteDocumentId);
      });
      describe('eventName is', () => {
        const testEventType = (action: 'INSERT' | 'MODIFY') => {
          describe(`${action}, but`, () => {
            let dynamodb: any;
            beforeEach(() => {
              dynamodb = {
                Keys: {
                  id: {
                    S: action == 'INSERT' ? fakeCreateDocumentId : fakeUpdateDocumentId,
                  },
                },
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
            it('table cannot be parsed from eventSourceARN', () => {
              eventSourceARN = fakeStreamArn('incorrect-table');
            });
            it(`${envNames.searchStackSuffix} is undefined`, () => {
              delete process.env[envNames.searchStackSuffix];
            });
            it(`${envNames.searchStackSuffix} is empty`, () => {
              process.env[envNames.searchStackSuffix] = '';
            });
            it('dynamodb is undefined', () => dynamodb = undefined);
            it('dynamodb is null', () => dynamodb = null);
            it('dynamodb.Keys is undefined', () => delete dynamodb.Keys);
            it('dynamodb.Keys is null', () => delete dynamodb.Keys);
            it('dynamodb.Keys.id is undefined', () => delete dynamodb.Keys.id);
            it('dynamodb.Keys.id is null', () => dynamodb.Keys.id = null);
            it('dynamodb.NewImage is undefined', () => delete dynamodb.NewImage);
            it('dynamodb.NewImage is null', () => dynamodb.NewImage = null);
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
          it('table cannot be parsed from eventSourceARN', () => {
            eventSourceARN = fakeStreamArn('fake-table');
          });
          it(`${envNames.searchStackSuffix} is undefined`, () => {
            delete process.env[envNames.searchStackSuffix];
          });
          it(`${envNames.searchStackSuffix} is empty`, () => {
            process.env[envNames.searchStackSuffix] = '';
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
      event = fakeEvent();
      spyOnCloudSearchDomain.and.throwError('cloudSearchDomain()');
    });
    it('cloudSearchDomain().uploadDocuments() produces an error', () => {
      event = fakeEvent();
      spyOnUploadDocuments.and.returnValue(fakeReject('uploadDocuments()'));
    });
  });

  it('calls callback without an error for correct parameters', (done: Callback) => {
    uploadDocuments(fakeEvent(), null, (err?: Error) => {
      expect(err).toBeFalsy();
      done();
    });
  });
});

describe('search.query()', () => {
  const fakeStackSuffix = 'q';
  const fakeResource = '/items';
  const fakeOffset = 10;
  const fakeLimit = 5;
  const fakeRequest = () => ({
    queryStringParameters: {
      key1: 'value1',
      key2: 'value2',
      sort: 'key4:asc,key5:desc',
      offset: String(fakeOffset),
      limit: String(fakeLimit),
    },
  });
  const fakeHits = (count = fakeLimit) => {
    const N = count;
    const hits: Dict<any>[] = [];
    while (count--) {
      const fields: Dict<string[]> = {};
      fields[`key1_${fakeStackSuffix}`] = ['value1'];
      fields[`key2_${fakeStackSuffix}`] = ['value2'];
      fields[`key_3_${fakeStackSuffix}`] = ['value3', 'value3_0'];
      fields[`key4_${fakeStackSuffix}`] = ['value4_' + (N - count)];
      fields[`key5_${fakeStackSuffix}`] = ['value5_' + count];
      hits.push({
        id: `abcd-${N - count}_${fakeResource.substring(1)}_${fakeStackSuffix}`,
        fields,
      });
    }
    return {
      hits: {
        hit: hits,
      },
    };
  };
  const fakeResponse = (count = fakeLimit) => {
    const N = count;
    const items: Dict<any>[] = [];
    while (count--) {
      items.push({
        id: 'abcd-' + (N - count),
        key1: 'value1',
        key2: 'value2',
        key_3: ['value3', 'value3_0'],
        key4: 'value4_' + (N - count),
        key5: 'value5_' + count,
      });
    }
    const response: Dict<any> = {
      offset: fakeOffset,
      items,
    };
    if (N === fakeLimit) {
      response.next = fakeOffset + fakeLimit;
    }
    return response;
  };

  const testMethod = (callback: Callback) =>
    query(fakeRequest(), fakeResource, ['key1', 'key2', 'key3'], callback);

  let spyOnValidate: jasmine.Spy;
  let spyOnCloudSearchDomain: jasmine.Spy;
  let spyOnSearch: jasmine.Spy;
  let spyOnRespond: jasmine.Spy;
  let spyOnRespondWithError: jasmine.Spy;

  beforeEach(() => {
    process.env[envNames.searchStackSuffix] = fakeStackSuffix;
    process.env[envNames.searchQueryEndpoint] = fakeQueryEndpoint;

    spyOnValidate = spyOn(apig, 'validate')
      .and.returnValue(Promise.resolve());
    spyOnSearch = jasmine.createSpy('search')
      .and.returnValue(fakeResolve(fakeHits()));
    spyOnCloudSearchDomain = spyOn(search, 'cloudSearchDomain')
      .and.returnValue({
        search: spyOnSearch,
      });
    spyOnRespond = spyOn(apig, 'respond')
      .and.callFake((callback: Callback) => callback());
    spyOnRespondWithError = spyOn(apig, 'respondWithError')
      .and.callFake((callback: Callback) => callback())
  });

  it('calls apig.validate() once with correct parameters', (done: Callback) => {
    testMethod(() => {
      expect(spyOnValidate).toHaveBeenCalledWith(fakeRequest(), 'GET', fakeResource);
      expect(spyOnValidate).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('calls cloudSearchDomain() once with correct parameters', (done: Callback) => {
     testMethod(() => {
      expect(spyOnCloudSearchDomain).toHaveBeenCalledWith(fakeQueryEndpoint);
      expect(spyOnCloudSearchDomain).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('calls cloudSearchDomain.search() once with correct parameters when', () => {
    let terms: string[];
    let q: string;
    afterEach((done: Callback) => {
      const callback = () => {
        expect(spyOnSearch).toHaveBeenCalledWith({
          queryParser: 'structured',
          query: q,
          sort: `key4_${fakeStackSuffix} asc,key5_${fakeStackSuffix} desc`,
          start: fakeOffset,
          size: fakeLimit,
        });
        expect(spyOnSearch).toHaveBeenCalledTimes(1);
        done();
      };
      query(fakeRequest(), fakeResource, terms, callback);
    });
    it('terms.length > 0', () => {
      terms = ['key1', 'key2', 'key3'];
      q = `(and table_${fakeStackSuffix}:'items' ` +
                `key1_${fakeStackSuffix}:'value1' ` +
                `key2_${fakeStackSuffix}:'value2')`;
    });
    it('terms.length = 0', () => {
      terms = [];
      q = `(and table_${fakeStackSuffix}:'items')`;
    });
    it('terms is undefined', () => {
      terms = undefined;
      q = `(and table_${fakeStackSuffix}:'items')`;
    });
  });

  describe('calls apig.respond() once with correct parameters when hit count is', () => {
    let count: number;
    afterEach((done: Callback) => {
      spyOnSearch.and.returnValue(fakeResolve(fakeHits(count)));
      const callback = () => {
        expect(spyOnRespond).toHaveBeenCalledWith(callback, fakeRequest(), fakeResponse(count));
        expect(spyOnRespond).toHaveBeenCalledTimes(1);
        done();
      };
      testMethod(callback);
    });
    it('equal to query limit', () => count = fakeLimit);
    it('less than query limit', () => count = fakeLimit - 1);
  });

  describe('calls apig.respondWithError() immediately with the error if', () => {
    let err: Error | ApiError;

    const testError = (after: Callback, done: Callback) => {
      const callback = () => {
        expect(spyOnRespondWithError).toHaveBeenCalledWith(callback, fakeRequest(), err);
        expect(spyOnRespondWithError).toHaveBeenCalledTimes(1);
        after();
        done();
      };
      testMethod(callback);
    };

    it('apig.validate() responds with an error', (done: Callback) => {
      err = new ApiError('validate()');
      spyOnValidate.and.returnValue(Promise.reject(err));
      testError(() => {
        expect(spyOnCloudSearchDomain).not.toHaveBeenCalled();
      }, done);
    });

    it('cloudSearchDomain() throws an error', (done: Callback) => {
      err = Error('cloudSearchDomain()');
      spyOnCloudSearchDomain.and.throwError(err.message);
      testError(() => {
        expect(spyOnSearch).not.toHaveBeenCalled();
      }, done);
    });

    it('cloudSearchDomain.search() produces an error', (done: Callback) => {
      err = Error('cloudSearchDomain.search()');
      spyOnSearch.and.returnValue(fakeReject(err));
      testError(() => {
        expect(spyOnRespond).not.toHaveBeenCalled();
      }, done);
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
          Endpoint: fakeQueryEndpoint,
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
          QueryEndpoint: fakeQueryEndpoint,
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
