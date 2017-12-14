'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var createGroupFieldName = function createGroupFieldName(groupIndex) {
  return '___group_key_' + groupIndex;
};

var divInt = function divInt(dividend, divisor) {
  return {
    $divide: [subtractMod(dividend, divisor), divisor]
  };
};

var subtractMod = function subtractMod(a, b) {
  return {
    $subtract: [a, {
      $mod: [a, b]
    }]
  };
};

var createGroupKeyPipeline = function createGroupKeyPipeline(selector, groupInterval, groupIndex) {
  var timezoneOffset = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;

  var wrapGroupKey = function wrapGroupKey(keyExpr) {
    return {
      $addFields: _defineProperty({}, createGroupFieldName(groupIndex), keyExpr)
    };
  };

  var prefix = function prefix(s) {
    return '$' + s;
  };

  var pipe = function pipe() {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    var result = Array.from(args);
    result.groupIndex = groupIndex;
    return result;
  };

  if (groupInterval) {
    var numericInterval = parseInt(Number(groupInterval));
    if (numericInterval) {
      return pipe(wrapGroupKey(subtractMod(prefix(selector), numericInterval)));
    } else {
      var tafield = {
        $subtract: [prefix(selector), timezoneOffset * 60 * 1000]
      };

      switch (groupInterval) {
        case 'year':
          return pipe(wrapGroupKey({
            $year: tafield
          }));
        case 'quarter':
          return pipe({
            $addFields: {
              ___mp2: {
                $add: [{
                  $month: tafield
                }, 2]
              }
            }
          }, wrapGroupKey(divInt('$___mp2', 3)));
        case 'month':
          return pipe(wrapGroupKey({
            $month: tafield
          }));
        case 'day':
          return pipe(wrapGroupKey({
            $dayOfMonth: tafield
          }));
        case 'dayOfWeek':
          return pipe(wrapGroupKey({
            $subtract: [{
              $dayOfWeek: tafield }, 1]
          }));
        case 'hour':
          return pipe(wrapGroupKey({
            $hour: tafield
          }));
        case 'minute':
          return pipe(wrapGroupKey({
            $minute: tafield
          }));
        case 'second':
          return pipe(wrapGroupKey({
            $second: tafield
          }));
        default:
          return pipe(wrapGroupKey(prefix(selector)));
      }
    }
  } else {
    return pipe(wrapGroupKey(prefix(selector)));
  }
};

var createGroupStagePipeline = function createGroupStagePipeline(includeDataItems, countingSeparately, itemProjection, groupKeyPipeline) {
  var result = {
    $group: {
      _id: '$' + createGroupFieldName(groupKeyPipeline.groupIndex)
    }
  };
  if (!countingSeparately) {
    result.$group.count = {
      $sum: 1
    };
  }
  if (includeDataItems) {
    result.$group.items = {
      $push: itemProjection
    };
  }

  return groupKeyPipeline.concat([result]);
};

var createGroupingPipeline = function createGroupingPipeline(desc, includeDataItems, countingSeparately, groupKeyPipeline) {
  var itemProjection = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : '$$CURRENT';

  var projectStage = {
    $project: {
      _id: 0,
      key: '$_id'
    }
  };
  var sortStage = {
    $sort: {
      key: desc ? -1 : 1
    }
  };

  var pipeline = createGroupStagePipeline(includeDataItems, countingSeparately, itemProjection, groupKeyPipeline).concat([projectStage, sortStage]);

  if (!countingSeparately) {
    projectStage.$project.count = 1;
  }

  if (includeDataItems) {
    projectStage.$project.items = 1;
  } else {
    pipeline.push({
      $addFields: {
        items: null }
    });
  }

  return pipeline;
};

var createSkipTakePipeline = function createSkipTakePipeline(skip, take) {
  var pipeline = [];

  if (skip) pipeline.push({
    $skip: skip
  });
  if (take) pipeline.push({
    $limit: take
  });

  return pipeline;
};

var createCountPipeline = function createCountPipeline() {
  return [{
    $count: 'count'
  }];
};

var createMatchPipeline = function createMatchPipeline(selector, value) {
  return [{ $match: _defineProperty({}, selector, value) }];
};

var construct = function construct(fieldName, operator, compValue) {
  return _defineProperty({}, fieldName, _defineProperty({}, operator, compValue));
};

var constructRegex = function constructRegex(fieldName, regex) {
  return _defineProperty({}, fieldName, { $regex: regex, $options: '' });
};

var parseFilter = function parseFilter(element) {

  var rval = function rval(match, fieldList) {
    return { match: match, fieldList: fieldList };
  };

  if (typeof element === 'string') {
    var nf = checkNestedField(element);
    var fieldName = nf ? nf.filterFieldName : element;
    return rval(construct(fieldName, '$eq', true), [element]);
  } else if (Array.isArray(element)) {
    if (element.length === 1 && element[0].length) {
      return parseFilter(element[0]);
    } else if (element.length === 2) {
      if (element[0] === '!') {
        var _parseFilter = parseFilter(element[1]),
            match = _parseFilter.match,
            fieldList = _parseFilter.fieldList;

        if (match) return rval({
          $nor: [match]
        }, fieldList);else return null;
      } else return null;
    } else if (element.length % 2 === 1) {
      var operator = String(element[1]).toLowerCase();

      if (['and', 'or'].includes(operator)) {
        if (element.reduce(function (r, v) {
          if (r.previous) return { ok: r.ok, previous: false };else return {
            ok: r.ok && v.toLowerCase() === operator,
            previous: true
          };
        }, { ok: true, previous: true }).ok) {
          var result = element.reduce(function (r, v) {
            if (r.previous) return _extends({}, r, { previous: false });else {
              var nestedResult = parseFilter(v);
              var nestedFilter = nestedResult && nestedResult.match;
              var _fieldList = nestedResult ? nestedResult.fieldList : [];
              if (nestedFilter) r.list.push(nestedFilter);
              return {
                list: r.list,
                fieldList: r.fieldList.concat(_fieldList),
                previous: true
              };
            }
          }, { list: [], fieldList: [], previous: false });

          return rval(_defineProperty({}, '$' + operator, result.list), result.fieldList);
        } else return null;
      } else {
        if (element.length === 3) {
          var _nf = checkNestedField(element[0]);
          var _fieldName2 = _nf ? _nf.filterFieldName : element[0];

          switch (operator) {
            case '=':
              return rval(construct(_fieldName2, '$eq', element[2]), [element[0]]);
            case '<>':
              return rval(construct(_fieldName2, '$ne', element[2]), [element[0]]);
            case '>':
              return rval(construct(_fieldName2, '$gt', element[2]), [element[0]]);
            case '>=':
              return rval(construct(_fieldName2, '$gte', element[2]), [element[0]]);
            case '<':
              return rval(construct(_fieldName2, '$lt', element[2]), [element[0]]);
            case '<=':
              return rval(construct(_fieldName2, '$lte', element[2]), [element[0]]);
            case 'startswith':
              return rval(constructRegex(_fieldName2, '^' + element[2]), [element[0]]);
            case 'endswith':
              return rval(constructRegex(_fieldName2, element[2] + '$'), [element[0]]);
            case 'contains':
              return rval(constructRegex(_fieldName2, element[2]), [element[0]]);
            case 'notcontains':
              return rval(constructRegex(_fieldName2, '^((?!' + element[2] + ').)*$'), [element[0]]);
            default:
              return null;
          }
        } else return null;
      }
    } else return null;
  } else return null;
};

var createFilterPipeline = function createFilterPipeline(filter) {
  var dummy = {
    pipeline: [],
    fieldList: []
  };

  if (filter) {
    var result = parseFilter(filter);
    var match = result && result.match;
    var fieldList = result ? result.fieldList : [];
    if (match) return {
      pipeline: [{
        $match: match
      }],
      fieldList: fieldList
    };else return dummy;
  } else return dummy;
};

var createSortPipeline = function createSortPipeline(sort) {
  return sort ? [{
    $sort: sort.reduce(function (r, v) {
      return _extends({}, r, _defineProperty({}, v.selector, v.desc ? -1 : 1));
    }, {})
  }] : [];
};

var createSummaryPipeline = function createSummaryPipeline(summary) {
  if (summary) {
    var gc = { _id: null };
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = summary[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var s = _step.value;

        switch (s.summaryType) {
          case 'sum':
          case 'avg':
          case 'min':
          case 'max':
            gc['___' + s.summaryType + s.selector] = _defineProperty({}, '$' + s.summaryType, '$' + s.selector);
            break;
          case 'count':
            gc.___count = { $sum: 1 };
            break;
          default:
            console.error('Invalid summary type \'' + s.summaryType + '\', ignoring');
            break;
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

    return [{
      $group: gc
    }];
  } else return [];
};

var createSearchPipeline = function createSearchPipeline(expr, op, val) {
  var dummy = {
    pipeline: [],
    fieldList: []
  };

  if (!expr || !op || !val) return dummy;

  var criteria = void 0;
  if (typeof expr === 'string') criteria = [expr, op, val];else if (expr.length > 0) {
    criteria = [];
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = expr[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var exprItem = _step2.value;

        if (criteria.length) criteria.push('or');
        criteria.push([exprItem, op, val]);
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
  } else return dummy;

  return createFilterPipeline(criteria);
};

var createSelectProjectExpression = function createSelectProjectExpression(fields) {
  var explicitId = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

  if (fields && fields.length > 0) {
    var project = {};
    if (explicitId) project._id = '$_id';
    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (var _iterator3 = fields[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
        var field = _step3.value;
        project[field] = '$' + field;
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

    return project;
  } else return undefined;
};

var createSelectPipeline = function createSelectPipeline(fields) {
  if (fields && fields.length > 0) {
    return [{
      $project: createSelectProjectExpression(fields)
    }];
  } else return [];
};

var nestedFieldRegex = /^([^.]+)\.(year|quarter|month|dayofweek|day)$/i;

var checkNestedField = function checkNestedField(fieldName) {
  var match = nestedFieldRegex.exec(fieldName);
  if (!match) return undefined;
  return {
    base: match[1],
    nested: match[2],
    filterFieldName: '___' + match[1] + '_' + match[2]
  };
};

var createAddNestedFieldsPipeline = function createAddNestedFieldsPipeline(fieldNames) {
  var timezoneOffset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

  var pr = fieldNames.reduce(function (r, v) {
    var nf = checkNestedField(v);

    if (nf) {
      var nestedFunction = nf.nested.toLowerCase();
      if (['year', 'quarter', 'month', 'day', 'dayofweek'].includes(nestedFunction)) {
        var tafield = {
          $subtract: ['$' + nf.base, timezoneOffset * 60 * 1000]
        };

        switch (nestedFunction) {
          case 'year':
            r.pipeline[1][nf.filterFieldName] = {
              $year: tafield
            };
            r.nestedFields.push(nf.filterFieldName);
            break;
          case 'quarter':
            {
              var tempField = '___' + nf.base + '_mp2';
              r.pipeline[0][tempField] = {
                $add: [{
                  $month: tafield
                }, 2]
              };
              r.nestedFields.push(tempField);
              r.pipeline[1][nf.filterFieldName] = divInt('$' + tempField, 3);
              r.nestedFields.push(nf.filterFieldName);
              break;
            }
          case 'month':
            r.pipeline[1][nf.filterFieldName] = {
              $month: tafield
            };
            r.nestedFields.push(nf.filterFieldName);
            break;
          case 'day':
            r.pipeline[1][nf.filterFieldName] = {
              $dayOfMonth: tafield
            };
            r.nestedFields.push(nf.filterFieldName);
            break;
          case 'dayofweek':
            r.pipeline[1][nf.filterFieldName] = {
              $subtract: [{
                $dayOfWeek: tafield
              }, 1]
            };
            r.nestedFields.push(nf.filterFieldName);
            break;
          default:
            console.error('Hit a completely impossible default case');
        }
      }
    }
    return r;
  }, {
    pipeline: [{}, {}],
    nestedFields: []
  });
  [1, 0].forEach(function (i) {
    if (Object.getOwnPropertyNames(pr.pipeline[i]).length === 0) {
      pr.pipeline.splice(i, 1);
    } else {
      pr.pipeline[i] = {
        $addFields: pr.pipeline[i]
      };
    }
  });

  return pr;
};

var createCompleteFilterPipeline = function createCompleteFilterPipeline(searchExpr, searchOperation, searchValue, filter) {
  var timezoneOffset = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 0;

  var searchPipeline = createSearchPipeline(searchExpr, searchOperation, searchValue);

  var filterPipeline = createFilterPipeline(filter);

  var addNestedFieldsPipelineDetails = createAddNestedFieldsPipeline(searchPipeline.fieldList.concat(filterPipeline.fieldList), timezoneOffset);

  return {
    pipeline: addNestedFieldsPipelineDetails.pipeline.concat(searchPipeline.pipeline, filterPipeline.pipeline),
    nestedFields: addNestedFieldsPipelineDetails.nestedFields
  };
};

var createRemoveNestedFieldsPipeline = function createRemoveNestedFieldsPipeline(nestedFields) {
  if (nestedFields.length === 0) return [];

  var pd = {};
  var _iteratorNormalCompletion4 = true;
  var _didIteratorError4 = false;
  var _iteratorError4 = undefined;

  try {
    for (var _iterator4 = nestedFields[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
      var f = _step4.value;
      pd[f] = 0;
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

  return [{
    $project: pd
  }];
};

module.exports = {
  createGroupFieldName: createGroupFieldName,
  createGroupKeyPipeline: createGroupKeyPipeline,
  createGroupingPipeline: createGroupingPipeline,
  createSkipTakePipeline: createSkipTakePipeline,
  createCountPipeline: createCountPipeline,
  createMatchPipeline: createMatchPipeline,
  createSortPipeline: createSortPipeline,
  createSummaryPipeline: createSummaryPipeline,
  createSelectProjectExpression: createSelectProjectExpression,
  createSelectPipeline: createSelectPipeline,
  createCompleteFilterPipeline: createCompleteFilterPipeline,
  createRemoveNestedFieldsPipeline: createRemoveNestedFieldsPipeline,
  testing: {
    divInt: divInt,
    subtractMod: subtractMod,
    createGroupStagePipeline: createGroupStagePipeline,
    construct: construct,
    constructRegex: constructRegex,
    parseFilter: parseFilter,
    createFilterPipeline: createFilterPipeline,
    createSearchPipeline: createSearchPipeline,
    checkNestedField: checkNestedField,
    createAddNestedFieldsPipeline: createAddNestedFieldsPipeline
  }
};