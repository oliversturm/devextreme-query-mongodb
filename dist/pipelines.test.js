'use strict';

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var chai = require('chai');
var assert = chai.assert;

var _require = require('mongodb'),
    ObjectId = _require.ObjectId;

var pipelines = require('./pipelines');
var createGroupKeyPipeline = pipelines.createGroupKeyPipeline,
    createGroupingPipeline = pipelines.createGroupingPipeline,
    createSkipTakePipeline = pipelines.createSkipTakePipeline,
    createCountPipeline = pipelines.createCountPipeline,
    createMatchPipeline = pipelines.createMatchPipeline,
    createSortPipeline = pipelines.createSortPipeline,
    createSummaryPipeline = pipelines.createSummaryPipeline,
    createSelectProjectExpression = pipelines.createSelectProjectExpression,
    createSelectPipeline = pipelines.createSelectPipeline,
    createCompleteFilterPipeline = pipelines.createCompleteFilterPipeline,
    createRemoveNestedFieldsPipeline = pipelines.createRemoveNestedFieldsPipeline;
var _pipelines$testing = pipelines.testing,
    createGroupStagePipeline = _pipelines$testing.createGroupStagePipeline,
    construct = _pipelines$testing.construct,
    constructRegex = _pipelines$testing.constructRegex,
    parseFilter = _pipelines$testing.parseFilter,
    createFilterPipeline = _pipelines$testing.createFilterPipeline,
    createSearchPipeline = _pipelines$testing.createSearchPipeline,
    checkNestedField = _pipelines$testing.checkNestedField,
    createAddNestedFieldsPipeline = _pipelines$testing.createAddNestedFieldsPipeline,
    divInt = _pipelines$testing.divInt,
    subtractMod = _pipelines$testing.subtractMod,
    isAndChainWithIncompleteAnds = _pipelines$testing.isAndChainWithIncompleteAnds,
    fixAndChainWithIncompleteAnds = _pipelines$testing.fixAndChainWithIncompleteAnds,
    isCorrectFilterOperatorStructure = _pipelines$testing.isCorrectFilterOperatorStructure;


suite('pipelines', function () {
  suite('divInt', function () {
    test('works', function () {
      assert.deepEqual(divInt(14, 3), {
        $divide: [{
          $subtract: [14, { $mod: [14, 3] }]
        }, 3]
      });
    });
  });

  suite('subtractMod', function () {
    test('works', function () {
      assert.deepEqual(subtractMod(14, 3), {
        $subtract: [14, { $mod: [14, 3] }]
      });
    });
  });

  suite('createGroupKeyPipeline', function () {
    test('no groupInterval', function () {
      var result = createGroupKeyPipeline('sel', null, 0, 0);
      var wanted = [{ $addFields: { ___group_key_0: '$sel' } }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    });

    test('numeric groupInterval', function () {
      var result = createGroupKeyPipeline('sel', 15, 0, 0);
      var wanted = [{
        $addFields: {
          ___group_key_0: { $subtract: ['$sel', { $mod: ['$sel', 15] }] }
        }
      }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    });

    var basicNamedGroupIntervalTest = function basicNamedGroupIntervalTest(name, tzo, mongoModName) {
      var result = createGroupKeyPipeline('sel', name, 0, {
        timezoneOffset: tzo
      });
      var wanted = [{
        $addFields: {
          ___group_key_0: _defineProperty({}, '$' + (mongoModName || name), {
            $subtract: ['$sel', tzo * 60 * 1000]
          })
        }
      }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    };

    test('groupInterval year, timezoneOffset 0', function () {
      basicNamedGroupIntervalTest('year', 0);
    });

    test('groupInterval year, timezoneOffset 60', function () {
      basicNamedGroupIntervalTest('year', 60);
    });

    test('groupInterval quarter, timezoneOffset 60', function () {
      var result = createGroupKeyPipeline('sel', 'quarter', 0, {
        timezoneOffset: 60
      });
      var wanted = [{
        $addFields: {
          ___mp2: { $add: [{ $month: { $subtract: ['$sel', 3600000] } }, 2] }
        }
      }, {
        $addFields: {
          ___group_key_0: {
            $divide: [{ $subtract: ['$___mp2', { $mod: ['$___mp2', 3] }] }, 3]
          }
        }
      }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    });

    test('groupInterval month, timezoneOffset 60', function () {
      basicNamedGroupIntervalTest('month', 60);
    });

    test('groupInterval day, timezoneOffset 60', function () {
      basicNamedGroupIntervalTest('day', 60, 'dayOfMonth');
    });

    test('groupInterval dayOfWeek, timezoneOffset 60', function () {
      var result = createGroupKeyPipeline('sel', 'dayOfWeek', 0, {
        timezoneOffset: 60
      });
      var wanted = [{
        $addFields: {
          ___group_key_0: {
            $subtract: [{ $dayOfWeek: { $subtract: ['$sel', 3600000] } }, 1]
          }
        }
      }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    });

    test('groupInterval hour, timezoneOffset 60', function () {
      basicNamedGroupIntervalTest('hour', 60);
    });

    test('groupInterval minute, timezoneOffset 60', function () {
      basicNamedGroupIntervalTest('minute', 60);
    });

    test('groupInterval second, timezoneOffset 60', function () {
      basicNamedGroupIntervalTest('second', 60);
    });

    test('unknown groupInterval', function () {
      var result = createGroupKeyPipeline('sel', 'non-existent name', 0, 0);
      var wanted = [{ $addFields: { ___group_key_0: '$sel' } }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    });
  });

  suite('createGroupStagePipeline', function () {
    test('basics', function () {
      var groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      var result = createGroupStagePipeline(false, true, null, groupKeyPipeline);
      var wanted = ['test', { $group: { _id: '$___group_key_99' } }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });

    test('not countingSeparately', function () {
      var groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      var result = createGroupStagePipeline(false, false, null, groupKeyPipeline);
      var wanted = ['test', { $group: { _id: '$___group_key_99', count: { $sum: 1 } } }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });

    test('not countingSeparately, includeDataItems', function () {
      var groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      var result = createGroupStagePipeline(true, false, 'itemProjection', groupKeyPipeline);
      var wanted = ['test', {
        $group: {
          _id: '$___group_key_99',
          count: { $sum: 1 },
          items: { $push: 'itemProjection' }
        }
      }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });
  });

  suite('createGroupingPipeline', function () {
    test('basics', function () {
      var groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      var result = createGroupingPipeline(true, false, true, groupKeyPipeline);
      var wanted = ['test', { $group: { _id: '$___group_key_99' } }, { $project: { _id: 0, key: '$_id' } }, { $sort: { key: -1 } }, { $addFields: { items: null } }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });

    test('not countingSeparately', function () {
      var groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      var result = createGroupingPipeline(true, false, false, groupKeyPipeline);
      var wanted = ['test', { $group: { _id: '$___group_key_99', count: { $sum: 1 } } }, { $project: { _id: 0, key: '$_id', count: 1 } }, { $sort: { key: -1 } }, { $addFields: { items: null } }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });

    test('not countingSeparately, includeDataItems', function () {
      var groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      var result = createGroupingPipeline(true, true, false, groupKeyPipeline);
      var wanted = ['test', {
        $group: {
          _id: '$___group_key_99',
          count: { $sum: 1 },
          items: { $push: '$$CURRENT' }
        }
      }, { $project: { _id: 0, key: '$_id', count: 1, items: 1 } }, { $sort: { key: -1 } }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });

    test('not countingSeparately, includeDataItems, custom itemProjection', function () {
      var groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      var result = createGroupingPipeline(true, true, false, groupKeyPipeline, '$$customProjection$$');
      var wanted = ['test', {
        $group: {
          _id: '$___group_key_99',
          count: { $sum: 1 },
          items: { $push: '$$customProjection$$' }
        }
      }, { $project: { _id: 0, key: '$_id', count: 1, items: 1 } }, { $sort: { key: -1 } }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });
  });

  suite('createSkipTakePipeline', function () {
    test('no skip or take', function () {
      assert.deepEqual(createSkipTakePipeline(), []);
    });

    test('skip, no take', function () {
      assert.deepEqual(createSkipTakePipeline(33), [{ $skip: 33 }]);
    });

    test('no skip, take', function () {
      assert.deepEqual(createSkipTakePipeline(null, 33), [{ $limit: 33 }]);
    });

    test('skip and take', function () {
      assert.deepEqual(createSkipTakePipeline(33, 44), [{ $skip: 33 }, { $limit: 44 }]);
    });
  });

  suite('createCountPipeline', function () {
    test('works', function () {
      assert.deepEqual(createCountPipeline(), [{ $count: 'count' }]);
    });
  });

  suite('createMatchPipeline', function () {
    test('works', function () {
      assert.deepEqual(createMatchPipeline('sel', 'val'), [{ $match: { sel: 'val' } }]);
    });
  });

  suite('construct', function () {
    test('works', function () {
      assert.deepEqual(construct('field', 'plus', 'val'), {
        field: { plus: 'val' }
      });
    });
  });

  suite('constructRegex', function () {
    test('works', function () {
      assert.deepEqual(constructRegex('field', 'regex', true), {
        field: { $regex: 'regex', $options: 'i' }
      });
    });
  });

  suite('parseFilter', function () {
    var testParseFilter = function testParseFilter(input, expectedMatch, expectedFieldList) {
      var result = parseFilter(input, { caseInsensitiveRegex: true });
      var match = result && result.match;
      var fieldList = result ? result.fieldList : [];
      assert.deepEqual(match, expectedMatch);
      assert.deepEqual(fieldList, expectedFieldList);
    };

    test('string element', function () {
      testParseFilter('thing', {
        thing: { $eq: true }
      }, ['thing']);
    });

    test('nested array', function () {
      testParseFilter([[['!', 'thing']]], {
        $nor: [{
          thing: { $eq: true }
        }]
      }, ['thing']);
    });

    test('!', function () {
      testParseFilter(['!', 'thing'], {
        $nor: [{
          thing: { $eq: true }
        }]
      }, ['thing']);
    });

    test('unknown unary', function () {
      testParseFilter(['&', 'thing'], null, []);
    });

    test('equal', function () {
      testParseFilter(['thing', '=', 'val'], {
        thing: { $eq: 'val' }
      }, ['thing']);
    });

    test('equalsObjectId', function () {
      testParseFilter(['thing', 'equalsObjectId', '0123456789abcdef01234567'], {
        thing: {
          $eq: ObjectId('0123456789abcdef01234567')
        }
      }, ['thing']);
    });

    test('not equal', function () {
      testParseFilter(['thing', '<>', 'val'], {
        thing: { $ne: 'val' }
      }, ['thing']);
    });

    test('greater than', function () {
      testParseFilter(['thing', '>', 'val'], {
        thing: { $gt: 'val' }
      }, ['thing']);
    });

    test('greater than or equal', function () {
      testParseFilter(['thing', '>=', 'val'], {
        thing: { $gte: 'val' }
      }, ['thing']);
    });

    test('lower than', function () {
      testParseFilter(['thing', '<', 'val'], {
        thing: { $lt: 'val' }
      }, ['thing']);
    });

    test('lower than or equal', function () {
      testParseFilter(['thing', '<=', 'val'], {
        thing: { $lte: 'val' }
      }, ['thing']);
    });

    test('startswith', function () {
      testParseFilter(['thing', 'startswith', 'val'], {
        thing: { $regex: '^val', $options: 'i' }
      }, ['thing']);
    });

    test('endswith', function () {
      testParseFilter(['thing', 'endswith', 'val'], {
        thing: { $regex: 'val$', $options: 'i' }
      }, ['thing']);
    });

    test('contains', function () {
      testParseFilter(['thing', 'contains', 'val'], {
        thing: { $regex: 'val', $options: 'i' }
      }, ['thing']);
    });

    test('notcontains', function () {
      testParseFilter(['thing', 'notcontains', 'val'], {
        thing: { $regex: '^((?!val).)*$', $options: 'i' }
      }, ['thing']);
    });

    test('unknown operator', function () {
      testParseFilter(['thing', '&%&%&%&', 'val'], null, []);
    });

    test('even number of elements > 2', function () {
      testParseFilter([1, 3, 4, 6], null, []);
    });

    test('not an array or a string', function () {
      testParseFilter({ barg: 42 }, null, []);
    });

    test('odd number of elements > 3 without operator in pos 1', function () {
      testParseFilter([1, 'unknown item', 3, 4, 5], null, []);
    });

    test('odd number of elements > 3 with non-string in pos 1', function () {
      testParseFilter([1, { barg: 42 }, 3, 4, 5], null, []);
    });

    test('nested field', function () {
      testParseFilter(['thing.year', '=', 'val'], {
        ___thing_year: { $eq: 'val' }
      }, ['thing.year']);
    });

    test('unrecognized nested field', function () {
      testParseFilter(['thing.unknown', '=', 'val'], {
        'thing.unknown': { $eq: 'val' }
      }, ['thing.unknown']);
    });

    test('correct "and" chain', function () {
      testParseFilter([['field1', '=', 42], 'and', ['field2', '>', 10], 'and', ['field3', '<>', 'this thing']], {
        $and: [{
          field1: { $eq: 42 }
        }, {
          field2: { $gt: 10 }
        }, {
          field3: { $ne: 'this thing' }
        }]
      }, ['field1', 'field2', 'field3']);
    });

    test('short "and" chain with no "ands"', function () {
      testParseFilter([['field1', '=', 42], ['field2', '>', 10]], {
        $and: [{
          field1: { $eq: 42 }
        }, {
          field2: { $gt: 10 }
        }]
      }, ['field1', 'field2']);
    });

    test('long "and" chain with no "ands"', function () {
      testParseFilter([['field1', '=', 42], ['field2', '>', 10], ['field3', '<>', 'this thing'], ['field4', '=', 11]], {
        $and: [{
          field1: { $eq: 42 }
        }, {
          field2: { $gt: 10 }
        }, {
          field3: { $ne: 'this thing' }
        }, {
          field4: { $eq: 11 }
        }]
      }, ['field1', 'field2', 'field3', 'field4']);
    });

    test('"and" chain with incomplete "ands"', function () {
      testParseFilter([['field1', '=', 42], 'and', ['field2', '>', 10], ['field3', '<>', 'this thing']], {
        $and: [{
          field1: { $eq: 42 }
        }, {
          field2: { $gt: 10 }
        }, {
          field3: { $ne: 'this thing' }
        }]
      }, ['field1', 'field2', 'field3']);
    });

    test('correct "or" chain', function () {
      testParseFilter([['field1', '=', 42], 'or', ['field2', '>', 10], 'or', ['field3', '<>', 'this thing']], {
        $or: [{
          field1: { $eq: 42 }
        }, {
          field2: { $gt: 10 }
        }, {
          field3: { $ne: 'this thing' }
        }]
      }, ['field1', 'field2', 'field3']);
    });

    test('incorrect operator chain', function () {
      testParseFilter([['field1', '=', 42], 'and', ['field2', '>', 10], 'or', ['field3', '<>', 'this thing']], null, []);
    });

    test('correct combined operator chain', function () {
      testParseFilter([['field1', '=', 42], 'and', [['field2', '>', 10], 'or', ['field3', '<>', 'this thing']]], {
        $and: [{
          field1: { $eq: 42 }
        }, {
          $or: [{
            field2: { $gt: 10 }
          }, {
            field3: { $ne: 'this thing' }
          }]
        }]
      }, ['field1', 'field2', 'field3']);
    });
  });

  suite('createFilterPipeline', function () {
    test('works', function () {
      assert.deepEqual(createFilterPipeline(['thing', '=', 42]), {
        pipeline: [{ $match: { thing: { $eq: 42 } } }],
        fieldList: ['thing']
      });
    });

    test('no filter', function () {
      assert.deepEqual(createFilterPipeline(), {
        pipeline: [],
        fieldList: []
      });
    });

    test('invalid filter', function () {
      assert.deepEqual(createFilterPipeline(['thing', '=']), {
        pipeline: [],
        fieldList: []
      });
    });
  });

  suite('createSortPipeline', function () {
    test('works', function () {
      assert.deepEqual(createSortPipeline([{ selector: 'field1', desc: true }, { selector: 'field2' }]), [{ $sort: { field1: -1, field2: 1 } }]);
    });
  });

  suite('createSummaryPipeline', function () {
    test('works', function () {
      assert.deepEqual(createSummaryPipeline([{ summaryType: 'min', selector: 'thing' }, { summaryType: 'max', selector: 'other' }, { summaryType: 'invalid', selector: 'dontknow' }, { summaryType: 'count' }]), [{
        $group: {
          ___minthing: { $min: '$thing' },
          ___maxother: { $max: '$other' },
          ___count: { $sum: 1 },
          _id: null
        }
      }]);
    });
  });

  suite('createSearchPipeline', function () {
    test('simple values', function () {
      assert.deepEqual(createSearchPipeline('thing', '=', 42), {
        pipeline: [{ $match: { thing: { $eq: 42 } } }],
        fieldList: ['thing']
      });
    });

    test('list of expr', function () {
      assert.deepEqual(createSearchPipeline(['thing', 'other', 'outlandish'], '=', 42), {
        pipeline: [{
          $match: {
            $or: [{ thing: { $eq: 42 } }, { other: { $eq: 42 } }, { outlandish: { $eq: 42 } }]
          }
        }],
        fieldList: ['thing', 'other', 'outlandish']
      });
    });
  });

  suite('createSelectProjectExpression', function () {
    test('basics', function () {
      assert.deepEqual(createSelectProjectExpression(['field1', 'field2']), {
        field1: '$field1',
        field2: '$field2'
      });
    });

    test('explicitId', function () {
      assert.deepEqual(createSelectProjectExpression(['field1', 'field2'], true), {
        field1: '$field1',
        field2: '$field2',
        _id: '$_id'
      });
    });
  });

  suite('createSelectPipeline', function () {
    test('works', function () {
      assert.deepEqual(createSelectPipeline(['field1', 'field2']), [{
        $project: {
          field1: '$field1',
          field2: '$field2'
        }
      }]);
    });
  });

  suite('checkNestedField', function () {
    test('Quarter', function () {
      assert.deepEqual(checkNestedField('field.Quarter'), {
        base: 'field',
        nested: 'Quarter',
        filterFieldName: '___field_Quarter'
      });
    });

    test('year', function () {
      assert.deepEqual(checkNestedField('field.year'), {
        base: 'field',
        nested: 'year',
        filterFieldName: '___field_year'
      });
    });

    test('no match', function () {
      assert.isUndefined(checkNestedField('field.other'));
    });
  });

  suite('createAddNestedFieldsPipeline', function () {
    test('no recognized nested fields', function () {
      assert.deepEqual(createAddNestedFieldsPipeline(['field1', 'field2', 'field3.other'], 0), { pipeline: [], nestedFields: [] });
    });

    test('nested fields, tzo 60', function () {
      assert.deepEqual(createAddNestedFieldsPipeline(['field1', 'field2.year', 'field3.quarter', 'field4.month', 'field3.day', 'field3.dayofweek'], { timezoneOffset: 60 }), {
        pipeline: [{
          $addFields: {
            ___field3_mp2: {
              $add: [{
                $month: {
                  $subtract: ['$field3', 3600000]
                }
              }, 2]
            }
          }
        }, {
          $addFields: {
            ___field2_year: {
              $year: {
                $subtract: ['$field2', 3600000]
              }
            },
            ___field3_day: {
              $dayOfMonth: {
                $subtract: ['$field3', 3600000]
              }
            },
            ___field3_dayofweek: {
              $subtract: [{
                $dayOfWeek: {
                  $subtract: ['$field3', 3600000]
                }
              }, 1]
            },
            ___field3_quarter: {
              $divide: [{
                $subtract: ['$___field3_mp2', {
                  $mod: ['$___field3_mp2', 3]
                }]
              }, 3]
            },
            ___field4_month: {
              $month: {
                $subtract: ['$field4', 3600000]
              }
            }
          }
        }],
        nestedFields: ['___field2_year', '___field3_mp2', '___field3_quarter', '___field4_month', '___field3_day', '___field3_dayofweek']
      });
    });
  });

  suite('createCompleteFilterPipeline', function () {
    test('works', function () {
      assert.deepEqual(createCompleteFilterPipeline('thing', '=', 42, [['thing2', '>', 13], 'and', ['date.month', '<', 5]], { timezoneOffset: 60 }), {
        pipeline: [{
          $addFields: {
            ___date_month: {
              $month: {
                $subtract: ['$date', 3600000]
              }
            }
          }
        }, {
          $match: {
            thing: {
              $eq: 42
            }
          }
        }, {
          $match: {
            $and: [{
              thing2: {
                $gt: 13
              }
            }, {
              ___date_month: {
                $lt: 5
              }
            }]
          }
        }],
        nestedFields: ['___date_month']
      });
    });
  });

  suite('createRemoveNestedFieldsPipeline', function () {
    test('works', function () {
      assert.deepEqual(createRemoveNestedFieldsPipeline(['field1', 'field2']), [{ $project: { field1: 0, field2: 0 } }]);
    });
  });

  suite('correctFilterOperatorStructure', function () {
    test('detect correct structure', function () {
      assert.isTrue(isCorrectFilterOperatorStructure([['field', '=', 42], 'and', ['field2', '>', 10], 'and', ['field3', '=', 15], 'and', ['field4', '=', 11], 'and', ['field8', '>', 100]], 'and'));
    });

    test('reject missing operators', function () {
      assert.isFalse(isCorrectFilterOperatorStructure([['field', '=', 42], 'and', ['field2', '>', 10], ['field3', '=', 15], 'and', ['field4', '=', 11], 'and', ['field8', '>', 100]], 'and'));
    });

    test('reject incorrect operators', function () {
      assert.isFalse(isCorrectFilterOperatorStructure([['field', '=', 42], 'and', ['field2', '>', 10], 'or', ['field3', '=', 15], 'and', ['field4', '=', 11], 'and', ['field8', '>', 100]], 'and'));
    });
  });

  suite('andChainWithIncompleteAnds', function () {
    test('detect short "and" chain with no "ands"', function () {
      assert.isTrue(isAndChainWithIncompleteAnds([['field', '=', 42], ['field2', '>', 10]]));
    });
    test('detect three element "and" chain with no "ands"', function () {
      assert.isTrue(isAndChainWithIncompleteAnds([['field', '=', 42], ['field2', '>', 10], ['field3', '=', 15]]));
    });
    test('detect long "and" chain with no "ands"', function () {
      assert.isTrue(isAndChainWithIncompleteAnds([['field', '=', 42], ['field2', '>', 10], ['field3', '=', 15], ['field4', '=', 11], ['field8', '>', 100]]));
    });
    test('detect long "and" chain with one "and"', function () {
      assert.isTrue(isAndChainWithIncompleteAnds([['field', '=', 42], 'and', ['field2', '>', 10], ['field3', '=', 15], ['field4', '=', 11], ['field8', '>', 100]]));
    });
    test('detect long "and" chain with some "ands"', function () {
      assert.isTrue(isAndChainWithIncompleteAnds([['field', '=', 42], ['field2', '>', 10], ['field3', '=', 15], 'and', ['field4', '=', 11], ['field8', '>', 100], 'and', ['field5', '=', 13]]));
    });

    test('reject unary operator chain', function () {
      assert.isFalse(isAndChainWithIncompleteAnds(['!', ['field', '=', 10]]));
    });

    test('reject simple criterion', function () {
      assert.isFalse(isAndChainWithIncompleteAnds(['field', '=', 10]));
    });

    test('reject chain with invalid operators', function () {
      assert.isFalse(isAndChainWithIncompleteAnds([['field', '=', 42], ['field2', '>', 10], ['field3', '=', 15], 'or', ['field4', '=', 11], ['field8', '>', 100]]));
    });

    test('reject chain with complete set of operators', function () {
      assert.isFalse(isAndChainWithIncompleteAnds([['field', '=', 42], 'and', ['field2', '>', 10], 'and', ['field3', '=', 15], 'and', ['field4', '=', 11], 'and', ['field8', '>', 100]]));
    });

    test('fix incomplete very short "and" chain with no "ands"', function () {
      assert.deepEqual(fixAndChainWithIncompleteAnds([['field', '=', 42], ['field2', '>', 10]]), [['field', '=', 42], 'and', ['field2', '>', 10]]);
    });

    test('fix incomplete short "and" chain with no "ands"', function () {
      assert.deepEqual(fixAndChainWithIncompleteAnds([['field', '=', 42], ['field2', '>', 10], ['field3', '=', 15]]), [['field', '=', 42], 'and', ['field2', '>', 10], 'and', ['field3', '=', 15]]);
    });

    test('fix incomplete long "and" chain with no "ands"', function () {
      assert.deepEqual(fixAndChainWithIncompleteAnds([['field', '=', 42], ['field2', '>', 10], ['field3', '=', 15], ['field4', '>', 42], ['field5', '=', 'something']]), [['field', '=', 42], 'and', ['field2', '>', 10], 'and', ['field3', '=', 15], 'and', ['field4', '>', 42], 'and', ['field5', '=', 'something']]);
    });

    test('fix incomplete long "and" chain with one "and"', function () {
      assert.deepEqual(fixAndChainWithIncompleteAnds([['field', '=', 42], 'and', ['field2', '>', 10], ['field3', '=', 15], ['field4', '>', 42], ['field5', '=', 'something']]), [['field', '=', 42], 'and', ['field2', '>', 10], 'and', ['field3', '=', 15], 'and', ['field4', '>', 42], 'and', ['field5', '=', 'something']]);
    });

    test('fix incomplete long "and" chain with some "ands"', function () {
      assert.deepEqual(fixAndChainWithIncompleteAnds([['field', '=', 42], 'and', ['field2', '>', 10], ['field3', '=', 15], 'and', ['field4', '>', 42], ['field5', '=', 'something']]), [['field', '=', 42], 'and', ['field2', '>', 10], 'and', ['field3', '=', 15], 'and', ['field4', '>', 42], 'and', ['field5', '=', 'something']]);
    });
  });
});