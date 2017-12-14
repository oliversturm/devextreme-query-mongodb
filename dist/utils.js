"use strict";

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

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
  return Object.assign({}, os);
};

module.exports = { replaceId: replaceId, createSummaryQueryExecutor: createSummaryQueryExecutor, merge: merge };