'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function createContext(contextOptions, loadOptions) {
  var replaceId = function replaceId(item) {
    if (!contextOptions.replaceIds) return item;
    if (item._id) item._id = item._id.toHexString();
    return item;
  };

  var createSummaryQueryExecutor = function createSummaryQueryExecutor() {
    var queriesExecuted = 0;

    return function (fn) {
      if (!contextOptions.summaryQueryLimit || ++queriesExecuted <= contextOptions.summaryQueryLimit) return fn();else return Promise.resolve();
    };
  };

  var createGroupFieldName = function createGroupFieldName(groupIndex) {
    return '___group_key_' + groupIndex;
  };

  var createGroupKeyPipeline = function createGroupKeyPipeline(selector, groupInterval, groupIndex) {
    var wrapGroupKey = function wrapGroupKey(keyExpr) {
      var field = {};
      field[createGroupFieldName(groupIndex)] = keyExpr;

      return {
        $addFields: field
      };
    };

    var prefix = function prefix(s) {
      return '$' + s;
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
          $subtract: [prefix(selector), contextOptions.timezoneOffset * 60 * 1000]
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

  var createGroupStagePipeline = function createGroupStagePipeline(countingSeparately, includeDataItems, itemProjection, groupKeyPipeline) {
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

    var pipeline = createGroupStagePipeline(countingSeparately, includeDataItems, itemProjection, groupKeyPipeline).concat([projectStage, sortStage]);

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

  var createSkipTakePipeline = function createSkipTakePipeline() {
    var pipeline = [];

    if (loadOptions.skip) pipeline.push({
      $skip: loadOptions.skip
    });
    if (loadOptions.take) pipeline.push({
      $limit: loadOptions.take
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

  var createFilterPipeline = function createFilterPipeline(filter) {
    var dummy = {
      pipeline: [],
      fieldList: []
    };

    if (filter) {
      var fieldList = [];
      var match = parseFilter(filter, fieldList);
      if (match) return {
        pipeline: [{
          $match: match
        }],
        fieldList: fieldList
      };else return dummy;
    } else return dummy;
  };

  var createSortPipeline = function createSortPipeline() {
    return loadOptions.sort ? [{
      $sort: loadOptions.sort.reduce(function (r, v) {
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
              gc['___sum' + s.selector] = { $sum: '$' + s.selector };
              break;
            case 'avg':
              gc['___avg' + s.selector] = { $avg: '$' + s.selector };
              break;
            case 'min':
              gc['___min' + s.selector] = { $min: '$' + s.selector };
              break;
            case 'max':
              gc['___max' + s.selector] = { $max: '$' + s.selector };
              break;
            case 'count':
              gc.___count = { $sum: 1 };
              break;
            default:
              console.error('Invalid summary type ' + s.summaryType + ', ignoring');
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

  var getCount = function getCount(collection, pipeline) {
    return collection.aggregate(pipeline).toArray().then(function (r) {
      return r.length > 0 ? r[0].count : 0;
    });
  };

  var construct = function construct(fieldName, operator, compValue) {
    return _defineProperty({}, fieldName, _defineProperty({}, operator, compValue));
  };

  var constructRegex = function constructRegex(fieldName, regex) {
    return _defineProperty({}, fieldName, { $regex: regex, $options: '' });
  };

  var parseFilter = function parseFilter(element, fieldList) {

    if (typeof element === 'string') {
      fieldList.push(element);
      var nf = checkNestedField(element);
      var fieldName = nf ? nf.filterFieldName : element;
      return construct(fieldName, '$eq', true);
    } else if (element.length) {
      if (element.length === 1 && element[0].length) {
        return parseFilter(element[0], fieldList);
      } else if (element.length === 2) {
        if (element[0] === '!') {
          var nor = parseFilter(element[1], fieldList);
          if (nor) return {
            $nor: [nor]
          };else return null;
        } else return null;
      } else if (element.length % 2 === 1) {
        var operator = element[1].toLowerCase();

        if (['and', 'or'].includes(operator)) {
          if (element.reduce(function (r, v) {
            if (r.previous) return { ok: r.ok, previous: false };else return {
              ok: r.ok && v.toLowerCase() === operator,
              previous: true
            };
          }, { ok: true, previous: true }).ok) {
            var result = {};
            result['$' + operator] = element.reduce(function (r, v) {
              if (r.previous) return { list: r.list, previous: false };else {
                var nestedFilter = parseFilter(v, fieldList);
                if (nestedFilter) r.list.push(nestedFilter);
                return { list: r.list, previous: true };
              }
            }, { list: [], previous: false }).list;

            return result;
          } else return null;
        } else {
          if (element.length === 3) {
            fieldList.push(element[0]);
            var _nf = checkNestedField(element[0]);
            var _fieldName2 = _nf ? _nf.filterFieldName : element[0];

            switch (operator) {
              case '=':
                return construct(_fieldName2, '$eq', element[2]);
              case '<>':
                return construct(_fieldName2, '$ne', element[2]);
              case '>':
                return construct(_fieldName2, '$gt', element[2]);
              case '>=':
                return construct(_fieldName2, '$gte', element[2]);
              case '<':
                return construct(_fieldName2, '$lt', element[2]);
              case '<=':
                return construct(_fieldName2, '$lte', element[2]);
              case 'startswith':
                return constructRegex(_fieldName2, '^' + element[2]);
              case 'endswith':
                return constructRegex(_fieldName2, element[2] + '$');
              case 'contains':
                return constructRegex(_fieldName2, element[2]);
              case 'notcontains':
                return constructRegex(_fieldName2, '^((?!' + element[2] + ').)*$');
              default:
                return null;
            }
          } else return null;
        }
      } else return null;
    } else return null;
  };

  var populateSummaryResults = function populateSummaryResults(target, summary, summaryResults) {
    if (summary) {
      target.summary = [];

      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = summary[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var s = _step4.value;

          switch (s.summaryType) {
            case 'sum':
              target.summary.push(summaryResults['___sum' + s.selector]);
              break;
            case 'avg':
              target.summary.push(summaryResults['___avg' + s.selector]);
              break;
            case 'min':
              target.summary.push(summaryResults['___min' + s.selector]);
              break;
            case 'max':
              target.summary.push(summaryResults['___max' + s.selector]);
              break;
            case 'count':
              target.summary.push(summaryResults.___count);
              break;
            default:
              console.error('Invalid summaryType ' + s.summaryType + ', ignoring');
          }
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
    return target;
  };

  var queryGroupData = function queryGroupData(collection, desc, includeDataItems, countSeparately, itemProjection, groupKeyPipeline, sortPipeline, filterPipelineDetails, skipTakePipeline, matchPipeline) {
    return collection.aggregate([].concat(_toConsumableArray(sortPipeline), _toConsumableArray(filterPipelineDetails.pipeline), _toConsumableArray(matchPipeline), _toConsumableArray(createRemoveNestedFieldsPipeline(filterPipelineDetails.nestedFields)), _toConsumableArray(createGroupingPipeline(desc, includeDataItems, countSeparately, groupKeyPipeline, itemProjection)), _toConsumableArray(skipTakePipeline))).toArray().then(function (r) {
      return includeDataItems ? r.map(function (i) {
        return _extends({}, i, { items: i.items.map(replaceId) });
      }) : r;
    });
  };

  var queryGroup = function queryGroup(collection, groupIndex, runSummaryQuery, filterPipelineDetails) {
    var skipTakePipeline = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : [];
    var summaryPipeline = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : [];
    var matchPipeline = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : [];

    var group = loadOptions.group[groupIndex];
    var lastGroup = groupIndex === loadOptions.group.length - 1;
    var itemDataRequired = lastGroup && group.isExpanded;
    var separateCountRequired = !lastGroup;

    var subGroupsRequired = !lastGroup;
    var summariesRequired = loadOptions.groupSummary && loadOptions.groupSummary.length > 0;

    var groupKeyPipeline = createGroupKeyPipeline(group.selector, group.groupInterval, groupIndex);

    var augmentWithSubGroups = function augmentWithSubGroups(groupData) {
      return subGroupsRequired ? groupData.map(function (item) {
        return queryGroup(collection, groupIndex + 1, runSummaryQuery, filterPipelineDetails, [], summaryPipeline, [].concat(_toConsumableArray(matchPipeline), _toConsumableArray(groupKeyPipeline), _toConsumableArray(createMatchPipeline(createGroupFieldName(groupIndex), item.key)))).then(function (r) {
          item.items = r;
          item.count = r.length;
        });
      }) : [];
    };

    var augmentWithSeparateCount = function augmentWithSeparateCount(groupData) {
      if (separateCountRequired) {

        var nextGroup = loadOptions.group[groupIndex + 1];
        var nextGroupKeyPipeline = createGroupKeyPipeline(nextGroup.selector, nextGroup.groupInterval, groupIndex + 1);
        return groupData.map(function (item) {
          return getCount(collection, [].concat(_toConsumableArray(filterPipelineDetails.pipeline), _toConsumableArray(groupKeyPipeline), _toConsumableArray(matchPipeline), _toConsumableArray(createMatchPipeline(createGroupFieldName(groupIndex), item.key)), _toConsumableArray(createGroupingPipeline(nextGroup.desc, false, true, nextGroupKeyPipeline)), _toConsumableArray(createCountPipeline()))).then(function (r) {
            item.count = r;
          });
        });
      } else return [];
    };

    var augmentWithSummaries = function augmentWithSummaries(groupData) {
      return summariesRequired ? groupData.map(function (item) {
        return runSummaryQuery(function () {
          return collection.aggregate([].concat(_toConsumableArray(filterPipelineDetails.pipeline), _toConsumableArray(groupKeyPipeline), _toConsumableArray(matchPipeline), _toConsumableArray(createMatchPipeline(createGroupFieldName(groupIndex), item.key)), _toConsumableArray(summaryPipeline))).toArray();
        }).then(function (r) {
          return populateSummaryResults(item, loadOptions.groupSummary, r[0]);
        });
      }) : [];
    };

    return queryGroupData(collection, group.desc, itemDataRequired, separateCountRequired, createSelectProjectExpression(loadOptions.select, true), groupKeyPipeline, itemDataRequired ? createSortPipeline() : [], filterPipelineDetails, skipTakePipeline, matchPipeline).then(function (groupData) {
      return Promise.all([].concat(_toConsumableArray(augmentWithSubGroups(groupData)), _toConsumableArray(augmentWithSeparateCount(groupData)), _toConsumableArray(augmentWithSummaries(groupData)))).then(function () {
        return groupData;
      });
    });
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

    var pr = fieldNames.reduce(function (r, v) {
      var nf = checkNestedField(v);

      if (nf) {
        var nestedFunction = nf.nested.toLowerCase();
        if (['year', 'quarter', 'month', 'day', 'dayofweek'].includes(nestedFunction)) {
          var tafield = {
            $subtract: ['$' + nf.base, contextOptions.timezoneOffset * 60 * 1000]
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

  var createCompleteFilterPipeline = function createCompleteFilterPipeline() {
    var searchPipeline = createSearchPipeline(loadOptions.searchExpr, loadOptions.searchOperation, loadOptions.searchValue);

    var filterPipeline = createFilterPipeline(loadOptions.filter);

    var addNestedFieldsPipelineDetails = createAddNestedFieldsPipeline(searchPipeline.fieldList.concat(filterPipeline.fieldList));

    return {
      pipeline: addNestedFieldsPipelineDetails.pipeline.concat(searchPipeline.pipeline, filterPipeline.pipeline),
      nestedFields: addNestedFieldsPipelineDetails.nestedFields
    };
  };

  var createRemoveNestedFieldsPipeline = function createRemoveNestedFieldsPipeline(nestedFields) {
    if (nestedFields.length === 0) return [];

    var pd = {};
    var _iteratorNormalCompletion5 = true;
    var _didIteratorError5 = false;
    var _iteratorError5 = undefined;

    try {
      for (var _iterator5 = nestedFields[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
        var f = _step5.value;
        pd[f] = 0;
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

    return [{
      $project: pd
    }];
  };

  var queryGroups = function queryGroups(collection) {
    var completeFilterPipelineDetails = createCompleteFilterPipeline();
    var summaryPipeline = createSummaryPipeline(loadOptions.groupSummary);
    var skipTakePipeline = createSkipTakePipeline();

    var mainQueryResult = function mainQueryResult() {
      return queryGroup(collection, 0, createSummaryQueryExecutor(), completeFilterPipelineDetails, skipTakePipeline, summaryPipeline).then(function (r) {
        return { data: r };
      });
    };

    var groupCount = function groupCount() {
      if (loadOptions.requireGroupCount) {
        var group = loadOptions.group[0];

        return [getCount(collection, [].concat(_toConsumableArray(completeFilterPipelineDetails.pipeline), _toConsumableArray(createGroupingPipeline(group.desc, false, true, createGroupKeyPipeline(group.selector, group.groupInterval, 0))), _toConsumableArray(createCountPipeline()))).then(function (r) {
          return { groupCount: r };
        })];
      } else return [];
    };

    var totalCount = function totalCount() {
      return loadOptions.requireTotalCount || loadOptions.totalSummary ? [getCount(collection, [].concat(_toConsumableArray(completeFilterPipelineDetails.pipeline), _toConsumableArray(createCountPipeline()))).then(function (r) {
        return { totalCount: r };
      })] : [];
    };

    var summary = function summary(resultObject) {
      return resultObject.totalCount > 0 && loadOptions.totalSummary ? collection.aggregate([].concat(_toConsumableArray(completeFilterPipelineDetails.pipeline), _toConsumableArray(createSummaryPipeline(loadOptions.totalSummary)))).toArray().then(function (r) {
        return populateSummaryResults(resultObject, loadOptions.totalSummary, r[0]);
      }) : Promise.resolve(resultObject);
    };

    return Promise.all([mainQueryResult()].concat(_toConsumableArray(groupCount()), _toConsumableArray(totalCount()))).then(merge).then(summary);
  };

  var merge = function merge(os) {
    return os.reduce(function (r, v) {
      return _extends({}, r, v);
    }, {});
  };

  var querySimple = function querySimple(collection) {
    var completeFilterPipelineDetails = createCompleteFilterPipeline();
    var sortPipeline = createSortPipeline();
    var skipTakePipeline = createSkipTakePipeline();
    var selectPipeline = createSelectPipeline(loadOptions.select);
    var removeNestedFieldsPipeline = createRemoveNestedFieldsPipeline(completeFilterPipelineDetails.nestedFields);

    var mainQueryResult = function mainQueryResult() {
      return collection.aggregate([].concat(_toConsumableArray(completeFilterPipelineDetails.pipeline), _toConsumableArray(sortPipeline), _toConsumableArray(skipTakePipeline), _toConsumableArray(selectPipeline), _toConsumableArray(removeNestedFieldsPipeline))).toArray().then(function (r) {
        return r.map(replaceId);
      }).then(function (r) {
        return { data: r };
      });
    };

    var totalCount = function totalCount() {
      return loadOptions.requireTotalCount || loadOptions.totalSummary ? [getCount(collection, [].concat(_toConsumableArray(completeFilterPipelineDetails.pipeline), _toConsumableArray(createCountPipeline()))).then(function (r) {
        return { totalCount: r };
      })] : [];
    };

    var summary = function summary(resultObject) {
      return resultObject.totalCount > 0 && loadOptions.totalSummary ? collection.aggregate([].concat(_toConsumableArray(completeFilterPipelineDetails.pipeline), _toConsumableArray(createSummaryPipeline(loadOptions.totalSummary)))).toArray().then(function (r) {
        return populateSummaryResults(resultObject, loadOptions.totalSummary, r[0]);
      }) : Promise.resolve(resultObject);
    };

    return Promise.all([mainQueryResult()].concat(_toConsumableArray(totalCount()))).then(merge).then(summary);
  };

  return { queryGroups: queryGroups, querySimple: querySimple };
}

function query(collection) {
  var loadOptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

  var standardContextOptions = {
    replaceIds: true,
    summaryQueryLimit: 100,

    timezoneOffset: 0
  };
  var contextOptions = Object.assign(standardContextOptions, options);
  var context = createContext(contextOptions, loadOptions);

  return loadOptions.group && loadOptions.group.length > 0 ? context.queryGroups(collection, loadOptions) : context.querySimple(collection, loadOptions);
}

module.exports = query;