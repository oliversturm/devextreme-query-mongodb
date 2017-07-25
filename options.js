function fixFilterAndSearch_(schema) {
  // currently only for int and float, since date and bool
  // are handled by heuristics
  // schema can be
  // {
  //   fieldName1: 'int',
  //   fieldName2: 'float',
  // }

  const operators = ['=', '<>', '>', '>=', '<', '<='];

  function fixValue(type, value) {
    const converter = {
      int: parseInt,
      float: parseFloat
    };
    return converter[type](value);
  }

  // Fixing the array in-place - not the nicest thing, but much easier
  // on the eye
  function fixFilter(filterArray) {
    const isArray = Array.isArray(filterArray);

    if (isArray) {
      if (
        filterArray.length === 3 &&
        typeof filterArray[2] === 'string' &&
        schema[filterArray[0]] &&
        operators.includes(filterArray[1])
      ) {
        filterArray[2] = fixValue(schema[filterArray[0]], filterArray[2]);
      } else filterArray.forEach(e => fixFilter(e));
    }
  }

  function fixSearch(options) {
    const fieldName = typeof options.searchExpr === 'string'
      ? schema[options.searchExpr]
      : Array.isArray(options.searchExpr)
          ? options.searchExpr.find(e => (schema[e] ? e : null))
          : null;

    if (fieldName)
      options.searchValue = fixValue(schema[fieldName], options.searchValue);
  }

  return function(value) {
    if (value != null) {
      if (value.filter) fixFilter(value.filter);
      if (
        value.searchExpr &&
        value.searchOperation &&
        value.searchValue &&
        typeof value.searchValue === 'string'
      )
        fixSearch(value);
    }
    return value;
  };
}

function fixFilterAndSearch(schema) {
  // currently only for int and float
  // schema can be
  // {
  //   fieldName1: 'int',
  //   fieldName2: 'float',
  // }

  const operators = ['=', '<>', '>', '>=', '<', '<='];

  function fixValue(type, value) {
    return {
      int: parseInt,
      float: parseFloat
    }[type](value);
  }

  function fixFilter(f) {
    if (!f || !Array.isArray(f)) return f;
    if (
      f.length === 3 &&
      typeof f[2] === 'string' &&
      schema[f[0]] &&
      operators.includes(f[1])
    )
      return fixValue(schema[f[0]], f[2]);
    else return f.map(e => fixFilter(e));
  }

  function fixSearch(se, so, sv) {
    if (!se || !so || !sv || typeof sv !== 'string') return sv;
    const fieldName = typeof se === 'string'
      ? schema[se]
      : Array.isArray(se) ? se.find(e => (schema[e] ? e : null)) : null;
    return fieldName ? fixValue(schema[fieldName], sv) : sv;
  }

  return qry => {
    if (!qry) return qry;
    const fixedFilter = fixFilter(qry.filter);
    const fixedSearchValue = fixSearch(
      qry.searchExpr,
      qry.searchOperation,
      qry.searchValue
    );

    return {
      ...qry,
      filter: fixedFilter,
      searchValue: fixedSearchValue
    };
  };
}

function wrapLoadOptions(lo) {
  return {
    loadOptions: lo
  };
}

function check(qry, oname, checker, wrapper = wrapLoadOptions) {
  if (!qry || !qry[oname]) return {};
  const checkResult = checker(qry[oname]);
  return checkResult
    ? wrapper(checkResult)
    : {
        errors: [`Invalid ${oname}: ${qry[oname]}`]
      };
}

function takeOptions(qry) {
  return check(
    qry,
    'take',
    take =>
      take > 0
        ? {
            take
          }
        : null
  );
}

function skipOptions(qry) {
  return check(
    qry,
    'skip',
    skip =>
      skip > 0
        ? {
            skip
          }
        : null
  );
}

function totalCountOptions(qry) {
  return check(
    qry,
    'requireTotalCount',
    requireTotalCount =>
      requireTotalCount === true || requireTotalCount === 'true'
        ? {
            requireTotalCount
          }
        : null
  );
}

function getOptions(qry, schema) {
  if (!qry) return null;

  const fixedQry = schema ? fixFilterAndSearch(schema)(qry) : qry;

  return [
    takeOptions,
    skipOptions,
    totalCountOptions,
    sortOptions,
    groupOptions,
    totalSummaryOptions,
    filterOptions,
    searchOptions,
    selectOptions,
    timezoneOptions,
    summaryQueryLimitOptions
  ]
    .map(f => f(fixedQry))
    .reduce(
      (r, v) => ({
        loadOptions: {
          ...r.loadOptions,
          ...v.loadOptions
        },
        processingOptions: {
          ...r.processingOptions,
          ...v.processingOptions
        },
        errors: [...r.errors, ...v.errors]
      }),
      {}
    );
}

module.exports = {
  getOptions
};
