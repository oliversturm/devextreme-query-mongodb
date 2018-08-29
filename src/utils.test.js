/* global suite, test */

const chai = require('chai');
const assert = chai.assert;
const sinon = require('sinon');

const { replaceId, createSummaryQueryExecutor } = require('./utils');

suite('utils', function() {
  suite('replaceId', function() {
    test('works', function() {
      assert.deepEqual(replaceId({ _id: { toHexString: () => '42' } }), {
        _id: '42'
      });
    });
  });

  suite('createSummaryQueryExecutor', function() {
    test('works', function(done) {
      const exec = createSummaryQueryExecutor(3);
      const func = sinon.stub().resolves();
      const promises = [
        exec(func),
        exec(func),
        exec(func),
        exec(func),
        exec(func)
      ];
      /* eslint-disable */
      Promise.all(promises).then(rs => {
        // five execs should render five results
        assert.equal(rs.length, 5);
        // but only three calls, because that's the limit
        assert.equal(func.callCount, 3);
        done();
      });
      /* eslint-enable */
    });
  });
});
