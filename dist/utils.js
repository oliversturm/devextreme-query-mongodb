"use strict";

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var replaceId = function replaceId(item) {
  return item._id ? _extends({}, item, { _id: item._id.toHexString() }) : item;
};

var createSummaryQueryExecutor = function createSummaryQueryExecutor(limit) {
  var queriesExecuted = 0;

  return function (fn) {
    return !limit || ++queriesExecuted <= limit ? fn() : Promise.resolve();
  };
};

var merge = function merge(os) {
  return Object.assign.apply(Object, [{}].concat(_toConsumableArray(os)));
};

var debug = function debug(id, f) {
  var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

  var output = options.output || console.log;
  var processResult = options.processResult || function (result) {
    return result;
  };
  var processArgs = options.processArgs || function (args) {
    return args;
  };
  return function () {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    output("DEBUG(" + id + "): ", processArgs(args));
    var result = f.apply(undefined, args);
    output("DEBUG(" + id + "/result): ", processResult(result));
    return result;
  };
};

module.exports = { replaceId: replaceId, createSummaryQueryExecutor: createSummaryQueryExecutor, merge: merge, debug: debug };