/* eslint-disable no-unused-expressions */
/* global suite, test */

const chai = require('chai');
const expect = chai.expect;
const qs = require('qs');

const {
  getOptions,
  private: {
    fixFilterAndSearch,
    validateAll,
    check,
    takeOptions,
    skipOptions,
    totalCountOptions,
    sortOptions,
    groupOptions,
    totalSummaryOptions,
    filterOptions,
    searchOptions,
    selectOptions,
    sortOptionsChecker,
    groupOptionsChecker,
    summaryOptionsChecker,
    asBool,
    parse
  },
} = require('./options');

function testOptions(queryString, expectedResult, schema) {
  const result = getOptions(qs.parse(queryString), schema);
  // console.log(`Testing query ${queryString}`);
  // console.log('Result: ', JSON.stringify(result, null, 2));

  expect(result).to.eql(expectedResult);
}

suite('parse', function () {
  test('parse correctly', function () {
    const source = { test: 'text', test2: 42 };
    expect(parse(JSON.stringify(source))).to.eql(source);
  });

  test('parse error', function () {
    // For instance: forgotten quote
    const sourceText = '{"field1":"thing",error:true}';
    try {
      parse(sourceText);
      throw new Error('parse did not throw!');
    }
    catch (e) {
      // We want an error here that produces a proper string
      // when stringified - so let's test that.
      // Standard Error just gives {}.
      expect(JSON.stringify(e)).to.not.eql('{}');
    }
  });
});

suite('asBool', function () {
  test('true', function () {
    expect(asBool(true)).to.be.true;
  });

  test('false', function () {
    expect(asBool(false)).to.be.false;
  });

  test('true string', function () {
    expect(asBool('TrUe')).to.be.true;
  });

  test('false string', function () {
    expect(asBool('FaLsE')).to.be.false;
  });

  test('thruthy number', function () {
    expect(asBool(7)).to.be.true;
  });

  test('falsy number', function () {
    expect(asBool(0)).to.be.false;
  });

  test('thruthy string', function () {
    expect(asBool('something')).to.be.true;
  });

  test('falsy string', function () {
    expect(asBool('')).to.be.false;
  });
});

suite('summaryOptionsChecker', function () {
  test('valid', function () {
    const result = summaryOptionsChecker.validate({
      summaryType: 'sum',
      selector: 'thing',
    });
    expect(result).to.eql(null);
  });

  test('extra prop', function () {
    const result = summaryOptionsChecker.validate({
      summaryType: 'sum',
      selector: 'thing',
      extra: 'thing',
    });
    expect(result).to.include({ name: 'ValidationError', type: 'noUnknown' });
  });

  test('invalid summaryType', function () {
    const result = summaryOptionsChecker.validate({
      summaryType: 'unknown',
      selector: 'thing',
    });
    expect(result).to.include({ name: 'ValidationError', type: 'oneOf' });
  });

  test('invalid selector', function () {
    const result = summaryOptionsChecker.validate({
      summaryType: 'sum',
      selector: true,
    });
    expect(result).to.include({ name: 'ValidationError', type: 'typeError' });
  });
});

suite('groupOptionsChecker', function () {
  test('valid', function () {
    const result = groupOptionsChecker.validate({
      selector: 'thing',
      desc: true,
      isExpanded: true,
      groupInterval: 'year',
    });
    expect(result).to.eql(null);
  });

  test('valid with groupInterval integer', function () {
    const result = groupOptionsChecker.validate({
      selector: 'thing',
      desc: true,
      isExpanded: true,
      groupInterval: 11,
    });
    expect(result).to.eql(null);
  });

  test('extra prop', function () {
    const result = groupOptionsChecker.validate({
      selector: 'thing',
      desc: true,
      isExpanded: true,
      groupInterval: 'year',
      extra: 'thing',
    });
    expect(result).to.include({ name: 'ValidationError', type: 'noUnknown' });
  });

  test('missing selector', function () {
    const result = groupOptionsChecker.validate({
      //      selector: 'thing',
      desc: true,
      isExpanded: true,
      groupInterval: 'year',
    });
    expect(result).to.include({ name: 'ValidationError', type: 'required' });
  });

  test('invalid desc', function () {
    const result = groupOptionsChecker.validate({
      selector: 'thing',
      desc: 42,
      isExpanded: true,
      groupInterval: 'year',
    });
    expect(result).to.include({ name: 'ValidationError', type: 'typeError' });
  });

  test('invalid selector', function () {
    const result = groupOptionsChecker.validate({
      selector: 42,
      desc: true,
      isExpanded: true,
      groupInterval: 'year',
    });
    expect(result).to.include({ name: 'ValidationError', type: 'typeError' });
  });

  test('invalid isExpanded', function () {
    const result = groupOptionsChecker.validate({
      selector: 'thing',
      desc: true,
      isExpanded: 42,
      groupInterval: 'year',
    });
    expect(result).to.include({ name: 'ValidationError', type: 'typeError' });
  });

  test('invalid groupInterval - not string or number', function () {
    const result = groupOptionsChecker.validate({
      selector: 'thing',
      desc: true,
      isExpanded: true,
      groupInterval: true,
    }); //?
    expect(result).to.include({ name: 'ValidationError', type: 'or' });
  });

  test('invalid groupInterval - not string or integer', function () {
    const result = groupOptionsChecker.validate({
      selector: 'thing',
      desc: true,
      isExpanded: true,
      groupInterval: 10.3,
    }); //?
    expect(result).to.include({ name: 'ValidationError', type: 'or' });
  });

  test('invalid groupInterval - invalid string', function () {
    const result = groupOptionsChecker.validate({
      selector: 'thing',
      desc: true,
      isExpanded: true,
      groupInterval: 'wrong string',
    }); //?
    expect(result).to.include({ name: 'ValidationError', type: 'or' });
  });
});

suite('sortOptionsChecker', function () {
  test('missing desc', function () {
    const result = sortOptionsChecker.validate({ selector: 'thing' });
    expect(result).to.include({ name: 'ValidationError', type: 'required' });
  });

  test('missing selector', function () {
    const result = sortOptionsChecker.validate({ desc: true });
    expect(result).to.include({ name: 'ValidationError', type: 'required' });
  });

  test('valid', function () {
    const result = sortOptionsChecker.validate({
      selector: 'thing',
      desc: true,
    });
    expect(result).to.eql(null);
  });

  test('valid with isExpanded', function () {
    const result = sortOptionsChecker.validate({
      selector: 'thing',
      desc: true,
      isExpanded: 'random thing',
    });
    expect(result).to.eql(null);
  });

  test('extra prop', function () {
    const result = sortOptionsChecker.validate({
      selector: 'thing',
      desc: true,
      extra: 'thing',
    });
    expect(result).to.include({ name: 'ValidationError', type: 'noUnknown' });
  });

  test('incorrect desc type', function () {
    const result = sortOptionsChecker.validate({
      selector: 'thing',
      desc: 42,
    });
    //console.log('Error (direct from validator): ' + JSON.stringify(result));
    expect(result).to.include({ name: 'ValidationError', type: 'typeError' });
  });

  test('incorrect selector type', function () {
    const result = sortOptionsChecker.validate({
      selector: 42,
      desc: true,
    });
    expect(result).to.include({ name: 'ValidationError', type: 'typeError' });
  });
});

suite('takeOptions', function () {
  test('valid', function () {
    expect(takeOptions({ take: 10 })).to.eql({ loadOptions: { take: 10 } });
  });

  test('valid string value', function () {
    expect(takeOptions({ take: '10' })).to.eql({ loadOptions: { take: 10 } });
  });

  test('missing parameter', function () {
    expect(takeOptions({ tk: 10 })).to.eql({});
  });

  test('invalid value', function () {
    expect(takeOptions({ take: -10 })).to.eql({
      errors: [`Invalid 'take': -10`],
    });
  });
});

suite('skipOptions', function () {
  test('valid', function () {
    expect(skipOptions({ skip: 10 })).to.eql({ loadOptions: { skip: 10 } });
  });

  test('valid string value', function () {
    expect(skipOptions({ skip: '10' })).to.eql({ loadOptions: { skip: 10 } });
  });

  test('missing parameter', function () {
    expect(skipOptions({ skp: 10 })).to.eql({});
  });

  test('invalid value', function () {
    expect(skipOptions({ skip: -10 })).to.eql({
      errors: [`Invalid 'skip': -10`],
    });
  });
});

suite('totalCountOptions', function () {
  test('valid', function () {
    expect(totalCountOptions({ requireTotalCount: true })).to.eql({
      loadOptions: { requireTotalCount: true },
    });
  });

  test('valid string value', function () {
    expect(totalCountOptions({ requireTotalCount: 'true' })).to.eql({
      loadOptions: { requireTotalCount: true },
    });
  });

  test('missing parameter', function () {
    expect(totalCountOptions({ rqtc: true })).to.eql({});
  });
});

suite('sortOptions', function () {
  test('invalid', function () {
    const result = sortOptions({ sort: ['thing'] });
    expect(result.errors[0].message).to.match(
      /^Sort parameter validation errors/
    );
  });

  test('empty', function () {
    const result = sortOptions({ sort: [] });
    expect(result).to.eql({ errors: [`Invalid 'sort': `] });
  });
});

suite('totalSummaryOptions', function () {
  test('invalid', function () {
    const result = totalSummaryOptions({ totalSummary: ['thing'] });
    expect(result.errors[0].message).to.match(
      /^Total summary parameter validation errors/
    );
  });

  test('empty', function () {
    const result = totalSummaryOptions({ totalSummary: [] });
    expect(result).to.eql({ loadOptions: {} });
  });

  test('non-array', function () {
    const result = totalSummaryOptions({ totalSummary: {} });
    expect(result).to.eql({
      errors: [`Invalid 'totalSummary': [object Object]`],
    });
  });
});

suite('filterOptions', function () {
  test('valid array', function () {
    const result = filterOptions({ filter: ['thing'] });
    expect(result).to.eql({ loadOptions: { filter: ['thing'] } });
  });

  test('valid string', function () {
    const result = filterOptions({ filter: 'thing' });
    expect(result).to.eql({ loadOptions: { filter: 'thing' } });
  });

  test('valid string with an array inside', function () {
    const result = filterOptions({ filter: '["thing"]' });
    expect(result).to.eql({ loadOptions: { filter: ['thing'] } });
  });

  test('not string or array', function () {
    const result = filterOptions({ filter: {} });
    expect(result).to.eql({ errors: [`Invalid 'filter': [object Object]`] });
  });
});

suite('searchOptions', function () {
  test('valid with string', function () {
    const result = searchOptions({
      searchExpr: 'expr',
      searchOperation: '=',
      searchValue: 'val',
    });
    expect(result).to.eql({
      loadOptions: {
        searchExpr: 'expr',
        searchOperation: '=',
        searchValue: 'val',
      },
    });
  });

  test('valid with array', function () {
    const result = searchOptions({
      searchExpr: ['expr1', 'expr2'],
      searchOperation: '=',
      searchValue: 'val',
    });
    expect(result).to.eql({
      loadOptions: {
        searchExpr: ['expr1', 'expr2'],
        searchOperation: '=',
        searchValue: 'val',
      },
    });
  });

  test('invalid searchExpr', function () {
    const result = searchOptions({
      searchExpr: 42,
      searchOperation: '=',
      searchValue: 'val',
    });
    expect(result).to.eql({
      errors: [
        `Invalid 'searchExpr': 42`,
        `Invalid 'searchOperation': =`,
        `Invalid 'searchValue': val`,
      ],
    });
  });
});

suite('selectOptions', function () {
  test('valid string', function () {
    const result = selectOptions({ select: 'something' });
    expect(result).to.eql({ loadOptions: { select: ['something'] } });
  });

  test('valid array', function () {
    const result = selectOptions({ select: ['something', 'other'] });
    expect(result).to.eql({ loadOptions: { select: ['something', 'other'] } });
  });

  test('array with invalid content', function () {
    const result = selectOptions({ select: ['something', 'other', 42] });
    expect(result.errors[0].message).to.match(
      /Select array parameter has invalid content/
    );
  });

  test('empty array', function () {
    const result = selectOptions({ select: [] });
    expect(result).to.eql({ loadOptions: {} });
  });

  test('type other than string and array', function () {
    const result = selectOptions({ select: 42 });
    expect(result).to.eql({ errors: [`Invalid 'select': 42`] });
  });
});

suite('groupOptions', function () {
  test('invalid top level options', function () {
    const result = groupOptions({ group: ['thing'] });
    expect(result.errors[0].message).to.match(
      /^Group parameter validation errors/
    );
  });

  test('empty top level options', function () {
    const result = groupOptions({ group: [] });
    expect(result).to.eql({});
  });

  test('non-array top level options', function () {
    const result = groupOptions({ group: {} });
    expect(result).to.eql({ errors: [`Invalid 'group': [object Object]`] });
  });

  test('invalid group summary options', function () {
    const result = groupOptions({
      group: [{ selector: 'x' }],
      groupSummary: ['thing'],
    });
    expect(result.errors[0].message).to.match(
      /^Group summary parameter validation errors/
    );
  });

  test('empty group summary options', function () {
    const result = groupOptions({
      group: [{ selector: 'x' }],
      groupSummary: [],
    });
    expect(result).to.eql({
      errors: [],
      loadOptions: { group: [{ isExpanded: false, selector: 'x' }] },
      processingOptions: {},
    });
  });

  test('non-array group summary options', function () {
    const result = groupOptions({
      group: [{ selector: 'x' }],
      groupSummary: {},
    });
    expect(result).to.eql({
      errors: [`Invalid 'groupSummary': [object Object]`],
      loadOptions: { group: [{ isExpanded: false, selector: 'x' }] },
      processingOptions: {},
    });
  });
});

suite('check', function () {
  test('default value for one option', function () {
    expect(
      check(
        { one: 1, other: 2 },
        'nonexistent',
        undefined,
        undefined,
        'default value'
      )
    ).to.eql('default value');
  });

  test('default value for multiple options', function () {
    expect(
      check(
        { one: 1, other: 2 },
        ['one', 'nonexistent'],
        undefined,
        undefined,
        'default value'
      )
    ).to.eql('default value');
  });

  test('simple converter', function () {
    expect(
      check(
        { one: 1, other: 2 },
        ['one', 'other'],
        (one, other) => ({
          one,
          other,
        }),
        (x) => x * 2
      )
    ).to.eql({ loadOptions: { one: 2, other: 4 } });
  });

  test('checker is unhappy', function () {
    // not very well done at the moment
    expect(
      check({ one: 1, other: 2 }, ['one', 'other'], () => undefined)
    ).to.eql({ errors: [`Invalid 'one': 1`, `Invalid 'other': 2`] });
  });

  test('checker is really unhappy', function () {
    expect(
      check({ one: 1, other: 2 }, ['one', 'other'], () => {
        throw 'argh!';
      })
    ).to.eql({ errors: ['argh!'] });
  });
});

suite('validateAll', function () {
  test('simple short circuit test', function () {
    const checker = { validate: (x) => x > 10 };
    expect(validateAll([5, 7, 15, 25], checker, true)).to.eql({
      valid: false,
      errors: [true],
    });
  });

  test('test without short circuit', function () {
    // I believe this functionality is not used in the library code
    const checker = { validate: (x) => x > 10 };
    expect(validateAll([5, 7, 15, 25], checker, false)).to.eql({
      valid: false,
      errors: [true, true],
    });
  });
});

suite('fixFilterAndSearch', function () {
  test('fixes filter int', function () {
    expect(
      fixFilterAndSearch({
        int: 'int',
      })({
        filter: [['int', '=', '34']],
      })
    ).to.eql({
      filter: [['int', '=', 34]],
    });
  });

  test('accepts undefined query input', () => {
    expect(fixFilterAndSearch('schema')(undefined)).to.eql(undefined);
  });

  test('fixes search int', function () {
    expect(
      fixFilterAndSearch({
        int: 'int',
      })({
        searchExpr: 'int',
        searchOperation: '=',
        searchValue: '34',
      })
    ).to.eql({
      searchExpr: 'int',
      searchOperation: '=',
      searchValue: 34,
    });
  });

  test('no fix for field not defined in schema', function () {
    expect(
      fixFilterAndSearch({
        int: 'int',
      })({
        searchExpr: 'other',
        searchOperation: '=',
        searchValue: '34',
      })
    ).to.eql({
      searchExpr: 'other',
      searchOperation: '=',
      searchValue: '34',
    });
  });

  test('fixes search expr list', function () {
    // see comments above fixSearch implementation
    expect(
      fixFilterAndSearch({
        int: 'int',
      })({
        searchExpr: ['int', 'other'],
        searchOperation: '=',
        searchValue: '34',
      })
    ).to.eql({
      searchExpr: ['int', 'other'],
      searchOperation: '=',
      searchValue: 34,
    });
  });

  test('no fix for expr list without schema entries', function () {
    expect(
      fixFilterAndSearch({
        int: 'int',
      })({
        searchExpr: ['one', 'other'],
        searchOperation: '=',
        searchValue: '34',
      })
    ).to.eql({
      searchExpr: ['one', 'other'],
      searchOperation: '=',
      searchValue: '34',
    });
  });

  test('no fix for expr thats not string or array', function () {
    expect(
      fixFilterAndSearch({
        int: 'int',
      })({
        searchExpr: 42,
        searchOperation: '=',
        searchValue: '34',
      })
    ).to.eql({
      searchExpr: 42,
      searchOperation: '=',
      searchValue: '34',
    });
  });
});

suite('getOptions', function () {
  test('take and total count', function () {
    testOptions('take=10&requireTotalCount=true', {
      errors: [],
      loadOptions: {
        take: 10,
        requireTotalCount: true,
      },
      processingOptions: {},
    });
  });

  test('take and total count with tzOffset', function () {
    testOptions('take=10&requireTotalCount=true&tzOffset=-60', {
      errors: [],
      loadOptions: {
        take: 10,
        requireTotalCount: true,
      },
      processingOptions: {
        timezoneOffset: -60,
      },
    });
  });

  test('take and total count with caseInsensitiveRegex', function () {
    testOptions('take=10&requireTotalCount=true&caseInsensitiveRegex=false', {
      errors: [],
      loadOptions: {
        take: 10,
        requireTotalCount: true,
      },
      processingOptions: {
        caseInsensitiveRegex: false,
      },
    });
  });

  test('take, skip, total count', function () {
    testOptions('take=10&requireTotalCount=true&skip=30', {
      errors: [],
      loadOptions: {
        take: 10,
        skip: 30,
        requireTotalCount: true,
      },
      processingOptions: {},
    });
  });

  test('contains 3 digits', function () {
    testOptions(
      'filter%5B0%5D%5B0%5D=field&filter%5B0%5D%5B1%5D=contains&filter%5B0%5D%5B2%5D=234',
      {
        errors: [],
        loadOptions: {
          filter: [['field', 'contains', '234']],
        },
        processingOptions: {},
      }
    );
  });

  test('contains 4 digits', function () {
    testOptions(
      'filter%5B0%5D%5B0%5D=field&filter%5B0%5D%5B1%5D=contains&filter%5B0%5D%5B2%5D=2345',
      {
        errors: [],
        loadOptions: {
          filter: [['field', 'contains', '2345']],
        },
        processingOptions: {},
      }
    );
  });

  test('contains 4 digits with dashes', function () {
    testOptions(
      'filter%5B0%5D%5B0%5D=field&filter%5B0%5D%5B1%5D=contains&filter%5B0%5D%5B2%5D=23-45',
      {
        errors: [],
        loadOptions: {
          filter: [['field', 'contains', '23-45']],
        },
        processingOptions: {},
      }
    );
  });

  test('contains 5 digits', function () {
    testOptions(
      'filter%5B0%5D%5B0%5D=field&filter%5B0%5D%5B1%5D=contains&filter%5B0%5D%5B2%5D=23456',
      {
        errors: [],
        loadOptions: {
          filter: [['field', 'contains', '23456']],
        },
        processingOptions: {},
      }
    );
  });

  test('contains 3 chars', function () {
    testOptions(
      'filter%5B0%5D%5B0%5D=field&filter%5B0%5D%5B1%5D=contains&filter%5B0%5D%5B2%5D=abc',
      {
        errors: [],
        loadOptions: {
          filter: [['field', 'contains', 'abc']],
        },
        processingOptions: {},
      }
    );
  });

  test('contains 4 chars', function () {
    testOptions(
      'filter%5B0%5D%5B0%5D=field&filter%5B0%5D%5B1%5D=contains&filter%5B0%5D%5B2%5D=abcd',
      {
        errors: [],
        loadOptions: {
          filter: [['field', 'contains', 'abcd']],
        },
        processingOptions: {},
      }
    );
  });

  test('sort, take and total count', function () {
    testOptions(
      'sort%5B0%5D%5Bselector%5D=date2&sort%5B0%5D%5Bdesc%5D=false&take=10&requireTotalCount=true',
      {
        errors: [],
        loadOptions: {
          sort: [
            {
              selector: 'date2',
              desc: false,
            },
          ],
          take: 10,
          requireTotalCount: true,
        },
        processingOptions: {},
      }
    );
  });

  test('sort with correct parameter', function () {
    testOptions(
      'sort=[{%22selector%22:%22population%22,%22desc%22:true}]',
      {
        errors: [],
        loadOptions: {
          sort: [
            {
              selector: 'population',
              desc: true,
            },
          ],
        },
        processingOptions: {},
      }
    );
  });

  test('sort with incorrect parameter', function () {
    const queryString = 'sort=[{%22selectorX%22:%22population%22,%22desc%22:true}]';
    const result = getOptions(qs.parse(queryString));

    expect(result.errors.length).to.eql(1);
    //console.log(typeof result.errors[0]);
    //console.log('Error array from getOptions result: ' + JSON.stringify(result.errors));
    expect(result.errors[0].message).to.be.a('string').and.satisfy(s=> s.startsWith('Sort parameter validation errors:'));
  });

  test('issue #10 - filter works when given as array', function () {
    expect(
      getOptions(
        {
          filter:
            //        '[["dtFinished",">=","2018-08-01T16:20:30.000Z"],"and",["dtFinished","<","2018-08-01T16:20:30.000Z"]]'
            [
              ['dtFinished', '>=', '2018-08-01T16:20:30.000Z'],
              'and',
              ['dtFinished', '<', '2018-08-01T16:20:30.000Z'],
            ],
        },
        { dtFinished: 'datetime' }
      )
    ).to.eql({
      errors: [],
      loadOptions: {
        filter: [
          ['dtFinished', '>=', new Date('2018-08-01T16:20:30.000Z')],
          'and',
          ['dtFinished', '<', new Date('2018-08-01T16:20:30.000Z')],
        ],
      },
      processingOptions: {},
    });
  });

  test('filter works with a bool value', function () {
    expect(
      getOptions({
        filter: [['done', '=', true]],
      })
    ).to.eql({
      errors: [],
      loadOptions: {
        filter: [['done', '=', true]],
      },
      processingOptions: {},
    });
  });

  test('filter works with a bool value given as a string', function () {
    expect(
      getOptions(
        {
          filter: [['done', '=', 'true']],
        },
        { done: 'bool' }
      )
    ).to.eql({
      errors: [],
      loadOptions: {
        filter: [['done', '=', true]],
      },
      processingOptions: {},
    });
  });

  test('issue #10 - filter works when given as string', function () {
    expect(
      getOptions(
        {
          filter:
            '[["dtFinished",">=","2018-08-01T16:20:30.000Z"],"and",["dtFinished","<","2018-08-01T16:20:30.000Z"]]',
        },
        { dtFinished: 'datetime' }
      )
    ).to.eql({
      errors: [],
      loadOptions: {
        filter: [
          ['dtFinished', '>=', new Date('2018-08-01T16:20:30.000Z')],
          'and',
          ['dtFinished', '<', new Date('2018-08-01T16:20:30.000Z')],
        ],
      },
      processingOptions: {},
    });
  });

  test('total count, group, group count', function () {
    testOptions(
      'sort%5B0%5D%5Bselector%5D=date2&sort%5B0%5D%5Bdesc%5D=false&requireTotalCount=true&group%5B0%5D%5Bselector%5D=date2&group%5B0%5D%5BisExpanded%5D=false&requireGroupCount=true',
      {
        errors: [],
        loadOptions: {
          sort: [
            {
              selector: 'date2',
              desc: false,
            },
          ],
          requireTotalCount: true,
          group: [
            {
              selector: 'date2',
              isExpanded: false,
            },
          ],
          requireGroupCount: true,
        },
        processingOptions: {},
      }
    );
  });

  test('sort, filter with date', function () {
    testOptions(
      'sort%5B0%5D%5Bselector%5D=date2&sort%5B0%5D%5Bdesc%5D=false&filter%5B0%5D%5B0%5D=date2&filter%5B0%5D%5B1%5D=%3D&filter%5B0%5D%5B2%5D=2017-07-13T00%3A00%3A00.000Z',
      {
        errors: [],
        loadOptions: {
          sort: [
            {
              selector: 'date2',
              desc: false,
            },
          ],
          filter: [['date2', '=', new Date(Date.parse('2017-07-13'))]],
        },
        processingOptions: {},
      },
      { date2: 'datetime' }
    );
  });

  test('take, total count, filter with int', function () {
    testOptions(
      'take=10&requireTotalCount=true&filter%5B0%5D%5B0%5D=int1&filter%5B0%5D%5B1%5D=%3D&filter%5B0%5D%5B2%5D=4',
      {
        errors: [],
        loadOptions: {
          take: 10,
          requireTotalCount: true,
          filter: [['int1', '=', 4]],
        },
        processingOptions: {},
      },
      {
        int1: 'int',
      }
    );
  });

  test('summaryQueryLimit, skip, take, requireTotalCount, totalSummary, tzOffset', function () {
    testOptions(
      'summaryQueryLimit=500&skip=0&take=20&requireTotalCount=true&totalSummary=%5B%7B%22selector%22%3A%22date1%22%2C%22summaryType%22%3A%22max%22%7D%2C%7B%22selector%22%3A%22int1%22%2C%22summaryType%22%3A%22avg%22%7D%2C%7B%22selector%22%3A%22int1%22%2C%22summaryType%22%3A%22sum%22%7D%5D&tzOffset=-60',
      {
        errors: [],
        loadOptions: {
          skip: 0,
          take: 20,
          requireTotalCount: true,
          totalSummary: [
            {
              selector: 'date1',
              summaryType: 'max',
            },
            {
              selector: 'int1',
              summaryType: 'avg',
            },
            {
              selector: 'int1',
              summaryType: 'sum',
            },
          ],
        },
        processingOptions: {
          timezoneOffset: -60,
          summaryQueryLimit: 500,
        },
      }
    );
  });

  test('summaryQueryLimit, skip, take, requireTotalCount, totalSummary, group, requireGroupCount, groupSummary, tzOffset', function () {
    testOptions(
      'summaryQueryLimit=500&skip=0&take=20&requireTotalCount=true&totalSummary=%5B%7B%22selector%22%3A%22date1%22%2C%22summaryType%22%3A%22max%22%7D%2C%7B%22selector%22%3A%22int1%22%2C%22summaryType%22%3A%22avg%22%7D%2C%7B%22selector%22%3A%22int1%22%2C%22summaryType%22%3A%22sum%22%7D%5D&group=%5B%7B%22selector%22%3A%22int1%22%2C%22desc%22%3Afalse%2C%22isExpanded%22%3Afalse%7D%5D&requireGroupCount=true&groupSummary=%5B%7B%22selector%22%3A%22date1%22%2C%22summaryType%22%3A%22min%22%7D%2C%7B%22selector%22%3A%22int1%22%2C%22summaryType%22%3A%22avg%22%7D%2C%7B%22selector%22%3A%22int1%22%2C%22summaryType%22%3A%22sum%22%7D%2C%7B%22summaryType%22%3A%22count%22%7D%5D&tzOffset=-60',
      {
        errors: [],
        loadOptions: {
          skip: 0,
          take: 20,
          requireTotalCount: true,
          totalSummary: [
            {
              selector: 'date1',
              summaryType: 'max',
            },
            {
              selector: 'int1',
              summaryType: 'avg',
            },
            {
              selector: 'int1',
              summaryType: 'sum',
            },
          ],
          requireGroupCount: true,
          group: [
            {
              selector: 'int1',
              desc: false,
              isExpanded: false,
            },
          ],
          groupSummary: [
            {
              selector: 'date1',
              summaryType: 'min',
            },
            {
              selector: 'int1',
              summaryType: 'avg',
            },
            {
              selector: 'int1',
              summaryType: 'sum',
            },
            {
              summaryType: 'count',
            },
          ],
        },
        processingOptions: {
          timezoneOffset: -60,
          summaryQueryLimit: 500,
        },
      }
    );
  });
});
