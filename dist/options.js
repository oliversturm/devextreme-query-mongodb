'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var yup = require('yup');

var regexBool = /(true|false)/i;

function OptionError() {
  var message = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';

  this.name = 'OptionError';
  this.message = message;
}
OptionError.prototype = Error.prototype;

var asBool = function asBool(v) {
  var match = void 0;
  if (typeof v === 'string' && (match = v.match(regexBool))) {
    return {
      true: true,
      false: false
    }[match[0].toLowerCase()];
  } else return !!v;
};

function fixFilterAndSearch(schema) {

  var operators = ['=', '<>', '>', '>=', '<', '<='];

  function fixValue(type, value) {
    return {
      int: parseInt,
      float: parseFloat,
      datetime: function datetime(v) {
        return new Date(v);
      },
      bool: asBool
    }[type](value);
  }

  function fixFilter(f) {
    if (!f || !Array.isArray(f)) return f;
    if (f.length === 3 && typeof f[2] === 'string' && schema[f[0]] && operators.includes(f[1])) return [f[0], f[1], fixValue(schema[f[0]], f[2])];else return f.map(function (e) {
      return fixFilter(e);
    });
  }

  function fixSearch(se, so, sv) {
    if (!se || !so || !sv || typeof sv !== 'string') return sv;
    var fieldName = typeof se === 'string' ? schema[se] : Array.isArray(se) ? se.find(function (e) {
      return schema[e] ? e : null;
    }) : null;
    return fieldName ? fixValue(schema[fieldName], sv) : sv;
  }

  return function (qry) {
    if (!qry) return qry;
    var fixedFilter = fixFilter(parse(qry.filter));
    var fixedSearchValue = fixSearch(qry.searchExpr, qry.searchOperation, qry.searchValue);

    return Object.assign({}, qry, fixedFilter ? {
      filter: fixedFilter
    } : {}, fixedSearchValue ? {
      searchValue: fixedSearchValue
    } : {});
  };
}

var wrapYupChecker = function wrapYupChecker(yupChecker) {
  return {
    validate: function validate(o) {
      try {
        yupChecker.validateSync(o, { strict: true });
        return null;
      } catch (e) {
        return e;
      }
    }
  };
};

var sortOptionsCheckerYup = yup.object().shape({
  desc: yup.bool().required(),
  selector: yup.string().required(),

  isExpanded: yup.mixed()
}).noUnknown();

var sortOptionsChecker = wrapYupChecker(sortOptionsCheckerYup);

yup.addMethod(yup.mixed, 'or', function (schemas, msg) {
  return this.test({
    name: 'or',
    message: "Can't find valid schema" || msg,
    test: function test(value) {
      if (!Array.isArray(schemas)) throw new OptionError('"or" requires schema array');

      var results = schemas.map(function (schema) {
        return schema.isValidSync(value, { strict: true });
      });
      return results.some(function (res) {
        return !!res;
      });
    },
    exclusive: false
  });
});

var groupOptionsCheckerYup = yup.object().shape({
  selector: yup.string().required(),
  desc: yup.bool(),
  isExpanded: yup.bool(),
  groupInterval: yup.mixed().or([yup.number().integer(), yup.mixed().oneOf(['year', 'quarter', 'month', 'day', 'dayOfWeek', 'hour', 'minute', 'second'])])
}).noUnknown();

var groupOptionsChecker = wrapYupChecker(groupOptionsCheckerYup);

var summaryOptionsCheckerYup = yup.object().shape({
  summaryType: yup.mixed().oneOf(['sum', 'avg', 'min', 'max', 'count']).required(),
  selector: yup.string()
}).noUnknown();

var summaryOptionsChecker = wrapYupChecker(summaryOptionsCheckerYup);

function validateAll(list, checker) {
  var short = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;

  return list.reduce(function (r, v) {
    if (short && !r.valid) return r;
    var newr = checker.validate(v);
    if (newr) {
      r.errors.push(newr);
      r.valid = false;
    }
    return r;
  }, { valid: true, errors: [] });
}

function parse(arg) {
  var canBeString = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

  var ob = arg;
  if (typeof arg === 'string') {
    try {
      ob = JSON.parse(arg);
    } catch (e) {
      if (!canBeString) throw new OptionError(e.message);
      return arg;
    }
  }
  return ob;
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

function check(qry, onames, checker) {
  var converter = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : function (v) {
    return v;
  };
  var defaultValue = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : {};
  var wrapper = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : wrapLoadOptions;

  var options = typeof onames === 'string' ? [onames] : onames;
  var allFound = qry && options.reduce(function (r, v) {
    return r && !!qry[v];
  }, true);

  if (!allFound) return defaultValue;
  try {
    var vals = options.map(function (o) {
      return converter(qry[o], o);
    });

    var checkResult = checker.apply(undefined, _toConsumableArray(vals));

    return checkResult ? wrapper(checkResult) : {
      errors: options.map(function (o) {
        return 'Invalid \'' + o + '\': ' + qry[o];
      })
    };
  } catch (err) {
    return {
      errors: [err]
    };
  }
}

function takeOptions(qry) {
  return check(qry, 'take', function (take) {
    return take >= 0 ? {
      take: take
    } : null;
  }, function (take) {
    return parseInt(take);
  });
}

function skipOptions(qry) {
  return check(qry, 'skip', function (skip) {
    return skip >= 0 ? {
      skip: skip
    } : null;
  }, function (skip) {
    return parseInt(skip);
  });
}

function totalCountOptions(qry) {
  return check(qry, 'requireTotalCount', function (requireTotalCount) {
    return {
      requireTotalCount: requireTotalCount
    };
  }, function (requireTotalCount) {
    return representsTrue(requireTotalCount);
  });
}

function sortOptions(qry) {
  return check(qry, 'sort', function (sort) {
    var sortOptions = parse(sort);
    if (Array.isArray(sortOptions) && sortOptions.length > 0) {
      var vr = validateAll(sortOptions, sortOptionsChecker);
      if (vr.valid) return {
        sort: sortOptions
      };else {
        throw new OptionError('Sort parameter validation errors: ' + JSON.stringify(vr.errors));
      }
    } else return null;
  }, function (sort) {
    var sortOptions = parse(sort);
    if (Array.isArray(sortOptions)) {
      return sortOptions.map(function (s) {
        return _extends({}, s, { desc: representsTrue(s.desc) });
      });
    } else return sort;
  });
}

function groupOptions(qry) {
  return check(qry, 'group', function (group) {
    var groupOptions = parse(group);
    if (Array.isArray(groupOptions)) {
      if (groupOptions.length > 0) {
        var vr = validateAll(groupOptions, groupOptionsChecker);
        if (vr.valid) return mergeResults([wrapLoadOptions({
          group: groupOptions
        }), check(qry, 'requireGroupCount', function (requireGroupCount) {
          return {
            requireGroupCount: requireGroupCount
          };
        }, function (requireGroupCount) {
          return representsTrue(requireGroupCount);
        }), check(qry, 'groupSummary', function (groupSummary) {
          var gsOptions = parse(groupSummary);
          if (Array.isArray(gsOptions)) {
            if (gsOptions.length > 0) {
              var _vr = validateAll(gsOptions, summaryOptionsChecker);
              if (_vr.valid) return {
                groupSummary: gsOptions
              };else throw new OptionError('Group summary parameter validation errors: ' + JSON.stringify(_vr.errors));
            } else return {};
          } else return null;
        })]);else throw new OptionError('Group parameter validation errors: ' + JSON.stringify(vr.errors));
      } else return {};
    } else return null;
  }, function (group) {
    var groupOptions = parse(group);
    if (Array.isArray(groupOptions)) {
      return groupOptions.map(function (g) {
        return _extends({}, g, {
          isExpanded: representsTrue(g.isExpanded)
        });
      });
    } else return group;
  }, undefined, function (o) {
    return o;
  });
}

function totalSummaryOptions(qry) {
  return check(qry, 'totalSummary', function (totalSummary) {
    var tsOptions = parse(totalSummary);
    if (Array.isArray(tsOptions)) {
      if (tsOptions.length > 0) {
        var vr = validateAll(tsOptions, summaryOptionsChecker);
        if (vr.valid) return {
          totalSummary: tsOptions
        };else throw new OptionError('Total summary parameter validation errors: ' + JSON.stringify(vr.errors));
      } else return {};
    } else return null;
  });
}

function filterOptions(qry) {
  return check(qry, 'filter', function (filter) {
    var filterOptions = parse(filter, true);
    if (typeof filterOptions === 'string' || Array.isArray(filterOptions)) return {
      filter: filterOptions
    };else return null;
  });
}

function searchOptions(qry) {
  return check(qry, ['searchExpr', 'searchOperation', 'searchValue'], function (se, so, sv) {
    if (typeof se === 'string' || Array.isArray(se)) return {
      searchExpr: se,
      searchOperation: so,
      searchValue: sv
    };else return null;
  });
}

function selectOptions(qry) {
  return check(qry, 'select', function (select) {
    var selectOptions = parse(select, true);
    if (typeof selectOptions === 'string') return {
      select: [selectOptions]
    };else if (Array.isArray(selectOptions)) {
      if (selectOptions.length > 0) {
        if (selectOptions.reduce(function (r, v) {
          return r && typeof v === 'string';
        })) return {
          select: selectOptions
        };else throw new OptionError('Select array parameter has invalid content: ' + JSON.stringify(selectOptions));
      } else return {};
    } else return null;
  });
}

function timezoneOptions(qry) {
  return check(qry, 'tzOffset', function (tzOffset) {
    return {
      timezoneOffset: parseInt(tzOffset) || 0
    };
  }, function (v) {
    return v;
  }, {
    timezoneOffset: 0
  }, wrapProcessingOptions);
}

function caseInsensitiveRegexOptions(qry) {
  return check(qry, 'caseInsensitiveRegex', function (caseInsensitiveRegex) {
    return {
      caseInsensitiveRegex: caseInsensitiveRegex
    };
  }, function (caseInsensitiveRegex) {
    return representsTrue(caseInsensitiveRegex);
  }, { caseInsensitiveRegex: true }, wrapProcessingOptions);
}

function summaryQueryLimitOptions(qry) {
  return check(qry, 'summaryQueryLimit', function (sql) {
    return sql >= 0 ? {
      summaryQueryLimit: sql
    } : {};
  }, function (sql) {
    return parseInt(sql);
  }, {}, wrapProcessingOptions);
}

function mergeResults(results) {
  return results.reduce(function (r, v) {
    return {
      loadOptions: _extends({}, r.loadOptions || {}, v.loadOptions || {}),
      processingOptions: _extends({}, r.processingOptions || {}, v.processingOptions || {}),
      errors: [].concat(_toConsumableArray(r.errors || []), _toConsumableArray(v.errors || []))
    };
  }, {});
}

function getOptions(qry, schema) {
  if (!qry) return undefined;

  var fixedQry = schema ? fixFilterAndSearch(schema)(qry) : qry;

  return mergeResults([takeOptions, skipOptions, totalCountOptions, sortOptions, groupOptions, totalSummaryOptions, filterOptions, searchOptions, selectOptions, timezoneOptions, summaryQueryLimitOptions, caseInsensitiveRegexOptions].map(function (f) {
    return f(fixedQry);
  }));
}

module.exports = {
  getOptions: getOptions,
  private: {
    fixFilterAndSearch: fixFilterAndSearch,
    validateAll: validateAll,
    check: check,
    takeOptions: takeOptions,
    skipOptions: skipOptions,
    totalCountOptions: totalCountOptions,
    sortOptions: sortOptions,
    groupOptions: groupOptions,
    totalSummaryOptions: totalSummaryOptions,
    filterOptions: filterOptions,
    searchOptions: searchOptions,
    selectOptions: selectOptions,
    sortOptionsChecker: sortOptionsChecker,
    groupOptionsChecker: groupOptionsChecker,
    summaryOptionsChecker: summaryOptionsChecker,
    asBool: asBool,
    parse: parse
  }
};