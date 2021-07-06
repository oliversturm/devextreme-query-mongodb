'use strict';

var chai = require('chai');
var expect = chai.expect;

var _require = require('mongodb'),
    MongoClient = _require.MongoClient,
    ObjectId = _require.ObjectId;

var query = require('.');

var TESTRECORD_COUNT = 100;

var initClient = function initClient() {
  return MongoClient.connect('mongodb://localhost:27017/dxtqutests', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
};

function testQueryValues(tdone, loadOptions, test, getTestDataPromises, contextOptions) {
  function date(start, addDays) {
    return new Date(start + addDays * (24 * 60 * 60 * 1000));
  }

  initClient().then(function (client) {
    return client.db().dropDatabase().then(function () {
      var values = client.db().collection('values');
      var currentYear = 2017;
      var currentYearStart = new Date(currentYear, 0, 1).valueOf();
      var nextYearStart = new Date(currentYear + 1, 0, 1).valueOf();

      return Promise.all(getTestDataPromises ? getTestDataPromises(values) : Array.from(new Array(TESTRECORD_COUNT), function (v, i) {
        return i;
      }).map(function (n) {
        return values.insertOne({
          date1: date(currentYearStart, n),
          date2: date(nextYearStart, n),
          int1: n % 10,
          int2: n % 5,
          string: 'Item ' + n
        });
      })).then(function () {
        return query(values, loadOptions, contextOptions);
      }).then(test);
    }).then(function () {
      return client.close();
    }).then(tdone);
  }).catch(function (err) {
    return tdone(err);
  });
}

suite('query-values', function () {
  suite('#aggregateOptions', function () {
    test('collation', function (tdone) {
      testQueryValues(tdone, { sort: [{ selector: 'string' }], requireTotalCount: true }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(2);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(2);
        expect(res.data[0].string).to.eql('something');
        expect(res.data[1].string).to.eql('Something');
      }, function (collection) {
        return [collection.insertOne({
          string: 'something'
        }), collection.insertOne({
          string: 'Something'
        })];
      }, {
        aggregateOptions: {
          collation: { locale: 'en', caseFirst: 'lower' }
        }
      });
    });

    test('collation dynamic', function (tdone) {
      testQueryValues(tdone, { sort: [{ selector: 'string' }], requireTotalCount: true }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(2);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(2);
        expect(res.data[0].string).to.eql('something');
        expect(res.data[1].string).to.eql('Something');
      }, function (collection) {
        return [collection.insertOne({
          string: 'something'
        }), collection.insertOne({
          string: 'Something'
        })];
      }, {
        dynamicAggregateOptions: function dynamicAggregateOptions(identifier) {
          return identifier === 'mainQueryResult' ? {
            collation: { locale: 'en', caseFirst: 'lower' }
          } : {};
        }
      });
    });
  });

  suite('#entitiesQuery.values', function () {
    test('list should retrieve all entities', function (tdone) {
      testQueryValues(tdone, {
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'result').to.have.lengthOf(TESTRECORD_COUNT);
      });
    });

    test('list should accept skip', function (tdone) {
      testQueryValues(tdone, {
        skip: 5,
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount).to.eql(TESTRECORD_COUNT);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'result').to.have.lengthOf(TESTRECORD_COUNT - 5);
      });
    });

    test('list should accept take', function (tdone) {
      testQueryValues(tdone, {
        take: 5,
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount).to.eql(TESTRECORD_COUNT);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'result').to.have.lengthOf(5);
      });
    });

    test('list should sort ascending', function (tdone) {
      testQueryValues(tdone, {
        take: 5,
        sort: [{
          selector: 'int1',
          desc: false
        }]
      }, function (res) {
        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'result').to.have.lengthOf(5);
        expect(res.data[0].int1).to.eql(0);
        expect(res.data[1].int1).to.eql(0);
        expect(res.data[2].int1).to.eql(0);
        expect(res.data[3].int1).to.eql(0);
        expect(res.data[4].int1).to.eql(0);
      });
    });

    test('list should sort descending', function (tdone) {
      testQueryValues(tdone, {
        take: 5,
        sort: [{
          selector: 'int1',
          desc: true
        }]
      }, function (res) {
        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'result').to.have.lengthOf(5);
        expect(res.data[0].int1).to.eql(9);
        expect(res.data[1].int1).to.eql(9);
        expect(res.data[2].int1).to.eql(9);
        expect(res.data[3].int1).to.eql(9);
        expect(res.data[4].int1).to.eql(9);
      });
    });

    test('list should sort by two fields', function (tdone) {
      testQueryValues(tdone, {
        take: 20,
        sort: [{
          selector: 'int2',
          desc: true
        }, { selector: 'int1', desc: false }]
      }, function (res) {

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'result').to.have.lengthOf(20);
        expect(res.data[0].int2).to.eql(4);
        expect(res.data[1].int2).to.eql(4);
        expect(res.data[2].int2).to.eql(4);
        expect(res.data[3].int2).to.eql(4);
        expect(res.data[4].int2).to.eql(4);
        expect(res.data[5].int2).to.eql(4);
        expect(res.data[6].int2).to.eql(4);
        expect(res.data[7].int2).to.eql(4);
        expect(res.data[8].int2).to.eql(4);
        expect(res.data[9].int2).to.eql(4);
        expect(res.data[10].int2).to.eql(4);
        expect(res.data[11].int2).to.eql(4);
        expect(res.data[12].int2).to.eql(4);
        expect(res.data[13].int2).to.eql(4);
        expect(res.data[14].int2).to.eql(4);
        expect(res.data[15].int2).to.eql(4);
        expect(res.data[16].int2).to.eql(4);
        expect(res.data[17].int2).to.eql(4);
        expect(res.data[18].int2).to.eql(4);
        expect(res.data[19].int2).to.eql(4);

        expect(res.data[0].int1).to.eql(4);
        expect(res.data[1].int1).to.eql(4);
        expect(res.data[2].int1).to.eql(4);
        expect(res.data[3].int1).to.eql(4);
        expect(res.data[4].int1).to.eql(4);
        expect(res.data[5].int1).to.eql(4);
        expect(res.data[6].int1).to.eql(4);
        expect(res.data[7].int1).to.eql(4);
        expect(res.data[8].int1).to.eql(4);
        expect(res.data[9].int1).to.eql(4);
        expect(res.data[10].int1).to.eql(9);
        expect(res.data[11].int1).to.eql(9);
        expect(res.data[12].int1).to.eql(9);
        expect(res.data[13].int1).to.eql(9);
        expect(res.data[14].int1).to.eql(9);
        expect(res.data[15].int1).to.eql(9);
        expect(res.data[16].int1).to.eql(9);
        expect(res.data[17].int1).to.eql(9);
        expect(res.data[18].int1).to.eql(9);
        expect(res.data[19].int1).to.eql(9);
      });
    });

    test('list should filter with =', function (tdone) {
      testQueryValues(tdone, {
        filter: ['int1', '=', 3],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(10);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(10);
      });
    });

    test('list should filter with multiple criteria', function (tdone) {
      testQueryValues(tdone, {
        filter: [['int1', '=', 3], 'or', ['int1', '=', 5]],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(20);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(20);
      });
    });

    test('list should search with =', function (tdone) {
      testQueryValues(tdone, {
        searchExpr: 'int1',
        searchOperation: '=',
        searchValue: 3,
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(10);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(10);
      });
    });

    test('list should project with select', function (tdone) {
      testQueryValues(tdone, {
        filter: ['int1', '=', 3],
        requireTotalCount: false,
        select: ['int2', 'date1']
      }, function (res) {

        expect(res.data[0]).to.have.ownProperty('_id');
        expect(res.data[0]).to.have.ownProperty('int2');
        expect(res.data[0]).to.have.ownProperty('date1');

        expect(res.data[0]).to.not.have.ownProperty('int1');
        expect(res.data[0]).to.not.have.ownProperty('date2');
        expect(res.data[0]).to.not.have.ownProperty('string');
      });
    });

    test('list should search with multiple fields', function (tdone) {
      testQueryValues(tdone, {
        searchExpr: ['int1', 'int2'],
        searchOperation: '=',
        searchValue: 3,
        requireTotalCount: true
      }, function (res) {

        expect(res.totalCount, 'totalCount').to.eql(20);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(20);
      });
    });

    test('list should filter with <', function (tdone) {
      testQueryValues(tdone, {
        filter: ['int1', '<', 5],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(50);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(50);
      });
    });

    test('list should filter with date.Month and nested array', function (tdone) {
      testQueryValues(tdone, {
        filter: [['date1.Month', '<=', 2]],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(59);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(59);
      });
    });

    test('list should filter with date.Quarter', function (tdone) {
      testQueryValues(tdone, {
        filter: ['date1.quarter', '=', 2],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(10);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(10);

        expect(res.data[0].date1, 'date1').to.be.a('date');
        expect(res.data[0].date2, 'date2').to.be.a('date');
        expect(res.data[0].int1, 'int1').to.be.a('number');
        expect(res.data[0].int2, 'int2').to.be.a('number');
        expect(res.data[0].string, 'string').to.be.a('string');
        expect(res.data[0].___date1_mp2, '___date1_mp2').to.be.undefined;
        expect(res.data[0].___date1_quarter, '___date1_quarter').to.be.undefined;
      });
    });

    test('list should filter and group (sample 1)', function (tdone) {
      testQueryValues(tdone, {
        filter: [['date2.Month', '>=', 4], 'and', ['date2.Month', '<', 7]],
        group: [{
          groupInterval: 'month',
          isExpanded: false,
          selector: 'date1'
        }],
        groupSummary: [{
          selector: 'int1',
          summaryType: 'sum'
        }],
        totalSummary: [{
          selector: 'int1',
          summaryType: 'sum'
        }],
        requireTotalCount: true
      }, function (res) {

        expect(res.totalCount, 'totalCount').to.eql(10);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(1);

        expect(res.summary[0], 'summary value').to.eql(45);
      });
    });

    test('list should group and filter by quarter without extra fields', function (tdone) {
      testQueryValues(tdone, {
        filter: [['date2.quarter', '=', 1]],
        group: [{
          groupInterval: 'month',
          isExpanded: true,
          selector: 'date1'
        }],
        requireTotalCount: true
      }, function (res) {

        expect(res.totalCount, 'totalCount').to.eql(90);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(3);

        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = res.data[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var group = _step.value;

            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, 'group(' + group.key + ').items').to.be.instanceof(Array);
            expect(group.items, 'group(' + group.key + ') items list').to.have.length.of.at.least(10);
            expect(group.count, 'group(' + group.key + ').count').to.eql(group.items.length);

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
              for (var _iterator2 = group.items[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var item = _step2.value;

                expect(item.___date2_mp2, 'item.___date2_mp2').to.be.undefined;
                expect(item.___date2_quarter, 'item.___date2_quarter').to.be.undefined;
              }
            } catch (err) {
              _didIteratorError2 = true;
              _iteratorError2 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion2 && _iterator2.return) {
                  _iterator2.return();
                }
              } finally {
                if (_didIteratorError2) {
                  throw _iteratorError2;
                }
              }
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }
      });
    });

    test('list should filter with endswith', function (tdone) {
      testQueryValues(tdone, {
        filter: ['string', 'endswith', '23'],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(1);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(1);
      });
    });

    test('prefer metadata count with filter', function (tdone) {
      testQueryValues(tdone, {
        filter: ['string', 'contains', '7'],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(19);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(19);
      }, undefined, { preferMetadataCount: true });
    });

    test('prefer metadata count without filter', function (tdone) {
      testQueryValues(tdone, {
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
      }, undefined, { preferMetadataCount: true });
    });

    test('list should filter with contains', function (tdone) {
      testQueryValues(tdone, {
        filter: ['string', 'contains', 'Item'],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(TESTRECORD_COUNT);
      });
    });

    test('list should filter with contains (case insensitive)', function (tdone) {
      testQueryValues(tdone, {
        filter: ['string', 'contains', 'item'],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(TESTRECORD_COUNT);
      });
    });

    test('list should filter with contains (case sensitive!)', function (tdone) {
      testQueryValues(tdone, {
        filter: ['string', 'contains', 'Something'],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(1);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(1);
      }, function (collection) {
        return [collection.insertOne({
          string: 'something'
        }), collection.insertOne({
          string: 'Something'
        })];
      }, { caseInsensitiveRegex: false });
    });

    test('list should filter with endswith, no results', function (tdone) {
      testQueryValues(tdone, {
        filter: ['string', 'endswith', "something that doesn't exist"],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(0);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(0);
      });
    });

    test('list should filter with endswith, no results, total summary defined', function (tdone) {
      testQueryValues(tdone, {
        filter: ['string', 'endswith', "something that doesn't exist"],
        totalSummary: [{
          selector: 'int1',
          summaryType: 'sum'
        }],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(0);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'list length').to.have.lengthOf(0);

        expect(res.summary, 'res.summary').to.be.undefined;
      });
    });

    test('list should calculate total summaries for simple queries', function (tdone) {
      testQueryValues(tdone, {
        filter: ['int1', '<', 5],
        totalSummary: [{
          selector: 'int1',
          summaryType: 'sum'
        }, {
          selector: 'int2',
          summaryType: 'max'
        }],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(50);

        expect(res.summary, 'res.summary').to.be.instanceof(Array);
        expect(res.summary, 'res.summary').to.have.lengthOf(2);
        expect(res.summary[0], 'sum(int1)').to.eql(100);
        expect(res.summary[1], 'max(int2)').to.eql(4);
      });
    });

    test('list should group with items', function (tdone) {
      testQueryValues(tdone, {
        group: [{
          selector: 'int1',
          desc: false,
          isExpanded: true
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
        expect(res.groupCount, 'groupCount').to.eql(10);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(10);

        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = res.data[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            var group = _step3.value;

            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, 'group(' + group.key + ').items').to.be.instanceof(Array);
            expect(group.items, 'group(' + group.key + ') items list').to.have.lengthOf(10);
            expect(group.count, 'group(' + group.key + ').count').to.eql(group.items.length);

            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
              for (var _iterator4 = group.items[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                var item = _step4.value;

                expect(item.int1, 'item.int1').to.eql(group.key);
              }
            } catch (err) {
              _didIteratorError4 = true;
              _iteratorError4 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion4 && _iterator4.return) {
                  _iterator4.return();
                }
              } finally {
                if (_didIteratorError4) {
                  throw _iteratorError4;
                }
              }
            }
          }
        } catch (err) {
          _didIteratorError3 = true;
          _iteratorError3 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion3 && _iterator3.return) {
              _iterator3.return();
            }
          } finally {
            if (_didIteratorError3) {
              throw _iteratorError3;
            }
          }
        }
      });
    });

    test('list should group with items and select', function (tdone) {
      testQueryValues(tdone, {
        group: [{
          selector: 'int1',
          desc: false,
          isExpanded: true
        }],
        select: ['int2', 'date1']
      }, function (res) {

        var x = res.data[0].items[0];

        expect(x).to.have.ownProperty('_id');
        expect(x).to.have.ownProperty('int2');
        expect(x).to.have.ownProperty('date1');

        expect(x).to.not.have.ownProperty('int1');
        expect(x).to.not.have.ownProperty('date2');
        expect(x).to.not.have.ownProperty('string');
      });
    });

    test('list should group with items and secondary sort', function (tdone) {
      testQueryValues(tdone, {
        filter: ['int2', '=', 3],
        group: [{
          selector: 'int2',
          desc: false,
          isExpanded: true
        }],
        sort: [{
          selector: 'int1',
          desc: true
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(20);
        expect(res.groupCount, 'groupCount').to.eql(1);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(1);

        var _iteratorNormalCompletion5 = true;
        var _didIteratorError5 = false;
        var _iteratorError5 = undefined;

        try {
          for (var _iterator5 = res.data[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
            var group = _step5.value;


            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, 'group(' + group.key + ').items').to.be.instanceof(Array);
            expect(group.items, 'group(' + group.key + ') items list').to.have.lengthOf(20);

            for (var i = 0; i <= 9; i++) {
              expect(group.items[i].int1, 'groupitem ' + i).to.eql(8);
            }
            for (var _i = 10; _i <= 19; _i++) {
              expect(group.items[_i].int1, 'groupitem ' + _i).to.eql(3);
            }
          }
        } catch (err) {
          _didIteratorError5 = true;
          _iteratorError5 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion5 && _iterator5.return) {
              _iterator5.return();
            }
          } finally {
            if (_didIteratorError5) {
              throw _iteratorError5;
            }
          }
        }
      });
    });

    test('list should group without items', function (tdone) {
      testQueryValues(tdone, {
        group: [{
          selector: 'int1',
          desc: false
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
        expect(res.groupCount, 'groupCount').to.eql(10);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(10);

        var _iteratorNormalCompletion6 = true;
        var _didIteratorError6 = false;
        var _iteratorError6 = undefined;

        try {
          for (var _iterator6 = res.data[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
            var group = _step6.value;

            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, 'group(' + group.key + ').items').to.be.null;
            expect(group.count, 'group(' + group.key + ').count').to.eql(10);
          }
        } catch (err) {
          _didIteratorError6 = true;
          _iteratorError6 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion6 && _iterator6.return) {
              _iterator6.return();
            }
          } finally {
            if (_didIteratorError6) {
              throw _iteratorError6;
            }
          }
        }
      });
    });

    test('list should group without items, with filter', function (tdone) {
      testQueryValues(tdone, {
        filter: ['int1', '=', 3],
        group: [{
          selector: 'int1',
          desc: false
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(10);
        expect(res.groupCount, 'groupCount').to.eql(1);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(1);

        var _iteratorNormalCompletion7 = true;
        var _didIteratorError7 = false;
        var _iteratorError7 = undefined;

        try {
          for (var _iterator7 = res.data[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
            var group = _step7.value;

            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, 'group(' + group.key + ').items').to.be.null;
            expect(group.count, 'group(' + group.key + ').count').to.eql(10);
          }
        } catch (err) {
          _didIteratorError7 = true;
          _iteratorError7 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion7 && _iterator7.return) {
              _iterator7.return();
            }
          } finally {
            if (_didIteratorError7) {
              throw _iteratorError7;
            }
          }
        }
      });
    });

    test('list should group without items, with complex filter', function (tdone) {
      testQueryValues(tdone, {
        filter: [['int1', '=', 3], 'or', ['int1', '=', 5], 'or', ['int1', '=', 7]],
        group: [{
          selector: 'int1',
          desc: false
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(30);
        expect(res.groupCount, 'groupCount').to.eql(3);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(3);

        var _iteratorNormalCompletion8 = true;
        var _didIteratorError8 = false;
        var _iteratorError8 = undefined;

        try {
          for (var _iterator8 = res.data[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
            var group = _step8.value;

            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, 'group(' + group.key + ').items').to.be.null;
            expect(group.count, 'group(' + group.key + ').count').to.eql(10);
          }
        } catch (err) {
          _didIteratorError8 = true;
          _iteratorError8 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion8 && _iterator8.return) {
              _iterator8.return();
            }
          } finally {
            if (_didIteratorError8) {
              throw _iteratorError8;
            }
          }
        }
      });
    });

    test('list should group with items, with complex filter', function (tdone) {
      testQueryValues(tdone, {
        filter: [['int1', '=', 3], 'or', ['int1', '=', 5], 'or', ['int1', '=', 7]],
        group: [{
          selector: 'int1',
          desc: false,
          isExpanded: true
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(30);
        expect(res.groupCount, 'groupCount').to.eql(3);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(3);

        var _iteratorNormalCompletion9 = true;
        var _didIteratorError9 = false;
        var _iteratorError9 = undefined;

        try {
          for (var _iterator9 = res.data[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
            var group = _step9.value;

            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, 'group(' + group.key + ').items').to.be.instanceof(Array);

            expect(group.items, 'group items list').to.have.lengthOf(10);
            expect(group.count, 'group(' + group.key + ').count').to.eql(group.items.length);

            var _iteratorNormalCompletion10 = true;
            var _didIteratorError10 = false;
            var _iteratorError10 = undefined;

            try {
              for (var _iterator10 = group.items[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
                var item = _step10.value;

                expect(item.int1, 'item.int1').to.eql(group.key);
              }
            } catch (err) {
              _didIteratorError10 = true;
              _iteratorError10 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion10 && _iterator10.return) {
                  _iterator10.return();
                }
              } finally {
                if (_didIteratorError10) {
                  throw _iteratorError10;
                }
              }
            }
          }
        } catch (err) {
          _didIteratorError9 = true;
          _iteratorError9 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion9 && _iterator9.return) {
              _iterator9.return();
            }
          } finally {
            if (_didIteratorError9) {
              throw _iteratorError9;
            }
          }
        }
      });
    });

    test('list should group two levels with bottom-level items', function (tdone) {
      testQueryValues(tdone, {
        filter: [[['int1', '=', 3], 'or', ['int1', '=', 6]], 'and', [['int2', '=', 3], 'or', ['int2', '=', 1]]],
        group: [{
          selector: 'int1',
          desc: false,
          isExpanded: false
        }, {
          selector: 'int2',
          desc: false,
          isExpanded: true
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {

        expect(res.totalCount, 'totalCount').to.eql(20);
        expect(res.groupCount, 'groupCount').to.eql(2);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(2);

        var _iteratorNormalCompletion11 = true;
        var _didIteratorError11 = false;
        var _iteratorError11 = undefined;

        try {
          for (var _iterator11 = res.data[Symbol.iterator](), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
            var group1 = _step11.value;

            expect(group1.key, 'group1.key').to.not.be.undefined;
            expect(group1.items, 'group1(' + group1.key + ').items').to.be.instanceof(Array);

            expect(group1.items, 'group1 items list').to.have.lengthOf(1);
            expect(group1.count, 'group(' + group1.key + ').count').to.eql(group1.items.length);

            var _iteratorNormalCompletion12 = true;
            var _didIteratorError12 = false;
            var _iteratorError12 = undefined;

            try {
              for (var _iterator12 = group1.items[Symbol.iterator](), _step12; !(_iteratorNormalCompletion12 = (_step12 = _iterator12.next()).done); _iteratorNormalCompletion12 = true) {
                var group2 = _step12.value;

                expect(group2.key, 'group2.key').to.not.be.undefined;
                expect(group2.items, 'group2(' + group2.key + ').items').to.be.instanceof(Array);

                expect(group2.items, 'group2 items list').to.have.lengthOf(10);
                expect(group2.count, 'group(' + group2.key + ').count').to.eql(group2.items.length);
                var _iteratorNormalCompletion13 = true;
                var _didIteratorError13 = false;
                var _iteratorError13 = undefined;

                try {
                  for (var _iterator13 = group2.items[Symbol.iterator](), _step13; !(_iteratorNormalCompletion13 = (_step13 = _iterator13.next()).done); _iteratorNormalCompletion13 = true) {
                    var item = _step13.value;

                    expect(item.int1, 'item.int1').to.eql(group1.key);
                    expect(item.int2, 'item.int2').to.eql(group2.key);
                  }
                } catch (err) {
                  _didIteratorError13 = true;
                  _iteratorError13 = err;
                } finally {
                  try {
                    if (!_iteratorNormalCompletion13 && _iterator13.return) {
                      _iterator13.return();
                    }
                  } finally {
                    if (_didIteratorError13) {
                      throw _iteratorError13;
                    }
                  }
                }
              }
            } catch (err) {
              _didIteratorError12 = true;
              _iteratorError12 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion12 && _iterator12.return) {
                  _iterator12.return();
                }
              } finally {
                if (_didIteratorError12) {
                  throw _iteratorError12;
                }
              }
            }
          }
        } catch (err) {
          _didIteratorError11 = true;
          _iteratorError11 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion11 && _iterator11.return) {
              _iterator11.return();
            }
          } finally {
            if (_didIteratorError11) {
              throw _iteratorError11;
            }
          }
        }
      });
    });

    test('list should group two levels without bottom-level items', function (tdone) {
      testQueryValues(tdone, {
        filter: [[['int1', '=', 3], 'or', ['int1', '=', 6]], 'and', [['int2', '=', 3], 'or', ['int2', '=', 1]]],
        group: [{
          selector: 'int1',
          desc: false,
          isExpanded: false
        }, {
          selector: 'int2',
          desc: false,
          isExpanded: false
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {

        expect(res.totalCount, 'totalCount').to.eql(20);
        expect(res.groupCount, 'groupCount').to.eql(2);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(2);

        var _iteratorNormalCompletion14 = true;
        var _didIteratorError14 = false;
        var _iteratorError14 = undefined;

        try {
          for (var _iterator14 = res.data[Symbol.iterator](), _step14; !(_iteratorNormalCompletion14 = (_step14 = _iterator14.next()).done); _iteratorNormalCompletion14 = true) {
            var group1 = _step14.value;

            expect(group1.key, 'group1.key').to.not.be.undefined;
            expect(group1.items, 'group1(' + group1.key + ').items').to.be.instanceof(Array);

            expect(group1.items, 'group1 items list').to.have.lengthOf(1);
            expect(group1.count, 'group(' + group1.key + ').count').to.eql(group1.items.length);

            var _iteratorNormalCompletion15 = true;
            var _didIteratorError15 = false;
            var _iteratorError15 = undefined;

            try {
              for (var _iterator15 = group1.items[Symbol.iterator](), _step15; !(_iteratorNormalCompletion15 = (_step15 = _iterator15.next()).done); _iteratorNormalCompletion15 = true) {
                var group2 = _step15.value;

                expect(group2.key, 'group2.key').to.not.be.undefined;
                expect(group2.items, 'group2 items list').to.be.null;
                expect(group2.count, 'group(' + group2.key + ').count').to.eql(10);
              }
            } catch (err) {
              _didIteratorError15 = true;
              _iteratorError15 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion15 && _iterator15.return) {
                  _iterator15.return();
                }
              } finally {
                if (_didIteratorError15) {
                  throw _iteratorError15;
                }
              }
            }
          }
        } catch (err) {
          _didIteratorError14 = true;
          _iteratorError14 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion14 && _iterator14.return) {
              _iterator14.return();
            }
          } finally {
            if (_didIteratorError14) {
              throw _iteratorError14;
            }
          }
        }
      });
    });

    test('list should group three levels without  items', function (tdone) {
      testQueryValues(tdone, {
        group: [{
          selector: 'int1',
          isExpanded: false
        }, {
          selector: 'int2',
          isExpanded: false
        }, {
          selector: 'string',
          isExpanded: false
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res).to.deep.eql({
          data: [{
            key: 0,
            items: [{
              key: 0,
              items: [{
                count: 1,
                key: 'Item 0',
                items: null
              }, {
                count: 1,
                key: 'Item 10',
                items: null
              }, {
                count: 1,
                key: 'Item 20',
                items: null
              }, {
                count: 1,
                key: 'Item 30',
                items: null
              }, {
                count: 1,
                key: 'Item 40',
                items: null
              }, {
                count: 1,
                key: 'Item 50',
                items: null
              }, {
                count: 1,
                key: 'Item 60',
                items: null
              }, {
                count: 1,
                key: 'Item 70',
                items: null
              }, {
                count: 1,
                key: 'Item 80',
                items: null
              }, {
                count: 1,
                key: 'Item 90',
                items: null
              }],
              count: 10
            }],
            count: 1
          }, {
            key: 1,
            items: [{
              key: 1,
              items: [{
                count: 1,
                key: 'Item 1',
                items: null
              }, {
                count: 1,
                key: 'Item 11',
                items: null
              }, {
                count: 1,
                key: 'Item 21',
                items: null
              }, {
                count: 1,
                key: 'Item 31',
                items: null
              }, {
                count: 1,
                key: 'Item 41',
                items: null
              }, {
                count: 1,
                key: 'Item 51',
                items: null
              }, {
                count: 1,
                key: 'Item 61',
                items: null
              }, {
                count: 1,
                key: 'Item 71',
                items: null
              }, {
                count: 1,
                key: 'Item 81',
                items: null
              }, {
                count: 1,
                key: 'Item 91',
                items: null
              }],
              count: 10
            }],
            count: 1
          }, {
            key: 2,
            items: [{
              key: 2,
              items: [{
                count: 1,
                key: 'Item 12',
                items: null
              }, {
                count: 1,
                key: 'Item 2',
                items: null
              }, {
                count: 1,
                key: 'Item 22',
                items: null
              }, {
                count: 1,
                key: 'Item 32',
                items: null
              }, {
                count: 1,
                key: 'Item 42',
                items: null
              }, {
                count: 1,
                key: 'Item 52',
                items: null
              }, {
                count: 1,
                key: 'Item 62',
                items: null
              }, {
                count: 1,
                key: 'Item 72',
                items: null
              }, {
                count: 1,
                key: 'Item 82',
                items: null
              }, {
                count: 1,
                key: 'Item 92',
                items: null
              }],
              count: 10
            }],
            count: 1
          }, {
            key: 3,
            items: [{
              key: 3,
              items: [{
                count: 1,
                key: 'Item 13',
                items: null
              }, {
                count: 1,
                key: 'Item 23',
                items: null
              }, {
                count: 1,
                key: 'Item 3',
                items: null
              }, {
                count: 1,
                key: 'Item 33',
                items: null
              }, {
                count: 1,
                key: 'Item 43',
                items: null
              }, {
                count: 1,
                key: 'Item 53',
                items: null
              }, {
                count: 1,
                key: 'Item 63',
                items: null
              }, {
                count: 1,
                key: 'Item 73',
                items: null
              }, {
                count: 1,
                key: 'Item 83',
                items: null
              }, {
                count: 1,
                key: 'Item 93',
                items: null
              }],
              count: 10
            }],
            count: 1
          }, {
            key: 4,
            items: [{
              key: 4,
              items: [{
                count: 1,
                key: 'Item 14',
                items: null
              }, {
                count: 1,
                key: 'Item 24',
                items: null
              }, {
                count: 1,
                key: 'Item 34',
                items: null
              }, {
                count: 1,
                key: 'Item 4',
                items: null
              }, {
                count: 1,
                key: 'Item 44',
                items: null
              }, {
                count: 1,
                key: 'Item 54',
                items: null
              }, {
                count: 1,
                key: 'Item 64',
                items: null
              }, {
                count: 1,
                key: 'Item 74',
                items: null
              }, {
                count: 1,
                key: 'Item 84',
                items: null
              }, {
                count: 1,
                key: 'Item 94',
                items: null
              }],
              count: 10
            }],
            count: 1
          }, {
            key: 5,
            items: [{
              key: 0,
              items: [{
                count: 1,
                key: 'Item 15',
                items: null
              }, {
                count: 1,
                key: 'Item 25',
                items: null
              }, {
                count: 1,
                key: 'Item 35',
                items: null
              }, {
                count: 1,
                key: 'Item 45',
                items: null
              }, {
                count: 1,
                key: 'Item 5',
                items: null
              }, {
                count: 1,
                key: 'Item 55',
                items: null
              }, {
                count: 1,
                key: 'Item 65',
                items: null
              }, {
                count: 1,
                key: 'Item 75',
                items: null
              }, {
                count: 1,
                key: 'Item 85',
                items: null
              }, {
                count: 1,
                key: 'Item 95',
                items: null
              }],
              count: 10
            }],
            count: 1
          }, {
            key: 6,
            items: [{
              key: 1,
              items: [{
                count: 1,
                key: 'Item 16',
                items: null
              }, {
                count: 1,
                key: 'Item 26',
                items: null
              }, {
                count: 1,
                key: 'Item 36',
                items: null
              }, {
                count: 1,
                key: 'Item 46',
                items: null
              }, {
                count: 1,
                key: 'Item 56',
                items: null
              }, {
                count: 1,
                key: 'Item 6',
                items: null
              }, {
                count: 1,
                key: 'Item 66',
                items: null
              }, {
                count: 1,
                key: 'Item 76',
                items: null
              }, {
                count: 1,
                key: 'Item 86',
                items: null
              }, {
                count: 1,
                key: 'Item 96',
                items: null
              }],
              count: 10
            }],
            count: 1
          }, {
            key: 7,
            items: [{
              key: 2,
              items: [{
                count: 1,
                key: 'Item 17',
                items: null
              }, {
                count: 1,
                key: 'Item 27',
                items: null
              }, {
                count: 1,
                key: 'Item 37',
                items: null
              }, {
                count: 1,
                key: 'Item 47',
                items: null
              }, {
                count: 1,
                key: 'Item 57',
                items: null
              }, {
                count: 1,
                key: 'Item 67',
                items: null
              }, {
                count: 1,
                key: 'Item 7',
                items: null
              }, {
                count: 1,
                key: 'Item 77',
                items: null
              }, {
                count: 1,
                key: 'Item 87',
                items: null
              }, {
                count: 1,
                key: 'Item 97',
                items: null
              }],
              count: 10
            }],
            count: 1
          }, {
            key: 8,
            items: [{
              key: 3,
              items: [{
                count: 1,
                key: 'Item 18',
                items: null
              }, {
                count: 1,
                key: 'Item 28',
                items: null
              }, {
                count: 1,
                key: 'Item 38',
                items: null
              }, {
                count: 1,
                key: 'Item 48',
                items: null
              }, {
                count: 1,
                key: 'Item 58',
                items: null
              }, {
                count: 1,
                key: 'Item 68',
                items: null
              }, {
                count: 1,
                key: 'Item 78',
                items: null
              }, {
                count: 1,
                key: 'Item 8',
                items: null
              }, {
                count: 1,
                key: 'Item 88',
                items: null
              }, {
                count: 1,
                key: 'Item 98',
                items: null
              }],
              count: 10
            }],
            count: 1
          }, {
            key: 9,
            items: [{
              key: 4,
              items: [{
                count: 1,
                key: 'Item 19',
                items: null
              }, {
                count: 1,
                key: 'Item 29',
                items: null
              }, {
                count: 1,
                key: 'Item 39',
                items: null
              }, {
                count: 1,
                key: 'Item 49',
                items: null
              }, {
                count: 1,
                key: 'Item 59',
                items: null
              }, {
                count: 1,
                key: 'Item 69',
                items: null
              }, {
                count: 1,
                key: 'Item 79',
                items: null
              }, {
                count: 1,
                key: 'Item 89',
                items: null
              }, {
                count: 1,
                key: 'Item 9',
                items: null
              }, {
                count: 1,
                key: 'Item 99',
                items: null
              }],
              count: 10
            }],
            count: 1
          }],
          groupCount: 10,
          totalCount: 100
        });
      });
    });

    test('list should calculate total summaries group query', function (tdone) {
      testQueryValues(tdone, {
        filter: [[['int1', '=', 3], 'or', ['int1', '=', 6]], 'and', [['int2', '=', 3], 'or', ['int2', '=', 1]]],
        group: [{
          selector: 'int1',
          desc: false,
          isExpanded: false
        }, {
          selector: 'int2',
          desc: false,
          isExpanded: false
        }],
        totalSummary: [{
          selector: 'int1',
          summaryType: 'sum'
        }, {
          selector: 'int2',
          summaryType: 'max'
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {

        expect(res.totalCount, 'totalCount').to.eql(20);
        expect(res.groupCount, 'groupCount').to.eql(2);

        expect(res.summary, 'res.summary').to.be.instanceof(Array);
        expect(res.summary, 'res.summary').to.have.lengthOf(2);
        expect(res.summary[0], 'sum(int1)').to.eql(90);
        expect(res.summary[1], 'max(int2)').to.eql(3);
      });
    });

    test('list should calculate group summaries', function (tdone) {
      testQueryValues(tdone, {
        filter: [['int1', '=', 3], 'or', ['int1', '=', 6]],
        group: [{
          selector: 'int1',
          desc: false,
          isExpanded: false
        }],
        groupSummary: [{
          selector: 'int1',
          summaryType: 'sum'
        }, {
          selector: 'int2',
          summaryType: 'max'
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {

        expect(res.totalCount, 'totalCount').to.eql(20);
        expect(res.groupCount, 'groupCount').to.eql(2);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(2);

        expect(res.data[0].summary, 'group1.summary').to.be.instanceof(Array);
        expect(res.data[0].summary, 'group1.summary').to.have.lengthOf(2);
        expect(res.data[0].summary[0], 'group1.sum(int1)').to.eql(30);
        expect(res.data[0].summary[1], 'group1.max(int2)').to.eql(3);

        expect(res.data[1].summary, 'group2.summary').to.be.instanceof(Array);
        expect(res.data[1].summary, 'group2.summary').to.have.lengthOf(2);
        expect(res.data[1].summary[0], 'group2.sum(int1)').to.eql(60);
        expect(res.data[1].summary[1], 'group2.max(int2)').to.eql(1);
      });
    });

    test('list should group with groupInterval quarter', function (tdone) {
      testQueryValues(tdone, {
        group: [{
          selector: 'date1',
          groupInterval: 'quarter'
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
        expect(res.groupCount, 'groupCount').to.eql(2);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(2);

        expect(res.data[0].key, 'group 1.key').to.not.be.undefined;
        expect(res.data[0].items, 'group 1.items').to.be.null;
        expect(res.data[0].count, 'group 1.count').to.eql(90);
        expect(res.data[1].key, 'group 2.key').to.not.be.undefined;
        expect(res.data[1].items, 'group 2.items').to.be.null;
        expect(res.data[1].count, 'group 2.count').to.eql(10);
      });
    });

    test('list should group with groupInterval month', function (tdone) {
      testQueryValues(tdone, {
        group: [{
          selector: 'date1',
          groupInterval: 'month'
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
        expect(res.groupCount, 'groupCount').to.eql(4);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(4);

        expect(res.data[0].key, 'group 1.key').to.eql(1);
        expect(res.data[0].items, 'group 1.items').to.be.null;
        expect(res.data[0].count, 'group 1.count').to.eql(31);
        expect(res.data[1].key, 'group 2.key').to.eql(2);
        expect(res.data[1].items, 'group 2.items').to.be.null;
        expect(res.data[1].count, 'group 2.count').to.eql(28);
        expect(res.data[2].key, 'group 3.key').to.eql(3);
        expect(res.data[2].items, 'group 3.items').to.be.null;
        expect(res.data[2].count, 'group 3.count').to.eql(31);
        expect(res.data[3].key, 'group 4.key').to.eql(4);
        expect(res.data[3].items, 'group 4.items').to.be.null;
        expect(res.data[3].count, 'group 4.count').to.eql(10);
      });
    });

    test('list should group with groupInterval dayOfWeek', function (tdone) {
      testQueryValues(tdone, {
        group: [{
          selector: 'date1',
          groupInterval: 'dayOfWeek'
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
        expect(res.groupCount, 'groupCount').to.eql(7);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(7);
      });
    });

    test('list should group with groupInterval 2', function (tdone) {
      testQueryValues(tdone, {
        group: [{
          selector: 'int1',
          groupInterval: 2
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
        expect(res.groupCount, 'groupCount').to.eql(5);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(5);

        expect(res.data[0].key, 'group 1 key').to.eql(0);
        expect(res.data[0].count, 'group 1 count').to.eql(20);
        expect(res.data[1].key, 'group 2 key').to.eql(2);
        expect(res.data[1].count, 'group 2 count').to.eql(20);
        expect(res.data[2].key, 'group 3 key').to.eql(4);
        expect(res.data[2].count, 'group 3 count').to.eql(20);
        expect(res.data[3].key, 'group 4 key').to.eql(6);
        expect(res.data[3].count, 'group 4 count').to.eql(20);
        expect(res.data[4].key, 'group 5 key').to.eql(8);
        expect(res.data[4].count, 'group 5 count').to.eql(20);
      });
    });

    test('list should group with groupInterval quarter and summaries', function (tdone) {
      testQueryValues(tdone, {
        group: [{
          selector: 'date1',
          groupInterval: 'quarter'
        }],
        groupSummary: [{
          selector: 'int1',
          summaryType: 'count'
        }],
        totalSummary: [{
          selector: 'int1',
          summaryType: 'count'
        }],
        requireTotalCount: true,
        requireGroupCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
        expect(res.groupCount, 'groupCount').to.eql(2);

        expect(res.data, 'res.data').to.be.instanceof(Array);
        expect(res.data, 'group list length').to.have.lengthOf(2);

        expect(res.summary, 'res.summary').to.be.instanceof(Array);
        expect(res.summary, 'res.summary length').to.have.lengthOf(1);

        expect(res.data[0].key, 'group 1.key').to.not.be.undefined;
        expect(res.data[0].items, 'group 1.items').to.be.null;
        expect(res.data[0].count, 'group 1.count').to.eql(90);
        expect(res.data[0].summary, 'group 1 summary').to.be.instanceof(Array);
        expect(res.data[0].summary, 'group 1 summary length').to.have.lengthOf(1);

        expect(res.data[1].key, 'group 2.key').to.not.be.undefined;
        expect(res.data[1].items, 'group 2.items').to.be.null;
        expect(res.data[1].count, 'group 2.count').to.eql(10);
        expect(res.data[1].summary, 'group 2 summary').to.be.instanceof(Array);
        expect(res.data[1].summary, 'group 2 summary length').to.have.lengthOf(1);
      });
    });

    test('query should work correctly for May 1st 2017', function (tdone) {
      testQueryValues(tdone, {
        filter: ['date1', '=', new Date(2017, 4, 1)],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(1);
        expect(res.data).to.have.lengthOf(1);

        expect(new Date(res.data[0].date1)).to.eql(new Date(2017, 4, 1));
      }, function (collection) {
        return [collection.insertOne({
          date1: new Date(2017, 4, 1),
          date2: new Date(2017, 4, 1),
          int1: 10,
          int2: 10,
          string: 'something'
        })];
      });
    });

    test('equalsObjectId operator with ObjectId value', function (tdone) {
      var testId = ObjectId('0123456789abcdef01234567');
      testQueryValues(tdone, {
        filter: ['idField', 'equalsObjectId', testId],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(1);
      }, function (collection) {
        return [collection.insertOne({ idField: testId })];
      });
    });

    test('equalsObjectId operator with string value', function (tdone) {
      var testId = ObjectId('0123456789abcdef01234567');
      testQueryValues(tdone, {
        filter: ['idField', 'equalsObjectId', testId.toString()],
        requireTotalCount: true
      }, function (res) {
        expect(res.totalCount, 'totalCount').to.eql(1);
      }, function (collection) {
        return [collection.insertOne({ idField: testId })];
      });
    });
  });
});