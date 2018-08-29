// Mongo doesn't seem to have the ability of simply returning its ids as strings
// to begin with. Bit of a pita, but hey...
// We'll replace ids with strings if required.
const replaceId = item =>
  item._id ? { ...item, _id: item._id.toHexString() } : item;

// We can apply a limit for summaries calculated per group query. The realistic problem
// is that if a programmer makes the grid use server-side grouping as well as summaries,
// but *not* groupPaging, there may be enormous numbers of summary queries to run, and because
// this happens across levels, it can't easily be checked elsewhere and the server will just
// keep working on that query as long as it takes.
const createSummaryQueryExecutor = limit => {
  let queriesExecuted = 0;

  return fn =>
    !limit || ++queriesExecuted <= limit ? fn() : Promise.resolve();
};

const merge = os => Object.assign({}, ...os);

const debug = (id, f, options = {}) => {
  const output = options.output || console.log;
  const processResult = options.processResult || (result => result);
  const processArgs = options.processArgs || (args => args);
  return (...args) => {
    output(`DEBUG(${id}): `, processArgs(args));
    const result = f(...args);
    output(`DEBUG(${id}/result): `, processResult(result));
    return result;
  };
};

module.exports = { replaceId, createSummaryQueryExecutor, merge, debug };
