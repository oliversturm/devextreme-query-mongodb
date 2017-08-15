const valueFixers = require('value-fixers');
const parambulator = require('parambulator');

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
      return [f[0], f[1], fixValue(schema[f[0]], f[2])];
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

    return Object.assign(
      {},
      qry,
      fixedFilter
        ? {
            filter: fixedFilter
          }
        : {},
      fixedSearchValue
        ? {
            searchValue: fixedSearchValue
          }
        : {}
    );
  };
}

const sortOptionsChecker = parambulator({
  required$: ['desc', 'selector'],
  // isExpanded doesn't make any sense with sort, but the grid seems
  // to include it occasionally - probably a bug
  only$: ['desc', 'selector', 'isExpanded'],
  desc: {
    type$: 'boolean'
  },
  selector: {
    type$: 'string'
  }
});

const groupOptionsChecker = parambulator({
  required$: ['selector'],
  only$: ['desc', 'selector', 'isExpanded', 'groupInterval'],
  desc: {
    type$: 'boolean'
  },
  isExpanded: {
    type$: 'boolean'
  },
  selector: {
    type$: 'string'
  },
  groupInterval: {
    type$: ['string', 'integer']
    // unclear whether parambulator supports a spec that says "can be enum but also number"
    //enum$: [ "year", "quarter", "month", "day", "dayOfWeek", "hour", "minute", "second" ] // and numbers?
  }
});

const summaryOptionsChecker = parambulator({
  required$: ['summaryType'],
  only$: ['summaryType', 'selector'],
  summaryType: {
    enum$: ['sum', 'avg', 'min', 'max', 'count']
  },
  selector: {
    type$: 'string'
  }
});

function validateAll(list, checker, short = true) {
  return list.reduce(
    (r, v) => {
      if (short && !r.valid) return r; // short circuiting
      const newr = checker.validate(v);
      if (newr) {
        r.errors.push(newr);
        r.valid = false;
      }
      return r;
    },
    { valid: true, errors: [] }
  );
}

function parseOrFix(arg) {
  // console.log(`parseOrFix with ${JSON.stringify(arg)}`);

  return typeof arg === 'string'
    ? JSON.parse(arg)
    : valueFixers.fixObject(
        arg,
        valueFixers.defaultFixers.concat(valueFixers.fixBool)
      );
}

function representsTrue(val) {
  return val === true || val === 'true';
}

function wrapLoadOptions(lo) {
  return {
    loadOptions: lo
  };
}

function wrapProcessingOptions(po) {
  return {
    processingOptions: po
  };
}

function check(
  qry,
  onames,
  checker,
  converter = (v, vname) => v,
  defaultValue = {},
  wrapper = wrapLoadOptions
) {
  const options = typeof onames === 'string' ? [onames] : onames;
  const allFound = qry && options.reduce((r, v) => r && !!qry[v], true);

  // console.log(`Options: ${JSON.stringify(options)}, allFound: ${allFound}`);

  if (!allFound) return defaultValue;
  try {
    const vals = options.map(o => converter(qry[o], o));
    // console.log('Vals: ', JSON.stringify(vals));

    const checkResult = checker(...vals);
    // console.log('Check results: ', JSON.stringify(checkResult));
    return checkResult
      ? wrapper(checkResult)
      : {
          errors: options.map(o => `Invalid '${o}': ${qry[o]}`)
        };
  } catch (err) {
    return {
      errors: [err]
    };
  }
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
        : null,
    take => parseInt(take)
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
        : null,
    skip => parseInt(skip)
  );
}

function totalCountOptions(qry) {
  return check(
    qry,
    'requireTotalCount',
    requireTotalCount =>
      requireTotalCount
        ? {
            requireTotalCount
          }
        : null,
    requireTotalCount => representsTrue(requireTotalCount)
  );
}

function sortOptions(qry) {
  return check(qry, 'sort', sort => {
    const sortOptions = parseOrFix(sort);
    if (Array.isArray(sortOptions) && sortOptions.length > 0) {
      const vr = validateAll(sortOptions, sortOptionsChecker);
      if (vr.valid)
        return {
          sort: sortOptions
        };
      else
        throw `Sort parameter validation errors: ${JSON.stringify(vr.errors)}`;
    } else return null;
  });
}

function groupOptions(qry) {
  return check(
    qry,
    'group',
    group => {
      const groupOptions = parseOrFix(group);
      if (Array.isArray(groupOptions)) {
        if (groupOptions.length > 0) {
          const vr = validateAll(groupOptions, groupOptionsChecker);
          if (vr.valid)
            return mergeResults([
              wrapLoadOptions({
                group: groupOptions
              }),
              check(
                qry,
                'requireGroupCount',
                requireGroupCount =>
                  requireGroupCount
                    ? {
                        requireGroupCount
                      }
                    : null,
                requireGroupCount => representsTrue(requireGroupCount)
              ),
              check(qry, 'groupSummary', groupSummary => {
                const gsOptions = parseOrFix(groupSummary);
                if (Array.isArray(gsOptions)) {
                  if (gsOptions.length > 0) {
                    const vr = validateAll(gsOptions, summaryOptionsChecker);
                    if (vr.valid)
                      return {
                        groupSummary: gsOptions
                      };
                    else
                      throw `Group summary parameter validation errors: ${JSON.stringify(vr.errors)}`;
                  } else return {}; // ignore empty array
                } else return null;
              })
            ]);
          else
            throw `Group parameter validation errors: ${JSON.stringify(vr.errors)}`;
        } else return {}; // ignore empty array
      } else return null;
    },
    undefined,
    undefined,
    o => o /* deactivate wrapper for the result */
  );
}

function totalSummaryOptions(qry) {
  return check(qry, 'totalSummary', totalSummary => {
    const tsOptions = parseOrFix(totalSummary);
    if (Array.isArray(tsOptions)) {
      if (tsOptions.length > 0) {
        const vr = validateAll(tsOptions, summaryOptionsChecker);
        if (vr.valid)
          return {
            totalSummary: tsOptions
          };
        else
          throw `Total summary parameter validation errors: ${JSON.stringify(vr.errors)}`;
      } else return {}; // ignore empty array
    } else return null;
  });
}

function filterOptions(qry) {
  return check(qry, 'filter', filter => {
    const filterOptions = parseOrFix(filter);
    if (typeof filterOptions === 'string' || Array.isArray(filterOptions))
      return {
        filter: filterOptions
      };
    else return null;
  });
}

function searchOptions(qry) {
  return check(
    qry,
    ['searchExpr', 'searchOperation', 'searchValue'],
    (se, so, sv) => {
      if (typeof se === 'string' || Array.isArray(se))
        return {
          searchExpr: se,
          searchOperation: so,
          searchValue: sv
        };
      else return null;
    }
  );
}

function selectOptions(qry) {
  return check(qry, 'select', select => {
    const selectOptions = parseOrFix(select);
    if (typeof selectOptions === 'string')
      return {
        select: [selectOptions]
      };
    else if (Array.isArray(selectOptions)) {
      if (selectOptions.length > 0) {
        if (selectOptions.reduce((r, v) => r && typeof v === 'string'))
          return {
            select: selectOptions
          };
        else
          throw `Select array parameter has invalid content: ${JSON.stringify(selectOptions)}`;
      } else return {}; // ignore empty array
    } else return null;
  });
}

function timezoneOptions(qry) {
  return check(
    qry,
    'tzOffset',
    tzOffset => ({
      timezoneOffset: parseInt(tzOffset) || 0
    }),
    v => v,
    {
      timezoneOffset: 0
    },
    wrapProcessingOptions
  );
}

function summaryQueryLimitOptions(qry) {
  return check(
    qry,
    'summaryQueryLimit',
    sql =>
      sql >= 0
        ? {
            summaryQueryLimit: sql
          }
        : {},
    sql => parseInt(sql),
    {},
    wrapProcessingOptions
  );
}

function mergeResults(results) {
  return results.reduce(
    (r, v) => ({
      loadOptions: {
        ...(r.loadOptions || {}),
        ...(v.loadOptions || {})
      },
      processingOptions: {
        ...(r.processingOptions || {}),
        ...(v.processingOptions || {})
      },
      errors: [...(r.errors || []), ...(v.errors || [])]
    }),
    {}
  );
}

function getOptions(qry, schema) {
  if (!qry) return null;

  const fixedQry = schema ? fixFilterAndSearch(schema)(qry) : qry;

  // console.log('Fixed query: ', JSON.stringify(fixedQry, null, 2));

  return mergeResults(
    [
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
    ].map(f => f(fixedQry))
  );
}

module.exports = {
  getOptions,
  private: {
    fixFilterAndSearch
  }
};
