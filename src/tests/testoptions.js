const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const qs = require('qs');

const getOptions = require('../../dist/options').getOptions;

function test(queryString, expectedResult) {
  const result = getOptions(qs.parse(queryString));
  console.log(`Testing query ${queryString}`);
  console.log('Result: ', JSON.stringify(result, null, 2));

  expect(result).to.eql(expectedResult);
}

describe('getOptions', function() {
  it('take and total count', function() {
    test('take=10&requireTotalCount=true', {
      errors: [],
      loadOptions: {
        take: 10,
        requireTotalCount: true
      },
      processingOptions: {}
    });
  });

  it.only('sort, take and total count', function() {
    test(
      'sort%5B0%5D%5Bselector%5D=date2&sort%5B0%5D%5Bdesc%5D=false&take=10&requireTotalCount=true',
      {
        errors: [],
        loadOptions: {
          sort: [
            {
              selector: 'date2',
              desc: false
            }
          ],
          take: 10,
          requireTotalCount: true
        },
        processingOptions: {}
      }
    );
  });
});

// /data/v1/values?sort%5B0%5D%5Bselector%5D=date2&sort%5B0%5D%5Bdesc%5D=false&requireTotalCount=true&group%5B0%5D%5Bselector%5D=date2&group%5B0%5D%5BisExpanded%5D=false&requireGroupCount=true
// /data/v1/values?sort%5B0%5D%5Bselector%5D=date2&sort%5B0%5D%5Bdesc%5D=false&requireTotalCount=true&group%5B0%5D%5Bselector%5D=date2&group%5B0%5D%5BisExpanded%5D=false&requireGroupCount=true
// /data/v1/values?sort%5B0%5D%5Bselector%5D=date2&sort%5B0%5D%5Bdesc%5D=false&filter%5B0%5D%5B0%5D=date2&filter%5B0%5D%5B1%5D=%3D&filter%5B0%5D%5B2%5D=2017-07-13T00%3A00%3A00.000Z
// /data/v1/values?sort%5B0%5D%5Bselector%5D=date2&sort%5B0%5D%5Bdesc%5D=false&take=10&requireTotalCount=true&skip=30
// /data/v1/values?take=10&requireTotalCount=true&filter%5B0%5D%5B0%5D=int1&filter%5B0%5D%5B1%5D=%3D&filter%5B0%5D%5B2%5D=4
