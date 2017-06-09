import { cloudSearch } from './aws';
import { fakeReject, fakeResolve } from './fixtures/support';
import * as search from './search';
import { defineIndexFields } from './search';
import { Callback } from './types';

const fakeSearchDomain = 'search-1234';

describe('defineIndexFields()', () => {
  const fakeFieldSuffix = 'f';
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
    FieldSuffix: fakeFieldSuffix,
    Fields: [{
      IndexFieldName: fakeTextField,
      IndexFieldType: 'text',
      TextOptions: fakeTextOptions(),
    }, {
      IndexFieldName: fakeLiteralField,
      IndexFieldType: 'literal',
      TextOptions: fakeLiteralOptions(),
    }],
  });

  let event: any;

  let spyOnDefineIndexField: jasmine.Spy;

  beforeEach(() => {
    event = fakeEvent();
    spyOnDefineIndexField = spyOn(cloudSearch, 'defineIndexField')
      .and.returnValue(fakeResolve());
  });

  const testMethod = (callback: Callback) =>
    defineIndexFields(event, null, callback);

  it('calls cloudSearch.defineIndexField() for each field with correct parameters',
      (done: Callback) => {
    testMethod(() => {
      expect(spyOnDefineIndexField).toHaveBeenCalledWith({
        DomainName: fakeSearchDomain,
        IndexField: {
          IndexFieldName: fakeTextField + '-' + fakeFieldSuffix,
          IndexFieldType: 'text',
          TextOptions: fakeTextOptions(),
        },
      });
      expect(spyOnDefineIndexField).toHaveBeenCalledWith({
        DomainName: fakeSearchDomain,
        IndexField: {
          IndexFieldName: fakeLiteralField + '-' + fakeFieldSuffix,
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
    it('event.Fields is undefined', () => event.Fields = undefined);
    it('event.Fields is null', () => event.Fields = null);
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
      spyOnDefineIndexField.and.returnValues(
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
