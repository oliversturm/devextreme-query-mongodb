'use strict';

var query = function () {
  var _ref8 = _asyncToGenerator(regeneratorRuntime.mark(function _callee8(collection) {
    var loadOptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    var standardContextOptions, contextOptions, context;
    return regeneratorRuntime.wrap(function _callee8$(_context9) {
      while (1) {
        switch (_context9.prev = _context9.next) {
          case 0:
            standardContextOptions = {
              replaceIds: true,
              summaryQueryLimit: 100,

              timezoneOffset: 0
            };
            contextOptions = Object.assign(standardContextOptions, options);
            context = createContext(contextOptions, loadOptions);
            return _context9.abrupt('return', loadOptions.group && loadOptions.group.length > 0 ? context.queryGroups(collection, loadOptions) : context.querySimple(collection, loadOptions));

          case 4:
          case 'end':
            return _context9.stop();
        }
      }
    }, _callee8, this);
  }));

  return function query(_x27) {
    return _ref8.apply(this, arguments);
  };
}();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function createContext(contextOptions, loadOptions) {
  return {
    replaceId: function replaceId(item) {
      if (!contextOptions.replaceIds) return item;
      if (item._id) item._id = item._id.toHexString();
      return item;
    },

    createSummaryQueryExecutor: function createSummaryQueryExecutor() {
      var queriesExecuted = 0;

      return function () {
        var _ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee(fn) {
          return regeneratorRuntime.wrap(function _callee$(_context) {
            while (1) {
              switch (_context.prev = _context.next) {
                case 0:
                  if (!(!contextOptions.summaryQueryLimit || ++queriesExecuted <= contextOptions.summaryQueryLimit)) {
                    _context.next = 3;
                    break;
                  }

                  _context.next = 3;
                  return fn();

                case 3:
                case 'end':
                  return _context.stop();
              }
            }
          }, _callee, this);
        }));

        return function (_x) {
          return _ref.apply(this, arguments);
        };
      }();
    },

    createGroupFieldName: function createGroupFieldName(groupIndex) {
      return '___group_key_' + groupIndex;
    },

    createGroupKeyPipeline: function createGroupKeyPipeline(selector, groupInterval, groupIndex) {
      var _this = this;

      var wrapGroupKey = function wrapGroupKey(keyExpr) {
        var field = {};
        field[_this.createGroupFieldName(groupIndex)] = keyExpr;

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
    },

    createGroupStagePipeline: function createGroupStagePipeline(countingSeparately, includeDataItems, itemProjection, groupKeyPipeline) {
      var result = {
        $group: {
          _id: '$' + this.createGroupFieldName(groupKeyPipeline.groupIndex)
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
    },

    createGroupingPipeline: function createGroupingPipeline(desc, includeDataItems, countingSeparately, groupKeyPipeline) {
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

      var pipeline = this.createGroupStagePipeline(countingSeparately, includeDataItems, itemProjection, groupKeyPipeline).concat([projectStage, sortStage]);

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
    },

    createSkipTakePipeline: function createSkipTakePipeline() {
      var pipeline = [];

      if (loadOptions.skip) pipeline.push({
        $skip: loadOptions.skip
      });
      if (loadOptions.take) pipeline.push({
        $limit: loadOptions.take
      });

      return pipeline;
    },

    createCountPipeline: function createCountPipeline() {
      return [{
        $count: 'count'
      }];
    },

    createMatchPipeline: function createMatchPipeline(selector, value) {
      var match = {
        $match: {}
      };
      match.$match[selector] = value;
      return [match];
    },

    createFilterPipeline: function createFilterPipeline(filter) {
      var dummy = {
        pipeline: [],
        fieldList: []
      };

      if (filter) {
        var fieldList = [];
        var match = this.parseFilter(filter, fieldList);
        if (match) return {
          pipeline: [{
            $match: match
          }],
          fieldList: fieldList
        };else return dummy;
      } else return dummy;
    },

    createSortPipeline: function createSortPipeline() {
      if (loadOptions.sort) {
        var sorting = {};
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = loadOptions.sort[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var sf = _step.value;

            sorting[sf.selector] = sf.desc ? -1 : 1;
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
          $sort: sorting
        }];
      } else return [];
    },

    createSummaryPipeline: function createSummaryPipeline(summary) {
      if (summary) {
        var gc = { _id: null };
        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
          for (var _iterator2 = summary[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
            var s = _step2.value;

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
            }
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

        return [{
          $group: gc
        }];
      } else return [];
    },

    createSearchPipeline: function createSearchPipeline(expr, op, val) {
      var dummy = {
        pipeline: [],
        fieldList: []
      };

      if (!expr || !op || !val) return dummy;

      var criteria = void 0;
      if (typeof expr === 'string') criteria = [expr, op, val];else if (expr.length > 0) {
        criteria = [];
        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = expr[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            var exprItem = _step3.value;

            if (criteria.length) criteria.push('or');
            criteria.push([exprItem, op, val]);
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
      } else return dummy;

      return this.createFilterPipeline(criteria);
    },

    createSelectProjectExpression: function createSelectProjectExpression(fields) {
      var explicitId = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

      if (fields && fields.length > 0) {
        var project = {};
        if (explicitId) project._id = '$_id';
        var _iteratorNormalCompletion4 = true;
        var _didIteratorError4 = false;
        var _iteratorError4 = undefined;

        try {
          for (var _iterator4 = fields[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
            var field = _step4.value;

            project[field] = '$' + field;
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

        return project;
      } else return undefined;
    },

    createSelectPipeline: function createSelectPipeline(fields) {
      if (fields && fields.length > 0) {
        return [{
          $project: this.createSelectProjectExpression(fields)
        }];
      } else return [];
    },

    getCount: function () {
      var _ref2 = _asyncToGenerator(regeneratorRuntime.mark(function _callee2(collection, pipeline) {
        var coll;
        return regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                _context2.next = 2;
                return collection.aggregate(pipeline).toArray();

              case 2:
                coll = _context2.sent;
                return _context2.abrupt('return', coll.length > 0 ? coll[0].count : 0);

              case 4:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function getCount(_x4, _x5) {
        return _ref2.apply(this, arguments);
      }

      return getCount;
    }(),

    parseFilter: function parseFilter(element, fieldList) {
      var _this2 = this;

      function construct(fieldName, operator, compValue) {
        var result = {};
        result[fieldName] = {};
        result[fieldName][operator] = compValue;
        return result;
      }

      function constructRegex(fieldName, regex) {
        var result = {};
        result[fieldName] = {
          $regex: regex,
          $options: '' };
        return result;
      }

      if (typeof element === 'string') {
        fieldList.push(element);
        var nf = this.checkNestedField(element);
        var fieldName = nf ? nf.filterFieldName : element;
        return construct(fieldName, '$eq', true);
      } else if (element.length) {
        if (element.length === 1 && element[0].length) {
          return this.parseFilter(element[0], fieldList);
        } else if (element.length === 2) {
          if (element[0] === '!') {
            var nor = this.parseFilter(element[1], fieldList);
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
                  var nestedFilter = _this2.parseFilter(v, fieldList);
                  if (nestedFilter) r.list.push(nestedFilter);
                  return { list: r.list, previous: true };
                }
              }, { list: [], previous: false }).list;

              return result;
            } else return null;
          } else {
            if (element.length === 3) {
              fieldList.push(element[0]);
              var _nf = this.checkNestedField(element[0]);
              var _fieldName = _nf ? _nf.filterFieldName : element[0];

              switch (operator) {
                case '=':
                  return construct(_fieldName, '$eq', element[2]);
                case '<>':
                  return construct(_fieldName, '$ne', element[2]);
                case '>':
                  return construct(_fieldName, '$gt', element[2]);
                case '>=':
                  return construct(_fieldName, '$gte', element[2]);
                case '<':
                  return construct(_fieldName, '$lt', element[2]);
                case '<=':
                  return construct(_fieldName, '$lte', element[2]);
                case 'startswith':
                  return constructRegex(_fieldName, '^' + element[2]);
                case 'endswith':
                  return constructRegex(_fieldName, element[2] + '$');
                case 'contains':
                  return constructRegex(_fieldName, element[2]);
                case 'notcontains':
                  return constructRegex(_fieldName, '^((?!' + element[2] + ').)*$');
                default:
                  return null;
              }
            } else return null;
          }
        } else return null;
      } else return null;
    },

    populateSummaryResults: function populateSummaryResults(target, summary, summaryResults) {
      if (summary) {
        target.summary = [];

        var _iteratorNormalCompletion5 = true;
        var _didIteratorError5 = false;
        var _iteratorError5 = undefined;

        try {
          for (var _iterator5 = summary[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
            var s = _step5.value;

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
            }
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
      }
    },

    queryGroupData: function () {
      var _ref3 = _asyncToGenerator(regeneratorRuntime.mark(function _callee3(collection, desc, includeDataItems, countSeparately, itemProjection, groupKeyPipeline, sortPipeline, filterPipelineDetails, skipTakePipeline, matchPipeline) {
        var pipeline, groupData, _iteratorNormalCompletion6, _didIteratorError6, _iteratorError6, _iterator6, _step6, groupItem;

        return regeneratorRuntime.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                pipeline = sortPipeline.concat(filterPipelineDetails.pipeline, matchPipeline, this.createRemoveNestedFieldsPipeline(filterPipelineDetails.nestedFields), this.createGroupingPipeline(desc, includeDataItems, countSeparately, groupKeyPipeline, itemProjection), skipTakePipeline);
                _context3.next = 3;
                return collection.aggregate(pipeline).toArray();

              case 3:
                groupData = _context3.sent;

                if (!includeDataItems) {
                  _context3.next = 24;
                  break;
                }

                _iteratorNormalCompletion6 = true;
                _didIteratorError6 = false;
                _iteratorError6 = undefined;
                _context3.prev = 8;

                for (_iterator6 = groupData[Symbol.iterator](); !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                  groupItem = _step6.value;

                  groupItem.items = groupItem.items.map(this.replaceId);
                }
                _context3.next = 16;
                break;

              case 12:
                _context3.prev = 12;
                _context3.t0 = _context3['catch'](8);
                _didIteratorError6 = true;
                _iteratorError6 = _context3.t0;

              case 16:
                _context3.prev = 16;
                _context3.prev = 17;

                if (!_iteratorNormalCompletion6 && _iterator6.return) {
                  _iterator6.return();
                }

              case 19:
                _context3.prev = 19;

                if (!_didIteratorError6) {
                  _context3.next = 22;
                  break;
                }

                throw _iteratorError6;

              case 22:
                return _context3.finish(19);

              case 23:
                return _context3.finish(16);

              case 24:
                return _context3.abrupt('return', groupData);

              case 25:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this, [[8, 12, 16, 24], [17,, 19, 23]]);
      }));

      function queryGroupData(_x6, _x7, _x8, _x9, _x10, _x11, _x12, _x13, _x14, _x15) {
        return _ref3.apply(this, arguments);
      }

      return queryGroupData;
    }(),

    queryGroup: function () {
      var _ref4 = _asyncToGenerator(regeneratorRuntime.mark(function _callee5(collection, groupIndex, runSummaryQuery, filterPipelineDetails) {
        var skipTakePipeline = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : [];

        var _this3 = this;

        var summaryPipeline = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : [];
        var matchPipeline = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : [];

        var group, lastGroup, itemDataRequired, separateCountRequired, subGroupsRequired, summariesRequired, groupKeyPipeline, groupData, _iteratorNormalCompletion7, _didIteratorError7, _iteratorError7, _iterator7, _step7, groupDataItem, nextGroup, nextGroupKeyPipeline, _iteratorNormalCompletion8, _didIteratorError8, _iteratorError8, _iterator8, _step8, _groupDataItem, pipeline, _loop, _iteratorNormalCompletion9, _didIteratorError9, _iteratorError9, _iterator9, _step9, _groupDataItem2;

        return regeneratorRuntime.wrap(function _callee5$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                group = loadOptions.group[groupIndex];
                lastGroup = groupIndex === loadOptions.group.length - 1;
                itemDataRequired = lastGroup && group.isExpanded;
                separateCountRequired = !lastGroup;
                subGroupsRequired = !lastGroup;
                summariesRequired = loadOptions.groupSummary && loadOptions.groupSummary.length > 0;
                groupKeyPipeline = this.createGroupKeyPipeline(group.selector, group.groupInterval, groupIndex);
                _context6.next = 9;
                return this.queryGroupData(collection, group.desc, itemDataRequired, separateCountRequired, this.createSelectProjectExpression(loadOptions.select, true), groupKeyPipeline, itemDataRequired ? this.createSortPipeline() : [], filterPipelineDetails, skipTakePipeline, matchPipeline);

              case 9:
                groupData = _context6.sent;

                if (!subGroupsRequired) {
                  _context6.next = 41;
                  break;
                }

                _iteratorNormalCompletion7 = true;
                _didIteratorError7 = false;
                _iteratorError7 = undefined;
                _context6.prev = 14;
                _iterator7 = groupData[Symbol.iterator]();

              case 16:
                if (_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done) {
                  _context6.next = 25;
                  break;
                }

                groupDataItem = _step7.value;
                _context6.next = 20;
                return this.queryGroup(collection, groupIndex + 1, runSummaryQuery, filterPipelineDetails, [], summaryPipeline, matchPipeline.concat(groupKeyPipeline, this.createMatchPipeline(this.createGroupFieldName(groupIndex), groupDataItem.key)));

              case 20:
                groupDataItem.items = _context6.sent;

                groupDataItem.count = groupDataItem.items.length;

              case 22:
                _iteratorNormalCompletion7 = true;
                _context6.next = 16;
                break;

              case 25:
                _context6.next = 31;
                break;

              case 27:
                _context6.prev = 27;
                _context6.t0 = _context6['catch'](14);
                _didIteratorError7 = true;
                _iteratorError7 = _context6.t0;

              case 31:
                _context6.prev = 31;
                _context6.prev = 32;

                if (!_iteratorNormalCompletion7 && _iterator7.return) {
                  _iterator7.return();
                }

              case 34:
                _context6.prev = 34;

                if (!_didIteratorError7) {
                  _context6.next = 37;
                  break;
                }

                throw _iteratorError7;

              case 37:
                return _context6.finish(34);

              case 38:
                return _context6.finish(31);

              case 39:
                _context6.next = 72;
                break;

              case 41:
                if (!separateCountRequired) {
                  _context6.next = 72;
                  break;
                }

                nextGroup = loadOptions.group[groupIndex + 1];
                nextGroupKeyPipeline = this.createGroupKeyPipeline(nextGroup.selector, nextGroup.groupInterval, groupIndex + 1);
                _iteratorNormalCompletion8 = true;
                _didIteratorError8 = false;
                _iteratorError8 = undefined;
                _context6.prev = 47;
                _iterator8 = groupData[Symbol.iterator]();

              case 49:
                if (_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done) {
                  _context6.next = 58;
                  break;
                }

                _groupDataItem = _step8.value;
                pipeline = filterPipelineDetails.pipeline.concat(groupKeyPipeline, matchPipeline.concat(this.createMatchPipeline(this.createGroupFieldName(groupIndex), _groupDataItem.key)), this.createGroupingPipeline(nextGroup.desc, false, true, nextGroupKeyPipeline), this.createCountPipeline());
                _context6.next = 54;
                return this.getCount(collection, pipeline);

              case 54:
                _groupDataItem.count = _context6.sent;

              case 55:
                _iteratorNormalCompletion8 = true;
                _context6.next = 49;
                break;

              case 58:
                _context6.next = 64;
                break;

              case 60:
                _context6.prev = 60;
                _context6.t1 = _context6['catch'](47);
                _didIteratorError8 = true;
                _iteratorError8 = _context6.t1;

              case 64:
                _context6.prev = 64;
                _context6.prev = 65;

                if (!_iteratorNormalCompletion8 && _iterator8.return) {
                  _iterator8.return();
                }

              case 67:
                _context6.prev = 67;

                if (!_didIteratorError8) {
                  _context6.next = 70;
                  break;
                }

                throw _iteratorError8;

              case 70:
                return _context6.finish(67);

              case 71:
                return _context6.finish(64);

              case 72:
                if (!summariesRequired) {
                  _context6.next = 99;
                  break;
                }

                _loop = regeneratorRuntime.mark(function _loop(_groupDataItem2) {
                  return regeneratorRuntime.wrap(function _loop$(_context5) {
                    while (1) {
                      switch (_context5.prev = _context5.next) {
                        case 0:
                          _context5.next = 2;
                          return runSummaryQuery(_asyncToGenerator(regeneratorRuntime.mark(function _callee4() {
                            var summaryQueryPipeline;
                            return regeneratorRuntime.wrap(function _callee4$(_context4) {
                              while (1) {
                                switch (_context4.prev = _context4.next) {
                                  case 0:
                                    summaryQueryPipeline = filterPipelineDetails.pipeline.concat(groupKeyPipeline, matchPipeline.concat(_this3.createMatchPipeline(_this3.createGroupFieldName(groupIndex), _groupDataItem2.key)), summaryPipeline);
                                    _context4.t0 = _this3;
                                    _context4.t1 = _groupDataItem2;
                                    _context4.t2 = loadOptions.groupSummary;
                                    _context4.next = 6;
                                    return collection.aggregate(summaryQueryPipeline).toArray();

                                  case 6:
                                    _context4.t3 = _context4.sent[0];

                                    _context4.t0.populateSummaryResults.call(_context4.t0, _context4.t1, _context4.t2, _context4.t3);

                                  case 8:
                                  case 'end':
                                    return _context4.stop();
                                }
                              }
                            }, _callee4, _this3);
                          })));

                        case 2:
                        case 'end':
                          return _context5.stop();
                      }
                    }
                  }, _loop, _this3);
                });
                _iteratorNormalCompletion9 = true;
                _didIteratorError9 = false;
                _iteratorError9 = undefined;
                _context6.prev = 77;
                _iterator9 = groupData[Symbol.iterator]();

              case 79:
                if (_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done) {
                  _context6.next = 85;
                  break;
                }

                _groupDataItem2 = _step9.value;
                return _context6.delegateYield(_loop(_groupDataItem2), 't2', 82);

              case 82:
                _iteratorNormalCompletion9 = true;
                _context6.next = 79;
                break;

              case 85:
                _context6.next = 91;
                break;

              case 87:
                _context6.prev = 87;
                _context6.t3 = _context6['catch'](77);
                _didIteratorError9 = true;
                _iteratorError9 = _context6.t3;

              case 91:
                _context6.prev = 91;
                _context6.prev = 92;

                if (!_iteratorNormalCompletion9 && _iterator9.return) {
                  _iterator9.return();
                }

              case 94:
                _context6.prev = 94;

                if (!_didIteratorError9) {
                  _context6.next = 97;
                  break;
                }

                throw _iteratorError9;

              case 97:
                return _context6.finish(94);

              case 98:
                return _context6.finish(91);

              case 99:
                return _context6.abrupt('return', groupData);

              case 100:
              case 'end':
                return _context6.stop();
            }
          }
        }, _callee5, this, [[14, 27, 31, 39], [32,, 34, 38], [47, 60, 64, 72], [65,, 67, 71], [77, 87, 91, 99], [92,, 94, 98]]);
      }));

      function queryGroup(_x19, _x20, _x21, _x22) {
        return _ref4.apply(this, arguments);
      }

      return queryGroup;
    }(),

    nestedFieldRegex: /^([^.]+)\.(year|quarter|month|dayofweek|day)$/i,

    checkNestedField: function checkNestedField(fieldName) {
      var match = this.nestedFieldRegex.exec(fieldName);
      if (!match) return undefined;
      return {
        base: match[1],
        nested: match[2],
        filterFieldName: '___' + match[1] + '_' + match[2]
      };
    },

    createAddNestedFieldsPipeline: function createAddNestedFieldsPipeline(fieldNames) {
      var _this4 = this;

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
        var nf = _this4.checkNestedField(v);

        if (nf) {
          var nestedFunction = nf.nested.toLowerCase();
          if (['year', 'quarter', 'month', 'day', 'dayofweek'].includes(nestedFunction)) {
            var tafield = {
              $subtract: ['$' + nf.base, contextOptions.timezoneOffset * 60 * 1000]
            };

            switch (nf.nested.toLowerCase()) {
              case 'year':
                r.pipeline[1][nf.filterFieldName] = {
                  $year: tafield
                };
                r.nestedFields.push(nf.filterFieldName);
                break;
              case 'quarter':
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
    },

    createCompleteFilterPipeline: function createCompleteFilterPipeline() {
      var searchPipeline = this.createSearchPipeline(loadOptions.searchExpr, loadOptions.searchOperation, loadOptions.searchValue);

      var filterPipeline = this.createFilterPipeline(loadOptions.filter);

      var addNestedFieldsPipelineDetails = this.createAddNestedFieldsPipeline(searchPipeline.fieldList.concat(filterPipeline.fieldList));

      return {
        pipeline: addNestedFieldsPipelineDetails.pipeline.concat(searchPipeline.pipeline, filterPipeline.pipeline),
        nestedFields: addNestedFieldsPipelineDetails.nestedFields
      };
    },

    createRemoveNestedFieldsPipeline: function createRemoveNestedFieldsPipeline(nestedFields) {
      if (nestedFields.length === 0) return [];

      var pd = {};
      var _iteratorNormalCompletion10 = true;
      var _didIteratorError10 = false;
      var _iteratorError10 = undefined;

      try {
        for (var _iterator10 = nestedFields[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
          var f = _step10.value;

          pd[f] = 0;
        }
      } catch (err) {
        _didIteratorError10 = true;
        _iteratorError10 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion10 && _iterator10.return) {
            _iterator10.return();
          }
        } finally {
          if (_didIteratorError10) {
            throw _iteratorError10;
          }
        }
      }

      return [{
        $project: pd
      }];
    },

    queryGroups: function () {
      var _ref6 = _asyncToGenerator(regeneratorRuntime.mark(function _callee6(collection) {
        var completeFilterPipelineDetails, summaryPipeline, skipTakePipeline, resultObject, group, groupCountPipeline, totalCountPipeline, _summaryPipeline;

        return regeneratorRuntime.wrap(function _callee6$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                completeFilterPipelineDetails = this.createCompleteFilterPipeline();
                summaryPipeline = this.createSummaryPipeline(loadOptions.groupSummary);
                skipTakePipeline = this.createSkipTakePipeline();
                _context7.next = 5;
                return this.queryGroup(collection, 0, this.createSummaryQueryExecutor(), completeFilterPipelineDetails, skipTakePipeline, summaryPipeline);

              case 5:
                _context7.t0 = _context7.sent;
                resultObject = {
                  data: _context7.t0
                };

                if (!loadOptions.requireGroupCount) {
                  _context7.next = 13;
                  break;
                }

                group = loadOptions.group[0];
                groupCountPipeline = completeFilterPipelineDetails.pipeline.concat(this.createGroupingPipeline(group.desc, false, true, this.createGroupKeyPipeline(group.selector, group.groupInterval, 0)), this.createCountPipeline());
                _context7.next = 12;
                return this.getCount(collection, groupCountPipeline);

              case 12:
                resultObject.groupCount = _context7.sent;

              case 13:
                if (!(loadOptions.requireTotalCount || loadOptions.totalSummary)) {
                  _context7.next = 18;
                  break;
                }

                totalCountPipeline = completeFilterPipelineDetails.pipeline.concat(this.createCountPipeline());
                _context7.next = 17;
                return this.getCount(collection, totalCountPipeline);

              case 17:
                resultObject.totalCount = _context7.sent;

              case 18:
                if (!(resultObject.totalCount > 0 && loadOptions.totalSummary)) {
                  _context7.next = 27;
                  break;
                }

                _summaryPipeline = completeFilterPipelineDetails.pipeline.concat(this.createSummaryPipeline(loadOptions.totalSummary));
                _context7.t1 = this;
                _context7.t2 = resultObject;
                _context7.t3 = loadOptions.totalSummary;
                _context7.next = 25;
                return collection.aggregate(_summaryPipeline).toArray();

              case 25:
                _context7.t4 = _context7.sent[0];

                _context7.t1.populateSummaryResults.call(_context7.t1, _context7.t2, _context7.t3, _context7.t4);

              case 27:
                return _context7.abrupt('return', resultObject);

              case 28:
              case 'end':
                return _context7.stop();
            }
          }
        }, _callee6, this);
      }));

      function queryGroups(_x23) {
        return _ref6.apply(this, arguments);
      }

      return queryGroups;
    }(),

    querySimple: function () {
      var _ref7 = _asyncToGenerator(regeneratorRuntime.mark(function _callee7(collection) {
        var completeFilterPipelineDetails, sortPipeline, skipTakePipeline, selectPipeline, removeNestedFieldsPipeline, dataPipeline, resultObject, countPipeline, summaryPipeline;
        return regeneratorRuntime.wrap(function _callee7$(_context8) {
          while (1) {
            switch (_context8.prev = _context8.next) {
              case 0:
                completeFilterPipelineDetails = this.createCompleteFilterPipeline();
                sortPipeline = this.createSortPipeline();
                skipTakePipeline = this.createSkipTakePipeline();
                selectPipeline = this.createSelectPipeline(loadOptions.select);
                removeNestedFieldsPipeline = this.createRemoveNestedFieldsPipeline(completeFilterPipelineDetails.nestedFields);
                dataPipeline = completeFilterPipelineDetails.pipeline.concat(sortPipeline, skipTakePipeline, selectPipeline, removeNestedFieldsPipeline);
                _context8.next = 8;
                return collection.aggregate(dataPipeline).toArray();

              case 8:
                _context8.t0 = this.replaceId;
                _context8.t1 = _context8.sent.map(_context8.t0);
                resultObject = {
                  data: _context8.t1
                };

                if (!(loadOptions.requireTotalCount || loadOptions.totalSummary)) {
                  _context8.next = 16;
                  break;
                }

                countPipeline = completeFilterPipelineDetails.pipeline.concat(this.createCountPipeline());
                _context8.next = 15;
                return this.getCount(collection, countPipeline);

              case 15:
                resultObject.totalCount = _context8.sent;

              case 16:
                if (!(resultObject.totalCount > 0 && loadOptions.totalSummary)) {
                  _context8.next = 25;
                  break;
                }

                summaryPipeline = completeFilterPipelineDetails.pipeline.concat(this.createSummaryPipeline(loadOptions.totalSummary));
                _context8.t2 = this;
                _context8.t3 = resultObject;
                _context8.t4 = loadOptions.totalSummary;
                _context8.next = 23;
                return collection.aggregate(summaryPipeline).toArray();

              case 23:
                _context8.t5 = _context8.sent[0];

                _context8.t2.populateSummaryResults.call(_context8.t2, _context8.t3, _context8.t4, _context8.t5);

              case 25:
                return _context8.abrupt('return', resultObject);

              case 26:
              case 'end':
                return _context8.stop();
            }
          }
        }, _callee7, this);
      }));

      function querySimple(_x24) {
        return _ref7.apply(this, arguments);
      }

      return querySimple;
    }()
  };
}

module.exports = query;