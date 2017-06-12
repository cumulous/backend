import * as stringify from 'json-stable-stringify';

import { cloudSearch } from './aws';
import { fakeReject, fakeResolve } from './fixtures/support';
import * as search from './search';
import { defineIndexFields, indexDocuments, describeDomain } from './search';
import { Callback } from './types';

const fakeSearchDomain = 'search-1234';

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

describe('search.describeDomain()', () => {
  const fakeDocEndpoint = 'doc-1234.us-east-1.cloudsearch.amazonaws.com';
  const fakeSearchEndpoint = 'search-1234.us-east-1.cloudsearch.amazonaws.com';

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
