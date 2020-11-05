'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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

var _require2 = require('./utils'),
    replaceId = _require2.replaceId,
    createSummaryQueryExecutor = _require2.createSummaryQueryExecutor,
    merge = _require2.merge,
    debug = _require2.debug;

function createContext(contextOptions, loadOptions) {
  var aggregateCall = function aggregateCall(collection, pipeline, identifier) {
    return function (aggregateOptions) {
      return collection.aggregate(pipeline, aggregateOptions);
    }(contextOptions.dynamicAggregateOptions ? filterAggregateOptions(contextOptions.dynamicAggregateOptions(identifier, pipeline, collection)) : contextOptions.aggregateOptions);
  };

  var getCount = function getCount(collection, pipeline) {
    return aggregateCall(collection, pipeline, 'getCount').toArray().then(function (r) {
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
    return aggregateCall(collection, [].concat(_toConsumableArray(contextOptions.preProcessingPipeline), _toConsumableArray(sortPipeline), _toConsumableArray(filterPipelineDetails.pipeline), _toConsumableArray(matchPipeline), _toConsumableArray(createRemoveNestedFieldsPipeline(filterPipelineDetails.nestedFields, contextOptions)), _toConsumableArray(createGroupingPipeline(desc, includeDataItems, countSeparately, groupKeyPipeline, itemProjection, contextOptions)), _toConsumableArray(skipTakePipeline)), 'queryGroupData').toArray().then(function (r) {
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

    var groupKeyPipeline = createGroupKeyPipeline(group.selector, group.groupInterval, groupIndex, contextOptions);

    var augmentWithSubGroups = function augmentWithSubGroups(groupData) {
      return subGroupsRequired ? groupData.map(function (item) {
        return queryGroup(collection, groupIndex + 1, runSummaryQuery, filterPipelineDetails, [], summaryPipeline, [].concat(_toConsumableArray(matchPipeline), _toConsumableArray(groupKeyPipeline), _toConsumableArray(createMatchPipeline(createGroupFieldName(groupIndex), item.key, contextOptions)))).then(function (r) {
          item.items = r;
          item.count = r.length;
          return r;
        });
      }) : [];
    };

    var augmentWithSeparateCount = function augmentWithSeparateCount(groupData) {
      if (separateCountRequired) {

        var nextGroup = loadOptions.group[groupIndex + 1];
        var nextGroupKeyPipeline = createGroupKeyPipeline(nextGroup.selector, nextGroup.groupInterval, groupIndex + 1, contextOptions);
        return groupData.map(function (item) {
          return getCount(collection, [].concat(_toConsumableArray(contextOptions.preProcessingPipeline), _toConsumableArray(filterPipelineDetails.pipeline), _toConsumableArray(groupKeyPipeline), _toConsumableArray(matchPipeline), _toConsumableArray(createMatchPipeline(createGroupFieldName(groupIndex), item.key, contextOptions)), _toConsumableArray(createGroupingPipeline(nextGroup.desc, false, true, nextGroupKeyPipeline, contextOptions)), _toConsumableArray(createCountPipeline(contextOptions)))).then(function (r) {
            item.count = r;
            return r;
          });
        });
      } else return [];
    };

    var augmentWithSummaries = function augmentWithSummaries(groupData) {
      return summariesRequired ? groupData.map(function (item) {
        return runSummaryQuery(function () {
          return aggregateCall(collection, [].concat(_toConsumableArray(contextOptions.preProcessingPipeline), _toConsumableArray(filterPipelineDetails.pipeline), _toConsumableArray(groupKeyPipeline), _toConsumableArray(matchPipeline), _toConsumableArray(createMatchPipeline(createGroupFieldName(groupIndex), item.key, contextOptions)), _toConsumableArray(summaryPipeline)), 'augmentWithSummaries').toArray();
        }).then(function (r) {
          return populateSummaryResults(item, loadOptions.groupSummary, r[0]);
        });
      }) : [];
    };

    return queryGroupData(collection, group.desc, itemDataRequired, separateCountRequired, createSelectProjectExpression(loadOptions.select, true), groupKeyPipeline, itemDataRequired ? createSortPipeline(loadOptions.sort, contextOptions) : [], filterPipelineDetails, skipTakePipeline, matchPipeline).then(function (groupData) {
      return Promise.all([].concat(_toConsumableArray(augmentWithSubGroups(groupData)), _toConsumableArray(augmentWithSeparateCount(groupData)), _toConsumableArray(augmentWithSummaries(groupData)))).then(function () {
        return groupData;
      });
    });
  };

  var totalCount = function totalCount(collection, completeFilterPipelineDetails) {
    return loadOptions.requireTotalCount || loadOptions.totalSummary ? contextOptions.preferMetadataCount && contextOptions.preProcessingPipeline.length === 0 && completeFilterPipelineDetails.pipeline.length <= 1 ? [collection.count(completeFilterPipelineDetails.pipeline.length === 1 ? completeFilterPipelineDetails.pipeline[0]['$match'] : undefined).then(function (r) {
      return { totalCount: r };
    })] : [getCount(collection, [].concat(_toConsumableArray(contextOptions.preProcessingPipeline), _toConsumableArray(completeFilterPipelineDetails.pipeline), _toConsumableArray(createCountPipeline(contextOptions)))).then(function (r) {
      return { totalCount: r };
    })] : [];
  };

  var summary = function summary(collection, completeFilterPipelineDetails) {
    return function (resultObject) {
      return resultObject.totalCount > 0 && loadOptions.totalSummary ? aggregateCall(collection, [].concat(_toConsumableArray(contextOptions.preProcessingPipeline), _toConsumableArray(completeFilterPipelineDetails.pipeline), _toConsumableArray(createSummaryPipeline(loadOptions.totalSummary, contextOptions))), 'summary').toArray().then(function (r) {
        return populateSummaryResults(resultObject, loadOptions.totalSummary, r[0]);
      }) : Promise.resolve(resultObject);
    };
  };

  var queryGroups = function queryGroups(collection) {
    var completeFilterPipelineDetails = createCompleteFilterPipeline(loadOptions.searchExpr, loadOptions.searchOperation, loadOptions.searchValue, loadOptions.filter, contextOptions);
    var summaryPipeline = createSummaryPipeline(loadOptions.groupSummary, contextOptions);
    var skipTakePipeline = createSkipTakePipeline(loadOptions.skip, loadOptions.take, contextOptions);

    var mainQueryResult = function mainQueryResult() {
      return queryGroup(collection, 0, createSummaryQueryExecutor(undefined), completeFilterPipelineDetails, skipTakePipeline, summaryPipeline).then(function (r) {
        return { data: r };
      });
    };

    var groupCount = function groupCount() {
      if (loadOptions.requireGroupCount) {
        var group = loadOptions.group[0];

        return [getCount(collection, [].concat(_toConsumableArray(contextOptions.preProcessingPipeline), _toConsumableArray(completeFilterPipelineDetails.pipeline), _toConsumableArray(createGroupingPipeline(group.desc, false, true, createGroupKeyPipeline(group.selector, group.groupInterval, 0, contextOptions), contextOptions)), _toConsumableArray(createCountPipeline(contextOptions)))).then(function (r) {
          return { groupCount: r };
        })];
      } else return [];
    };

    return Promise.all([mainQueryResult()].concat(_toConsumableArray(groupCount()), _toConsumableArray(totalCount(collection, completeFilterPipelineDetails)))).then(merge).then(summary(collection, completeFilterPipelineDetails));
  };

  var querySimple = function querySimple(collection) {
    var completeFilterPipelineDetails = createCompleteFilterPipeline(loadOptions.searchExpr, loadOptions.searchOperation, loadOptions.searchValue, loadOptions.filter, contextOptions);
    var sortPipeline = createSortPipeline(loadOptions.sort, contextOptions);
    var skipTakePipeline = createSkipTakePipeline(loadOptions.skip, loadOptions.take, contextOptions);
    var selectPipeline = createSelectPipeline(loadOptions.select, contextOptions);
    var removeNestedFieldsPipeline = createRemoveNestedFieldsPipeline(completeFilterPipelineDetails.nestedFields, contextOptions);

    var mainQueryResult = function mainQueryResult() {
      return aggregateCall(collection, [].concat(_toConsumableArray(contextOptions.preProcessingPipeline), _toConsumableArray(completeFilterPipelineDetails.pipeline), _toConsumableArray(sortPipeline), _toConsumableArray(skipTakePipeline), _toConsumableArray(selectPipeline), _toConsumableArray(removeNestedFieldsPipeline)), 'mainQueryResult').toArray().then(function (r) {
        return r.map(replaceId);
      }).then(function (r) {
        return { data: r };
      });
    };

    return Promise.all([mainQueryResult()].concat(_toConsumableArray(totalCount(collection, completeFilterPipelineDetails)))).then(merge).then(summary(collection, completeFilterPipelineDetails));
  };

  return { queryGroups: queryGroups, querySimple: querySimple };
}

function filterAggregateOptions(proposedOptions) {
  var acceptableAggregateOptionNames = ['allowDiskUse', 'maxTimeMS', 'readConcern', 'collation', 'hint', 'comment'];
  return Object.keys(proposedOptions).reduce(function (r, v) {
    return acceptableAggregateOptionNames.includes(v) ? _extends({}, r, _defineProperty({}, v, proposedOptions[v])) : r;
  }, {});
}

function query(collection) {
  var loadOptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

  var proposedAggregateOptions = options.aggregateOptions;
  delete options.aggregateOptions;

  var standardContextOptions = {
    replaceIds: true,
    summaryQueryLimit: 100,

    timezoneOffset: 0,
    preProcessingPipeline: [],
    caseInsensitiveRegex: true
  };
  var contextOptions = Object.assign(standardContextOptions, options);

  if (!options.dynamicAggregateOptions && proposedAggregateOptions) contextOptions.aggregateOptions = filterAggregateOptions(proposedAggregateOptions);

  var context = createContext(contextOptions, loadOptions);

  return loadOptions.group && loadOptions.group.length > 0 ? context.queryGroups(collection) : context.querySimple(collection);
}

module.exports = query;