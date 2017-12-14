'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var _require = require('./pipelines'),
    createGroupFieldName = _require.createGroupFieldName,
    createGroupKeyPipeline = _require.createGroupKeyPipeline,
    createGroupingPipeline = _require.createGroupingPipeline,
    createSkipTakePipeline = _require.createSkipTakePipeline,
    createCountPipeline = _require.createCountPipeline,
    createMatchPipeline = _require.createMatchPipeline,
    createSortPipeline = _require.createSortPipeline,
    createSummaryPipeline = _require.createSummaryPipeline,
    createSelectProjectExpression = _require.createSelectProjectExpression,
    createSelectPipeline = _require.createSelectPipeline,
    createCompleteFilterPipeline = _require.createCompleteFilterPipeline,
    createRemoveNestedFieldsPipeline = _require.createRemoveNestedFieldsPipeline;

var _utils = './utils',
    replaceId = _utils.replaceId,
    createSummaryQueryExecutor = _utils.createSummaryQueryExecutor,
    merge = _utils.merge;


function createContext(contextOptions, loadOptions) {
  var getCount = function getCount(collection, pipeline) {
    return collection.aggregate(pipeline).toArray().then(function (r) {
      return r.length > 0 ? r[0].count : 0;
    });
  };

  var populateSummaryResults = function populateSummaryResults(target, summary, summaryResults) {
    if (summary) {
      target.summary = [];

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = summary[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var s = _step.value;

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

    var groupKeyPipeline = createGroupKeyPipeline(group.selector, group.groupInterval, groupIndex, contextOptions.timezoneOffset);

    var augmentWithSubGroups = function augmentWithSubGroups(groupData) {
      return subGroupsRequired ? groupData.map(function (item) {
        return queryGroup(collection, groupIndex + 1, runSummaryQuery, filterPipelineDetails, [], summaryPipeline, [].concat(_toConsumableArray(matchPipeline), _toConsumableArray(groupKeyPipeline), _toConsumableArray(createMatchPipeline(createGroupFieldName(groupIndex), item.key)))).then(function (r) {
          item.items = r;
          item.count = r.length;
          return r;
        });
      }) : [];
    };

    var augmentWithSeparateCount = function augmentWithSeparateCount(groupData) {
      if (separateCountRequired) {

        var nextGroup = loadOptions.group[groupIndex + 1];
        var nextGroupKeyPipeline = createGroupKeyPipeline(nextGroup.selector, nextGroup.groupInterval, groupIndex + 1, contextOptions.timezoneOffset);
        return groupData.map(function (item) {
          return getCount(collection, [].concat(_toConsumableArray(filterPipelineDetails.pipeline), _toConsumableArray(groupKeyPipeline), _toConsumableArray(matchPipeline), _toConsumableArray(createMatchPipeline(createGroupFieldName(groupIndex), item.key)), _toConsumableArray(createGroupingPipeline(nextGroup.desc, false, true, nextGroupKeyPipeline)), _toConsumableArray(createCountPipeline()))).then(function (r) {
            item.count = r;
            return r;
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

    return queryGroupData(collection, group.desc, itemDataRequired, separateCountRequired, createSelectProjectExpression(loadOptions.select, true), groupKeyPipeline, itemDataRequired ? createSortPipeline(loadOptions.sort) : [], filterPipelineDetails, skipTakePipeline, matchPipeline).then(function (groupData) {
      return Promise.all([].concat(_toConsumableArray(augmentWithSubGroups(groupData)), _toConsumableArray(augmentWithSeparateCount(groupData)), _toConsumableArray(augmentWithSummaries(groupData)))).then(function () {
        return groupData;
      });
    });
  };

  var queryGroups = function queryGroups(collection) {
    var completeFilterPipelineDetails = createCompleteFilterPipeline(loadOptions.searchExpr, loadOptions.searchOperation, loadOptions.searchValue, loadOptions.filter, contextOptions.timezoneOffset);
    var summaryPipeline = createSummaryPipeline(loadOptions.groupSummary);
    var skipTakePipeline = createSkipTakePipeline(loadOptions.skip, loadOptions.take);

    var mainQueryResult = function mainQueryResult() {
      return queryGroup(collection, 0, createSummaryQueryExecutor(), completeFilterPipelineDetails, skipTakePipeline, summaryPipeline).then(function (r) {
        return { data: r };
      });
    };

    var groupCount = function groupCount() {
      if (loadOptions.requireGroupCount) {
        var group = loadOptions.group[0];

        return [getCount(collection, [].concat(_toConsumableArray(completeFilterPipelineDetails.pipeline), _toConsumableArray(createGroupingPipeline(group.desc, false, true, createGroupKeyPipeline(group.selector, group.groupInterval, 0, contextOptions.timezoneOffset))), _toConsumableArray(createCountPipeline()))).then(function (r) {
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

  var querySimple = function querySimple(collection) {
    var completeFilterPipelineDetails = createCompleteFilterPipeline(loadOptions.searchExpr, loadOptions.searchOperation, loadOptions.searchValue, loadOptions.filter, contextOptions.timezoneOffset);
    var sortPipeline = createSortPipeline(loadOptions.sort);
    var skipTakePipeline = createSkipTakePipeline(loadOptions.skip, loadOptions.take);
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