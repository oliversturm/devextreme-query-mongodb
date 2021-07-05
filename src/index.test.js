/* global suite, test */
/* eslint-disable no-unused-expressions */

const chai = require('chai');
const expect = chai.expect;
const { MongoClient, ObjectId } = require('mongodb');

const query = require('.');

const TESTRECORD_COUNT = 100;

const initClient = () =>
  MongoClient.connect('mongodb://localhost:27017/dxtqutests', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

function testQueryValues(
  tdone,
  loadOptions,
  test,
  getTestDataPromises,
  contextOptions
) {
  function date(start, addDays) {
    return new Date(start + addDays * (24 * 60 * 60 * 1000));
  }

  initClient()
    .then(
      (client) =>
        /* eslint-disable promise/always-return, promise/no-nesting */
        client
          .db()
          .dropDatabase()
          .then(() => {
            const values = client.db().collection('values');
            const currentYear = 2017;
            const currentYearStart = new Date(currentYear, 0, 1).valueOf();
            const nextYearStart = new Date(currentYear + 1, 0, 1).valueOf();

            return Promise.all(
              getTestDataPromises
                ? getTestDataPromises(values)
                : Array.from(new Array(TESTRECORD_COUNT), (v, i) => i).map(
                    (n) =>
                      values.insertOne({
                        date1: date(currentYearStart, n),
                        date2: date(nextYearStart, n),
                        int1: n % 10,
                        int2: n % 5,
                        string: 'Item ' + n,
                      })
                  )
            )
              .then(() => query(values, loadOptions, contextOptions))
              .then(test);
          })

          .then(() => client.close())
          .then(tdone)
      /* eslint-enable promise/always-return, promise/no-nesting */
    )
    .catch((err) => tdone(err));
}

suite('query-values', function () {
  suite('#aggregateOptions', function () {
    // these tests are only to make sure that the aggregate setting
    // are passed through correctly to the aggregate calls
    test('collation', function (tdone) {
      testQueryValues(
        tdone,
        { sort: [{ selector: 'string' }], requireTotalCount: true },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(2);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(2);
          expect(res.data[0].string).to.eql('something');
          expect(res.data[1].string).to.eql('Something');
        },
        function (collection) {
          return [
            collection.insertOne({
              string: 'something',
            }),
            collection.insertOne({
              string: 'Something',
            }),
          ];
        },
        {
          aggregateOptions: {
            collation: { locale: 'en', caseFirst: 'lower' },
          },
        }
      );
    });

    test('collation dynamic', function (tdone) {
      testQueryValues(
        tdone,
        { sort: [{ selector: 'string' }], requireTotalCount: true },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(2);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(2);
          expect(res.data[0].string).to.eql('something');
          expect(res.data[1].string).to.eql('Something');
        },
        function (collection) {
          return [
            collection.insertOne({
              string: 'something',
            }),
            collection.insertOne({
              string: 'Something',
            }),
          ];
        },
        {
          dynamicAggregateOptions: (identifier /*, pipeline,collection*/) =>
            identifier === 'mainQueryResult'
              ? {
                  collation: { locale: 'en', caseFirst: 'lower' },
                }
              : {},
        }
      );
    });
  });

  suite('#entitiesQuery.values', function () {
    test('list should retrieve all entities', function (tdone) {
      testQueryValues(
        tdone,
        {
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'result').to.have.lengthOf(TESTRECORD_COUNT);
        }
      );
    });

    test('list should accept skip', function (tdone) {
      testQueryValues(
        tdone,
        {
          skip: 5,
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount).to.eql(TESTRECORD_COUNT);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'result').to.have.lengthOf(TESTRECORD_COUNT - 5);
        }
      );
    });

    test('list should accept take', function (tdone) {
      testQueryValues(
        tdone,
        {
          take: 5,
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount).to.eql(TESTRECORD_COUNT);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'result').to.have.lengthOf(5);
        }
      );
    });

    test('list should sort ascending', function (tdone) {
      testQueryValues(
        tdone,
        {
          take: 5,
          sort: [
            {
              selector: 'int1',
              desc: false,
            },
          ],
        },
        function (res) {
          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'result').to.have.lengthOf(5);
          expect(res.data[0].int1).to.eql(0);
          expect(res.data[1].int1).to.eql(0);
          expect(res.data[2].int1).to.eql(0);
          expect(res.data[3].int1).to.eql(0);
          expect(res.data[4].int1).to.eql(0);
        }
      );
    });

    test('list should sort descending', function (tdone) {
      testQueryValues(
        tdone,
        {
          take: 5,
          sort: [
            {
              selector: 'int1',
              desc: true,
            },
          ],
        },
        function (res) {
          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'result').to.have.lengthOf(5);
          expect(res.data[0].int1).to.eql(9);
          expect(res.data[1].int1).to.eql(9);
          expect(res.data[2].int1).to.eql(9);
          expect(res.data[3].int1).to.eql(9);
          expect(res.data[4].int1).to.eql(9);
        }
      );
    });

    test('list should sort by two fields', function (tdone) {
      testQueryValues(
        tdone,
        {
          take: 20,
          sort: [
            {
              selector: 'int2',
              desc: true,
            },{selector:'int1',desc:false}
          ],
        },
        function (res) {
          // the highest 20 are all 4 for int2, but then
          // there's 4 and 9 for int1. Sorting ascending on int1,
          // we should start with the 4s and then see the 9s.

          // I guess this is not a perfect sorting test because it 
          // doesn't have much variety. But I was testing just now
          // on suspicion that something was severely out of order,
          // and that is apparently not the case.

//          console.log(JSON.stringify(res.data, null, 2));
            

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
        }
      );
    });

    test('list should filter with =', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['int1', '=', 3],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(10);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(10);
        }
      );
    });

    test('list should filter with multiple criteria', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: [['int1', '=', 3], 'or', ['int1', '=', 5]],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(20);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(20);
        }
      );
    });

    test('list should search with =', function (tdone) {
      testQueryValues(
        tdone,
        {
          searchExpr: 'int1',
          searchOperation: '=',
          searchValue: 3,
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(10);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(10);
        }
      );
    });

    test('list should project with select', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['int1', '=', 3],
          requireTotalCount: false,
          select: ['int2', 'date1'],
        },
        function (res) {
          //console.log("Result: ", JSON.stringify(res, null, 2));

          expect(res.data[0]).to.have.ownProperty('_id');
          expect(res.data[0]).to.have.ownProperty('int2');
          expect(res.data[0]).to.have.ownProperty('date1');

          expect(res.data[0]).to.not.have.ownProperty('int1');
          expect(res.data[0]).to.not.have.ownProperty('date2');
          expect(res.data[0]).to.not.have.ownProperty('string');
        }
      );
    });

    test('list should search with multiple fields', function (tdone) {
      testQueryValues(
        tdone,
        {
          searchExpr: ['int1', 'int2'],
          searchOperation: '=',
          searchValue: 3,
          requireTotalCount: true,
        },
        function (res) {
          //console.log("Result: ", JSON.stringify(res, null, 2));

          expect(res.totalCount, 'totalCount').to.eql(20);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(20);
        }
      );
    });

    test('list should filter with <', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['int1', '<', 5],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(50);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(50);
        }
      );
    });

    test('list should filter with date.Month and nested array', function (tdone) {
      testQueryValues(
        tdone,
        {
          // some pivot grid queries nest a single filter condition in an extra array
          filter: [['date1.Month', '<=', 2]],
          requireTotalCount: true,
        },
        function (res) {
          //console.log("Result is ", JSON.stringify(res, null, 2));
          expect(res.totalCount, 'totalCount').to.eql(59);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(59);
        }
      );
    });

    test('list should filter with date.Quarter', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['date1.quarter', '=', 2],
          requireTotalCount: true,
        },
        function (res) {
          //console.log("Result is ", JSON.stringify(res, null, 2));
          expect(res.totalCount, 'totalCount').to.eql(10);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(10);

          expect(res.data[0].date1, 'date1').to.be.a('date');
          expect(res.data[0].date2, 'date2').to.be.a('date');
          expect(res.data[0].int1, 'int1').to.be.a('number');
          expect(res.data[0].int2, 'int2').to.be.a('number');
          expect(res.data[0].string, 'string').to.be.a('string');
          expect(res.data[0].___date1_mp2, '___date1_mp2').to.be.undefined;
          expect(res.data[0].___date1_quarter, '___date1_quarter').to.be
            .undefined;
        }
      );
    });

    test('list should filter and group (sample 1)', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: [['date2.Month', '>=', 4], 'and', ['date2.Month', '<', 7]],
          group: [
            {
              groupInterval: 'month',
              isExpanded: false,
              selector: 'date1',
            },
          ],
          groupSummary: [
            {
              selector: 'int1',
              summaryType: 'sum',
            },
          ],
          totalSummary: [
            {
              selector: 'int1',
              summaryType: 'sum',
            },
          ],
          requireTotalCount: true,
        },
        function (res) {
          //console.log("Result is ", JSON.stringify(res, null, 2));

          expect(res.totalCount, 'totalCount').to.eql(10);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(1);

          expect(res.summary[0], 'summary value').to.eql(45);
        }
      );
    });

    test('list should group and filter by quarter without extra fields', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: [['date2.quarter', '=', 1]],
          group: [
            {
              groupInterval: 'month',
              isExpanded: true,
              selector: 'date1',
            },
          ],
          requireTotalCount: true,
        },
        function (res) {
          //console.log("Result is ", JSON.stringify(res, null, 2));

          expect(res.totalCount, 'totalCount').to.eql(90);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(3);

          for (const group of res.data) {
            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, `group(${group.key}).items`).to.be.instanceof(
              Array
            );
            expect(
              group.items,
              `group(${group.key}) items list`
            ).to.have.length.of.at.least(10); // arbitrary
            expect(group.count, `group(${group.key}).count`).to.eql(
              group.items.length
            );

            for (const item of group.items) {
              expect(item.___date2_mp2, 'item.___date2_mp2').to.be.undefined;
              expect(item.___date2_quarter, 'item.___date2_quarter').to.be
                .undefined;
              // leaving the group key in place for now, Mongo doesn't seem to have a
              // very easy way to remove this while data is queried as part of the
              // $group step with $push $$CURRENT
              //expect(item.___group_key_0, "item.___group_key_0").to.be.undefined;
            }
          }
        }
      );
    });

    test('list should filter with endswith', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['string', 'endswith', '23'],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(1);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(1);
        }
      );
    });

    test('prefer metadata count with filter', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['string', 'contains', '7'],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(19);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(19);
        },
        undefined,
        { preferMetadataCount: true }
      );
    });

    test('prefer metadata count without filter', function (tdone) {
      testQueryValues(
        tdone,
        {
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
        },
        undefined,
        { preferMetadataCount: true }
      );
    });

    test('list should filter with contains', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['string', 'contains', 'Item'],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(TESTRECORD_COUNT);
        }
      );
    });

    test('list should filter with contains (case insensitive)', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['string', 'contains', 'item'],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(TESTRECORD_COUNT);
        }
      );
    });

    test('list should filter with contains (case sensitive!)', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['string', 'contains', 'Something'],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(1);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(1);
        },
        function (collection) {
          return [
            collection.insertOne({
              string: 'something',
            }),
            collection.insertOne({
              string: 'Something',
            }),
          ];
        },
        { caseInsensitiveRegex: false }
      );
    });

    test('list should filter with endswith, no results', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['string', 'endswith', "something that doesn't exist"],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(0);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(0);
        }
      );
    });

    test('list should filter with endswith, no results, total summary defined', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['string', 'endswith', "something that doesn't exist"],
          totalSummary: [
            {
              selector: 'int1',
              summaryType: 'sum',
            },
          ],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(0);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'list length').to.have.lengthOf(0);

          expect(res.summary, 'res.summary').to.be.undefined;
        }
      );
    });

    test('list should calculate total summaries for simple queries', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['int1', '<', 5],
          totalSummary: [
            {
              selector: 'int1',
              summaryType: 'sum',
            },
            {
              selector: 'int2',
              summaryType: 'max',
            },
          ],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(50);

          expect(res.summary, 'res.summary').to.be.instanceof(Array);
          expect(res.summary, 'res.summary').to.have.lengthOf(2);
          expect(res.summary[0], 'sum(int1)').to.eql(100);
          expect(res.summary[1], 'max(int2)').to.eql(4);
        }
      );
    });

    test('list should group with items', function (tdone) {
      testQueryValues(
        tdone,
        {
          group: [
            {
              selector: 'int1',
              desc: false,
              isExpanded: true,
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
          expect(res.groupCount, 'groupCount').to.eql(10);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(10);

          for (const group of res.data) {
            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, `group(${group.key}).items`).to.be.instanceof(
              Array
            );
            expect(
              group.items,
              `group(${group.key}) items list`
            ).to.have.lengthOf(10);
            expect(group.count, `group(${group.key}).count`).to.eql(
              group.items.length
            );

            for (const item of group.items) {
              expect(item.int1, 'item.int1').to.eql(group.key);
            }
          }
        }
      );
    });

    test('list should group with items and select', function (tdone) {
      testQueryValues(
        tdone,
        {
          group: [
            {
              selector: 'int1',
              desc: false,
              isExpanded: true,
            },
          ],
          select: ['int2', 'date1'],
        },
        function (res) {
          //console.log("Result: ", JSON.stringify(res, null, 2));

          const x = res.data[0].items[0];

          expect(x).to.have.ownProperty('_id');
          expect(x).to.have.ownProperty('int2');
          expect(x).to.have.ownProperty('date1');

          expect(x).to.not.have.ownProperty('int1');
          expect(x).to.not.have.ownProperty('date2');
          expect(x).to.not.have.ownProperty('string');
        }
      );
    });

    test('list should group with items and secondary sort', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['int2', '=', 3],
          group: [
            {
              selector: 'int2',
              desc: false,
              isExpanded: true,
            },
          ],
          sort: [
            {
              selector: 'int1',
              desc: true,
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(20);
          expect(res.groupCount, 'groupCount').to.eql(1);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(1);

          for (const group of res.data) {
            //console.log("Checking group", JSON.stringify(group, null, 2));

            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, `group(${group.key}).items`).to.be.instanceof(
              Array
            );
            expect(
              group.items,
              `group(${group.key}) items list`
            ).to.have.lengthOf(20);

            for (let i = 0; i <= 9; i++) {
              expect(group.items[i].int1, `groupitem ${i}`).to.eql(8);
            }
            for (let i = 10; i <= 19; i++) {
              expect(group.items[i].int1, `groupitem ${i}`).to.eql(3);
            }
          }
        }
      );
    });

    test('list should group without items', function (tdone) {
      testQueryValues(
        tdone,
        {
          group: [
            {
              selector: 'int1',
              desc: false,
              // , isExpanded: false
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
          expect(res.groupCount, 'groupCount').to.eql(10);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(10);

          for (const group of res.data) {
            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, `group(${group.key}).items`).to.be.null;
            expect(group.count, `group(${group.key}).count`).to.eql(10);
          }
        }
      );
    });

    test('list should group without items, with filter', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: ['int1', '=', 3],
          group: [
            {
              selector: 'int1',
              desc: false,
              // , isExpanded: false
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(10);
          expect(res.groupCount, 'groupCount').to.eql(1);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(1);

          for (const group of res.data) {
            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, `group(${group.key}).items`).to.be.null;
            expect(group.count, `group(${group.key}).count`).to.eql(10);
          }
        }
      );
    });

    test('list should group without items, with complex filter', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: [
            ['int1', '=', 3],
            'or',
            ['int1', '=', 5],
            'or',
            ['int1', '=', 7],
          ],
          group: [
            {
              selector: 'int1',
              desc: false,
              // , isExpanded: false
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(30);
          expect(res.groupCount, 'groupCount').to.eql(3);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(3);

          for (const group of res.data) {
            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, `group(${group.key}).items`).to.be.null;
            expect(group.count, `group(${group.key}).count`).to.eql(10);
          }
        }
      );
    });

    test('list should group with items, with complex filter', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: [
            ['int1', '=', 3],
            'or',
            ['int1', '=', 5],
            'or',
            ['int1', '=', 7],
          ],
          group: [
            {
              selector: 'int1',
              desc: false,
              isExpanded: true,
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(30);
          expect(res.groupCount, 'groupCount').to.eql(3);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(3);

          for (const group of res.data) {
            expect(group.key, 'group.key').to.not.be.undefined;
            expect(group.items, `group(${group.key}).items`).to.be.instanceof(
              Array
            );

            expect(group.items, 'group items list').to.have.lengthOf(10);
            expect(group.count, `group(${group.key}).count`).to.eql(
              group.items.length
            );

            for (const item of group.items) {
              expect(item.int1, 'item.int1').to.eql(group.key);
            }
          }
        }
      );
    });

    test('list should group two levels with bottom-level items', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: [
            [['int1', '=', 3], 'or', ['int1', '=', 6]],
            'and',
            [['int2', '=', 3], 'or', ['int2', '=', 1]],
          ],
          group: [
            {
              selector: 'int1',
              desc: false,
              isExpanded: false,
            },
            {
              selector: 'int2',
              desc: false,
              isExpanded: true,
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          //console.log("Result is ", JSON.stringify(res, null, 2));

          expect(res.totalCount, 'totalCount').to.eql(20);
          expect(res.groupCount, 'groupCount').to.eql(2);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(2);

          for (const group1 of res.data) {
            expect(group1.key, 'group1.key').to.not.be.undefined;
            expect(
              group1.items,
              `group1(${group1.key}).items`
            ).to.be.instanceof(Array);

            expect(group1.items, 'group1 items list').to.have.lengthOf(1);
            expect(group1.count, `group(${group1.key}).count`).to.eql(
              group1.items.length
            );

            for (const group2 of group1.items) {
              expect(group2.key, 'group2.key').to.not.be.undefined;
              expect(
                group2.items,
                `group2(${group2.key}).items`
              ).to.be.instanceof(Array);

              expect(group2.items, 'group2 items list').to.have.lengthOf(10);
              expect(group2.count, `group(${group2.key}).count`).to.eql(
                group2.items.length
              );
              for (const item of group2.items) {
                expect(item.int1, 'item.int1').to.eql(group1.key);
                expect(item.int2, 'item.int2').to.eql(group2.key);
              }
            }
          }
        }
      );
    });

    test('list should group two levels without bottom-level items', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: [
            [['int1', '=', 3], 'or', ['int1', '=', 6]],
            'and',
            [['int2', '=', 3], 'or', ['int2', '=', 1]],
          ],
          group: [
            {
              selector: 'int1',
              desc: false,
              isExpanded: false,
            },
            {
              selector: 'int2',
              desc: false,
              isExpanded: false,
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          //console.log("Result is ", JSON.stringify(res, null, 2));

          expect(res.totalCount, 'totalCount').to.eql(20);
          expect(res.groupCount, 'groupCount').to.eql(2);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(2);

          for (const group1 of res.data) {
            expect(group1.key, 'group1.key').to.not.be.undefined;
            expect(
              group1.items,
              `group1(${group1.key}).items`
            ).to.be.instanceof(Array);

            expect(group1.items, 'group1 items list').to.have.lengthOf(1);
            expect(group1.count, `group(${group1.key}).count`).to.eql(
              group1.items.length
            );

            for (const group2 of group1.items) {
              expect(group2.key, 'group2.key').to.not.be.undefined;
              expect(group2.items, 'group2 items list').to.be.null;
              expect(group2.count, `group(${group2.key}).count`).to.eql(10);
            }
          }
        }
      );
    });

    test('list should group three levels without  items', function (tdone) {
      testQueryValues(
        tdone,
        {
          group: [
            {
              selector: 'int1',
              isExpanded: false,
            },
            {
              selector: 'int2',
              isExpanded: false,
            },
            {
              selector: 'string',
              isExpanded: false,
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          //console.log('Result is ', JSON.stringify(res, null, 2));
          expect(res).to.deep.eql({
            data: [
              {
                key: 0,
                items: [
                  {
                    key: 0,
                    items: [
                      {
                        count: 1,
                        key: 'Item 0',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 10',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 20',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 30',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 40',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 50',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 60',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 70',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 80',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 90',
                        items: null,
                      },
                    ],
                    count: 10,
                  },
                ],
                count: 1,
              },
              {
                key: 1,
                items: [
                  {
                    key: 1,
                    items: [
                      {
                        count: 1,
                        key: 'Item 1',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 11',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 21',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 31',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 41',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 51',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 61',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 71',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 81',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 91',
                        items: null,
                      },
                    ],
                    count: 10,
                  },
                ],
                count: 1,
              },
              {
                key: 2,
                items: [
                  {
                    key: 2,
                    items: [
                      {
                        count: 1,
                        key: 'Item 12',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 2',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 22',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 32',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 42',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 52',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 62',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 72',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 82',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 92',
                        items: null,
                      },
                    ],
                    count: 10,
                  },
                ],
                count: 1,
              },
              {
                key: 3,
                items: [
                  {
                    key: 3,
                    items: [
                      {
                        count: 1,
                        key: 'Item 13',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 23',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 3',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 33',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 43',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 53',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 63',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 73',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 83',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 93',
                        items: null,
                      },
                    ],
                    count: 10,
                  },
                ],
                count: 1,
              },
              {
                key: 4,
                items: [
                  {
                    key: 4,
                    items: [
                      {
                        count: 1,
                        key: 'Item 14',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 24',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 34',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 4',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 44',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 54',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 64',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 74',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 84',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 94',
                        items: null,
                      },
                    ],
                    count: 10,
                  },
                ],
                count: 1,
              },
              {
                key: 5,
                items: [
                  {
                    key: 0,
                    items: [
                      {
                        count: 1,
                        key: 'Item 15',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 25',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 35',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 45',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 5',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 55',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 65',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 75',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 85',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 95',
                        items: null,
                      },
                    ],
                    count: 10,
                  },
                ],
                count: 1,
              },
              {
                key: 6,
                items: [
                  {
                    key: 1,
                    items: [
                      {
                        count: 1,
                        key: 'Item 16',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 26',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 36',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 46',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 56',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 6',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 66',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 76',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 86',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 96',
                        items: null,
                      },
                    ],
                    count: 10,
                  },
                ],
                count: 1,
              },
              {
                key: 7,
                items: [
                  {
                    key: 2,
                    items: [
                      {
                        count: 1,
                        key: 'Item 17',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 27',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 37',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 47',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 57',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 67',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 7',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 77',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 87',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 97',
                        items: null,
                      },
                    ],
                    count: 10,
                  },
                ],
                count: 1,
              },
              {
                key: 8,
                items: [
                  {
                    key: 3,
                    items: [
                      {
                        count: 1,
                        key: 'Item 18',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 28',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 38',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 48',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 58',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 68',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 78',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 8',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 88',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 98',
                        items: null,
                      },
                    ],
                    count: 10,
                  },
                ],
                count: 1,
              },
              {
                key: 9,
                items: [
                  {
                    key: 4,
                    items: [
                      {
                        count: 1,
                        key: 'Item 19',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 29',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 39',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 49',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 59',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 69',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 79',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 89',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 9',
                        items: null,
                      },
                      {
                        count: 1,
                        key: 'Item 99',
                        items: null,
                      },
                    ],
                    count: 10,
                  },
                ],
                count: 1,
              },
            ],
            groupCount: 10,
            totalCount: 100,
          });
        }
      );
    });

    test('list should calculate total summaries group query', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: [
            [['int1', '=', 3], 'or', ['int1', '=', 6]],
            'and',
            [['int2', '=', 3], 'or', ['int2', '=', 1]],
          ],
          group: [
            {
              selector: 'int1',
              desc: false,
              isExpanded: false,
            },
            {
              selector: 'int2',
              desc: false,
              isExpanded: false,
            },
          ],
          totalSummary: [
            {
              selector: 'int1',
              summaryType: 'sum',
            },
            {
              selector: 'int2',
              summaryType: 'max',
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          //console.log("Result is ", JSON.stringify(res, null, 2));

          expect(res.totalCount, 'totalCount').to.eql(20);
          expect(res.groupCount, 'groupCount').to.eql(2);

          expect(res.summary, 'res.summary').to.be.instanceof(Array);
          expect(res.summary, 'res.summary').to.have.lengthOf(2);
          expect(res.summary[0], 'sum(int1)').to.eql(90);
          expect(res.summary[1], 'max(int2)').to.eql(3);
        }
      );
    });

    test('list should calculate group summaries', function (tdone) {
      testQueryValues(
        tdone,
        {
          filter: [['int1', '=', 3], 'or', ['int1', '=', 6]],
          group: [
            {
              selector: 'int1',
              desc: false,
              isExpanded: false,
            },
          ],
          groupSummary: [
            {
              selector: 'int1',
              summaryType: 'sum',
            },
            {
              selector: 'int2',
              summaryType: 'max',
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          //console.log("Result is ", JSON.stringify(res, null, 2));

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
        }
      );
    });

    test('list should group with groupInterval quarter', function (tdone) {
      testQueryValues(
        tdone,
        {
          group: [
            {
              selector: 'date1',
              groupInterval: 'quarter',
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
          expect(res.groupCount, 'groupCount').to.eql(2);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(2);

          expect(res.data[0].key, 'group 1.key').to.not.be.undefined;
          expect(res.data[0].items, `group 1.items`).to.be.null;
          expect(res.data[0].count, `group 1.count`).to.eql(90);
          expect(res.data[1].key, 'group 2.key').to.not.be.undefined;
          expect(res.data[1].items, `group 2.items`).to.be.null;
          expect(res.data[1].count, `group 2.count`).to.eql(10);
        }
      );
    });

    test('list should group with groupInterval month', function (tdone) {
      testQueryValues(
        tdone,
        {
          group: [
            {
              selector: 'date1',
              groupInterval: 'month',
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
          expect(res.groupCount, 'groupCount').to.eql(4);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(4);

          expect(res.data[0].key, 'group 1.key').to.eql(1);
          expect(res.data[0].items, `group 1.items`).to.be.null;
          expect(res.data[0].count, `group 1.count`).to.eql(31);
          expect(res.data[1].key, 'group 2.key').to.eql(2);
          expect(res.data[1].items, `group 2.items`).to.be.null;
          expect(res.data[1].count, `group 2.count`).to.eql(28);
          expect(res.data[2].key, 'group 3.key').to.eql(3);
          expect(res.data[2].items, `group 3.items`).to.be.null;
          expect(res.data[2].count, `group 3.count`).to.eql(31);
          expect(res.data[3].key, 'group 4.key').to.eql(4);
          expect(res.data[3].items, `group 4.items`).to.be.null;
          expect(res.data[3].count, `group 4.count`).to.eql(10);
        }
      );
    });

    test('list should group with groupInterval dayOfWeek', function (tdone) {
      testQueryValues(
        tdone,
        {
          group: [
            {
              selector: 'date1',
              groupInterval: 'dayOfWeek',
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
          expect(res.groupCount, 'groupCount').to.eql(7);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(7);
        }
      );
    });

    test('list should group with groupInterval 2', function (tdone) {
      testQueryValues(
        tdone,
        {
          group: [
            {
              selector: 'int1',
              groupInterval: 2,
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          //console.log("Result is ", JSON.stringify(res, null, 2));
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
        }
      );
    });

    test('list should group with groupInterval quarter and summaries', function (tdone) {
      testQueryValues(
        tdone,
        {
          group: [
            {
              selector: 'date1',
              groupInterval: 'quarter',
            },
          ],
          groupSummary: [
            {
              selector: 'int1',
              summaryType: 'count',
            },
          ],
          totalSummary: [
            {
              selector: 'int1',
              summaryType: 'count',
            },
          ],
          requireTotalCount: true,
          requireGroupCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(TESTRECORD_COUNT);
          expect(res.groupCount, 'groupCount').to.eql(2);

          expect(res.data, 'res.data').to.be.instanceof(Array);
          expect(res.data, 'group list length').to.have.lengthOf(2);

          expect(res.summary, 'res.summary').to.be.instanceof(Array);
          expect(res.summary, 'res.summary length').to.have.lengthOf(1);

          expect(res.data[0].key, 'group 1.key').to.not.be.undefined;
          expect(res.data[0].items, `group 1.items`).to.be.null;
          expect(res.data[0].count, `group 1.count`).to.eql(90);
          expect(res.data[0].summary, 'group 1 summary').to.be.instanceof(
            Array
          );
          expect(
            res.data[0].summary,
            'group 1 summary length'
          ).to.have.lengthOf(1);

          expect(res.data[1].key, 'group 2.key').to.not.be.undefined;
          expect(res.data[1].items, `group 2.items`).to.be.null;
          expect(res.data[1].count, `group 2.count`).to.eql(10);
          expect(res.data[1].summary, 'group 2 summary').to.be.instanceof(
            Array
          );
          expect(
            res.data[1].summary,
            'group 2 summary length'
          ).to.have.lengthOf(1);
        }
      );
    });

    // The following two tests are meant to test the timezoneOffset correction.
    // However, since the mechanism depends on the server to use the correct
    // time, it's hard to remote-control this so that the tests don't fail
    // on occasion. I'm commenting them - as far as I'm aware, the mechanism
    // works correctly in reality and I'll debug if necessary.

    // test('month and dow should work correctly for May 1st 2017', function (tdone) {
    //   // mongodb aggregation operators that extract Date details work on
    //   // UTC only - so they need to have a timezone offset to work with
    //   // in order to deliver the correct results if the local timezone
    //   // is not UTC.
    //   // The test is only meaningful if there's a difference between local timezone
    //   // and UTC. Unfortunately mongodb seems to use the server time to handle
    //   // its persistence, so mocking a timezone from JS doesn't make any
    //   // difference.

    //   // I have noticed that this test fails right now (2017-12-11) because the Docker
    //   // image I run for Mongo doesn't seem to know what the correct time zone is...
    //   // This wouldn't be an issue in real life since we can assume that server
    //   // time zones and dst are going to change according to the real world, but it
    //   // does make it clear that it's not easy passing the "correct" timezoneOffset
    //   // from the client.

    //   testQueryValues(
    //     tdone,
    //     {
    //       filter: [['date1.Month', '=', 5], 'and', ['date1.DayOfWeek', '=', 1]],
    //       requireTotalCount: true,
    //     },
    //     function (res) {
    //       //console.log('Result is ', JSON.stringify(res, null, 2));
    //       expect(res.totalCount, 'totalCount').to.eql(1);
    //       expect(res.data).to.have.lengthOf(1);
    //     },
    //     function (collection) {
    //       return [
    //         collection.insertOne({
    //           // forgive JavaScript - this is the 1st of May
    //           date1: new Date(2017, 4, 1),
    //           date2: new Date(2017, 4, 1),
    //           int1: 10,
    //           int2: 10,
    //           string: 'something',
    //         }),
    //       ];
    //     },
    //     {
    //       timezoneOffset: new Date().getTimezoneOffset(),
    //     }
    //   );
    // });

    // test('month grouping should work correctly for May 1st 2017', function (tdone) {
    //   // mongodb aggregation operators that extract Date details work on
    //   // UTC only - so they need to have a timezone offset to work with
    //   // in order to deliver the correct results if the local timezone
    //   // is not UTC.
    //   // The test is only meaningful if there's a difference between local timezone
    //   // and UTC. Unfortunately mongodb seems to use the server time to handle
    //   // its persistence, so mocking a timezone from JS doesn't make any
    //   // difference.

    //   // I have noticed that this test fails right now (2017-12-11) because the Docker
    //   // image I run for Mongo doesn't seem to know what the correct time zone is...
    //   // This wouldn't be an issue in real life since we can assume that server
    //   // time zones and dst are going to change according to the real world, but it
    //   // does make it clear that it's not easy passing the "correct" timezoneOffset
    //   // from the client.

    //   testQueryValues(
    //     tdone,
    //     {
    //       group: [
    //         {
    //           selector: 'date1',
    //           groupInterval: 'month',
    //         },
    //       ],
    //       requireGroupCount: true,
    //       requireTotalCount: true,
    //     },
    //     function (res) {
    //       //console.log('Result is ', JSON.stringify(res, null, 2));
    //       expect(res.totalCount, 'totalCount').to.eql(1);
    //       expect(res.groupCount).to.eql(1);
    //       expect(res.data).to.have.lengthOf(1);
    //       expect(res.data[0].key).to.eql(5); // month May after mongo $month
    //     },
    //     function (collection) {
    //       return [
    //         collection.insertOne({
    //           // forgive JavaScript - this is the 1st of May
    //           date1: new Date(2017, 4, 1),
    //           date2: new Date(2017, 4, 1),
    //           int1: 10,
    //           int2: 10,
    //           string: 'something',
    //         }),
    //       ];
    //     },
    //     {
    //       timezoneOffset: new Date().getTimezoneOffset(),
    //     }
    //   );
    // });

    test('query should work correctly for May 1st 2017', function (tdone) {
      // see comment above - this test is meaningless if there's no difference
      // between local timezone and UTC. If there is a difference, the test
      // makes sure that data persistence and querying work together the way
      // they should, even if the mongodb level date is stored in UTC.
      // This is mainly for documentation purposes, it happens automatically.
      testQueryValues(
        tdone,
        {
          filter: ['date1', '=', new Date(2017, 4, 1)],
          requireTotalCount: true,
        },
        function (res) {
          //console.log('Result is ', JSON.stringify(res, null, 2));
          expect(res.totalCount, 'totalCount').to.eql(1);
          expect(res.data).to.have.lengthOf(1);

          expect(new Date(res.data[0].date1)).to.eql(new Date(2017, 4, 1));
        },
        function (collection) {
          return [
            collection.insertOne({
              // forgive JavaScript - this is the 1st of May
              date1: new Date(2017, 4, 1),
              date2: new Date(2017, 4, 1),
              int1: 10,
              int2: 10,
              string: 'something',
            }),
          ];
        }
      );
    });

    test('equalsObjectId operator with ObjectId value', function (tdone) {
      // this query also works with the standard '=' operator
      const testId = ObjectId('0123456789abcdef01234567');
      testQueryValues(
        tdone,
        {
          filter: ['idField', 'equalsObjectId', testId],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(1);
        },
        function (collection) {
          return [collection.insertOne({ idField: testId })];
        }
      );
    });

    test('equalsObjectId operator with string value', function (tdone) {
      // this query works only with the equalsObjectId operator
      const testId = ObjectId('0123456789abcdef01234567');
      testQueryValues(
        tdone,
        {
          filter: ['idField', 'equalsObjectId', testId.toString()],
          requireTotalCount: true,
        },
        function (res) {
          expect(res.totalCount, 'totalCount').to.eql(1);
        },
        function (collection) {
          return [collection.insertOne({ idField: testId })];
        }
      );
    });
  });
});
