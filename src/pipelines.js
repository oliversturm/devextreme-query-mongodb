const { ObjectId } = require('mongodb');

const createGroupFieldName = (groupIndex) => '___group_key_' + groupIndex;

// much more complicated than it should be because braindead mongo
// doesn't support integer division by itself
// so I'm doing (dividend - (dividend MOD divisor)) / divisor
const divInt = (dividend, divisor) => ({
  $divide: [subtractMod(dividend, divisor), divisor],
});

const subtractMod = (a, b) => ({
  $subtract: [
    a,
    {
      $mod: [a, b],
    },
  ],
});

const createGroupKeyPipeline = (
  selector,
  groupInterval,
  groupIndex,
  contextOptions
) => {
  const { timezoneOffset } = contextOptions;

  const wrapGroupKey = (keyExpr) => ({
    $addFields: { [createGroupFieldName(groupIndex)]: keyExpr },
  });

  const prefix = (s) => '$' + s;

  const pipe = (...args) => {
    let result = Array.from(args);
    result.groupIndex = groupIndex;
    return result;
  };

  if (groupInterval) {
    const numericInterval = parseInt(Number(groupInterval));
    if (numericInterval) {
      return pipe(wrapGroupKey(subtractMod(prefix(selector), numericInterval)));
    } else {
      // timezone adjusted field
      const tafield = {
        $subtract: [prefix(selector), timezoneOffset * 60 * 1000],
      };

      switch (groupInterval) {
        case 'year':
          return pipe(
            wrapGroupKey({
              $year: tafield,
            })
          );
        case 'quarter':
          return pipe(
            {
              // need to pre-calculate month(date)+2, because the divInt logic
              // will reuse the field and we don't want to calculate it multiple
              // times
              $addFields: {
                ___mp2: {
                  $add: [
                    {
                      $month: tafield,
                    },
                    2,
                  ],
                },
              },
            },
            wrapGroupKey(divInt('$___mp2', 3))
          );
        case 'month':
          return pipe(
            wrapGroupKey({
              $month: tafield,
            })
          );
        case 'day':
          return pipe(
            wrapGroupKey({
              $dayOfMonth: tafield,
            })
          );
        case 'dayOfWeek':
          return pipe(
            wrapGroupKey({
              $subtract: [
                {
                  $dayOfWeek: tafield, // correct in that it's sunday to saturday, but it's 1-7 (must be 0-6)
                },
                1,
              ],
            })
          );
        case 'hour':
          return pipe(
            wrapGroupKey({
              $hour: tafield,
            })
          );
        case 'minute':
          return pipe(
            wrapGroupKey({
              $minute: tafield,
            })
          );
        case 'second':
          return pipe(
            wrapGroupKey({
              $second: tafield,
            })
          );
        default:
          // unknown grouping operator, ignoring
          return pipe(wrapGroupKey(prefix(selector)));
      }
    }
  } else {
    return pipe(wrapGroupKey(prefix(selector)));
  }
};

const createGroupStagePipeline = (
  includeDataItems,
  countingSeparately,
  itemProjection,
  groupKeyPipeline
) => {
  let result = {
    $group: {
      // must use _id at this point for the group key
      _id: '$' + createGroupFieldName(groupKeyPipeline.groupIndex),
    },
  };
  if (!countingSeparately) {
    // this method of counting results in the number of data items in the group
    // if the group has sub-groups, it can't be used
    result.$group.count = {
      $sum: 1,
    };
  }
  if (includeDataItems) {
    // include items directly if we're expected to do so, and if this is the
    // most deeply nested group in case there are several
    result.$group.items = {
      $push: itemProjection,
    };
  }

  return groupKeyPipeline.concat([result]);
};

const createGroupingPipeline = (
  desc,
  includeDataItems,
  countingSeparately,
  groupKeyPipeline,
  itemProjection = '$$CURRENT'
) => {
  let projectStage = {
    $project: {
      // rename _id to key
      _id: 0,
      key: '$_id',
    },
  };
  let sortStage = {
    $sort: {
      key: desc ? -1 : 1,
    },
  };

  let pipeline = createGroupStagePipeline(
    includeDataItems,
    countingSeparately,
    itemProjection,
    groupKeyPipeline
  ).concat([projectStage, sortStage]);

  if (!countingSeparately) {
    // this method of counting results in the number of data items in the group
    // if the group has sub-groups, it can't be used
    projectStage.$project.count = 1;
  }

  if (includeDataItems) {
    // include items directly if we're expected to do so, and if this is the
    // most deeply nested group in case there are several
    projectStage.$project.items = 1;
  } else {
    // add null items field otherwise
    pipeline.push({
      $addFields: {
        items: null, // only null works, not [] or leaving out items altogether
      },
    });
  }

  return pipeline;
};

const createSkipTakePipeline = (skip, take) => {
  let pipeline = [];

  if (skip)
    pipeline.push({
      $skip: skip,
    });
  if (take)
    pipeline.push({
      $limit: take,
    });

  return pipeline;
};

const createCountPipeline = () => {
  return [
    {
      $count: 'count',
    },
  ];
};

const createMatchPipeline = (selector, value) => [
  { $match: { [selector]: value } },
];

const construct = (fieldName, operator, compValue) => ({
  [fieldName]: { [operator]: compValue },
});

const constructRegex = (fieldName, regex, caseInsensitive) => ({
  [fieldName]: { $regex: regex, $options: caseInsensitive ? 'i' : '' },
});

const isCorrectFilterOperatorStructure = (element, operator) =>
  element.reduce(
    (r, v) => {
      if (r.previous) return { ok: r.ok, previous: false };
      else
        return {
          ok: r.ok && typeof v === 'string' && v.toLowerCase() === operator,
          previous: true,
        };
    },
    { ok: true, previous: true }
  ).ok;

const isAndChainWithIncompleteAnds = (element) => {
  if (!Array.isArray(element)) return false;
  if (element.length < 2) return false;
  if (!Array.isArray(element[0])) return false;
  // this is important to prevent endless recursion
  if (isCorrectFilterOperatorStructure(element, 'and')) return false;
  return element.reduce(
    (r, v) =>
      r &&
      ((typeof v === 'string' && v.toLowerCase() === 'and') ||
        Array.isArray(v)),
    true
  );
};

function* _fixAndChainWithIncompleteAnds(chain) {
  // the function assumes that
  // isAndChainWithIncompleteAnds(chain) === true
  let firstDone = false;
  let expectAnd = true;
  for (const item of chain) {
    if (!firstDone) {
      yield item;
      firstDone = true;
    } else {
      if (expectAnd) {
        if (typeof item === 'string') {
          yield 'and';
          expectAnd = false;
        } else {
          yield 'and';
          yield item;
        }
      } else {
        if (typeof item !== 'string') {
          yield item;
          expectAnd = true;
        }
      }
    }
  }
}

const fixAndChainWithIncompleteAnds = (element) =>
  Array.from(_fixAndChainWithIncompleteAnds(element));

// eslint-disable-next-line complexity
const parseFilter = (element, contextOptions = {}) => {
  // Element can be a string denoting a field name - I don't know if that's a case
  // supported by the widgets in any way, but it seems conceivable that somebody constructs
  // an expression like [ "!", "boolValueField" ]
  // In the string case, I return a truth-checking filter.
  //
  // Element can be an array with two items
  // For two items:
  // 0: unary operator
  // 1: operand
  //
  // Element can be an array with an odd number of items
  // For three items:
  // 0: operand 1 - this is described as the "getter" in the docs - i.e. field name -
  //    but in the cases of "and" and "or" it could be another nested element
  // 1: operator
  // 2: operand 2 - the value for comparison - for "and" and "or" can be a nested element
  //
  // For more than three items, it's assumed that this is a chain of "or" or "and" -
  // either one or the other, no combinations
  // 0: operand 1
  // 1: "or" or "and"
  // 2: operand 2
  // 3: "or" or "and" - must be the same as (1) - see comment in test "incorrect operator chain"
  // 4: operand 3
  // .... etc
  //

  const { caseInsensitiveRegex } = contextOptions;

  const rval = (match, fieldList) => ({ match, fieldList });

  if (typeof element === 'string') {
    const nf = checkNestedField(element);
    const fieldName = nf ? nf.filterFieldName : element;
    return rval(construct(fieldName, '$eq', true), [element]);
  } else if (Array.isArray(element)) {
    if (element.length === 1 && Array.isArray(element[0])) {
      // assuming a nested array in this case:
      // the pivot grid sometimes does this
      // [ [ "field", "=", 5 ] ]
      return parseFilter(element[0], contextOptions);
    } else if (element.length === 2) {
      // unary operator - only one supported
      if (element[0] === '!') {
        const { match, fieldList } = parseFilter(element[1], contextOptions);
        if (match)
          return rval(
            {
              $nor: [match],
            },
            fieldList
          );
        else return null;
      } else if (isAndChainWithIncompleteAnds(element))
        return parseFilter(
          fixAndChainWithIncompleteAnds(element),
          contextOptions
        );
      else return null;
    } else {
      if (isAndChainWithIncompleteAnds(element))
        return parseFilter(
          fixAndChainWithIncompleteAnds(element),
          contextOptions
        );
      else if (element.length % 2 === 1) {
        // odd number of elements - let's see what the operator is
        const operator = String(element[1]).toLowerCase();

        if (['and', 'or'].includes(operator)) {
          if (isCorrectFilterOperatorStructure(element, operator)) {
            // all operators are the same - build a list of conditions from the nested
            // items, combine with the operator
            let result = element.reduce(
              (r, v) => {
                if (r.previous) return { ...r, previous: false };
                else {
                  const nestedResult = parseFilter(v, contextOptions);
                  const nestedFilter = nestedResult && nestedResult.match;
                  const fieldList = nestedResult ? nestedResult.fieldList : [];
                  if (nestedFilter) r.list.push(nestedFilter);
                  return {
                    list: r.list,
                    fieldList: r.fieldList.concat(fieldList),
                    previous: true,
                  };
                }
              },
              { list: [], fieldList: [], previous: false }
            );

            return rval({ ['$' + operator]: result.list }, result.fieldList);
          } else return null;
        } else {
          if (element.length === 3) {
            const nf = checkNestedField(element[0]);
            const fieldName = nf ? nf.filterFieldName : element[0];

            switch (operator) {
              case '=':
                return rval(construct(fieldName, '$eq', element[2]), [
                  element[0],
                ]);
              case '<>':
                return rval(construct(fieldName, '$ne', element[2]), [
                  element[0],
                ]);
              case '>':
                return rval(construct(fieldName, '$gt', element[2]), [
                  element[0],
                ]);
              case '>=':
                return rval(construct(fieldName, '$gte', element[2]), [
                  element[0],
                ]);
              case '<':
                return rval(construct(fieldName, '$lt', element[2]), [
                  element[0],
                ]);
              case '<=':
                return rval(construct(fieldName, '$lte', element[2]), [
                  element[0],
                ]);
              case 'startswith':
                return rval(
                  constructRegex(
                    fieldName,
                    '^' + element[2],
                    caseInsensitiveRegex
                  ),
                  [element[0]]
                );
              case 'endswith':
                return rval(
                  constructRegex(
                    fieldName,
                    element[2] + '$',
                    caseInsensitiveRegex
                  ),
                  [element[0]]
                );
              case 'contains':
                return rval(
                  constructRegex(fieldName, element[2], caseInsensitiveRegex),
                  [element[0]]
                );
              case 'notcontains':
                return rval(
                  constructRegex(
                    fieldName,
                    '^((?!' + element[2] + ').)*$',
                    caseInsensitiveRegex
                  ),
                  [element[0]]
                );
              case 'equalsobjectid':
                return rval(construct(fieldName, '$eq', ObjectId(element[2])), [
                  element[0],
                ]);
              default:
                return null;
            }
          } else return null;
        }
      } else return null;
    }
  } else return null;
};

const createFilterPipeline = (filter, contextOptions) => {
  const dummy = {
    pipeline: [],
    fieldList: [],
  };

  if (filter) {
    const result = parseFilter(filter, contextOptions);
    const match = result && result.match;
    const fieldList = result ? result.fieldList : [];
    if (match)
      return {
        pipeline: [
          {
            $match: match,
          },
        ],
        fieldList: fieldList,
      };
    else return dummy;
  } else return dummy;
};

const createSortPipeline = (sort) =>
  sort
    ? [
        {
          $sort: sort.reduce(
            (r, v) => ({ ...r, [v.selector]: v.desc ? -1 : 1 }),
            {}
          ),
        },
      ]
    : [];

const createSummaryPipeline = (summary) => {
  if (summary) {
    let gc = { _id: null };
    for (const s of summary) {
      switch (s.summaryType) {
        case 'sum':
        case 'avg':
        case 'min':
        case 'max':
          gc[`___${s.summaryType}${s.selector}`] = {
            [`$${s.summaryType}`]: `$${s.selector}`,
          };
          break;
        case 'count':
          gc.___count = { $sum: 1 };
          break;
        default:
          console.error(`Invalid summary type '${s.summaryType}', ignoring`);
          break;
      }
    }
    return [
      {
        $group: gc,
      },
    ];
  } else return [];
};

const createSearchPipeline = (expr, op, val, contextOptions) => {
  const dummy = {
    pipeline: [],
    fieldList: [],
  };

  if (!expr || !op || !val) return dummy;

  let criteria;
  if (typeof expr === 'string') criteria = [expr, op, val];
  else if (expr.length > 0) {
    criteria = [];
    for (const exprItem of expr) {
      if (criteria.length) criteria.push('or');
      criteria.push([exprItem, op, val]);
    }
  } else return dummy;

  return createFilterPipeline(criteria, contextOptions);
};

const createSelectProjectExpression = (fields, explicitId = false) => {
  if (fields && fields.length > 0) {
    let project = {};
    if (explicitId) project._id = '$_id';
    for (const field of fields) project[field] = '$' + field;
    return project;
  } else return undefined;
};

const createSelectPipeline = (fields, contextOptions) => {
  if (fields && fields.length > 0) {
    return [
      {
        $project: createSelectProjectExpression(fields, contextOptions),
      },
    ];
  } else return [];
};

// check whether any of the fields have a path structure ("field.Nested")
// and a recognized element for the nested part
// if so, I need to add the nested fields to the pipeline for filtering
const nestedFieldRegex = /^([^.]+)\.(year|quarter|month|dayofweek|day)$/i;

const checkNestedField = (fieldName) => {
  const match = nestedFieldRegex.exec(fieldName);
  if (!match) return undefined;
  return {
    base: match[1],
    nested: match[2],
    filterFieldName: `___${match[1]}_${match[2]}`,
  };
};

const createAddNestedFieldsPipeline = (fieldNames, contextOptions) => {
  const { timezoneOffset } = contextOptions;
  // constructing a pipeline that potentially has two parts, because the
  // quarter calculation has two steps
  // both parts will be wrapped in { $addFields: PART } after this
  // reduce call completes
  const pr = fieldNames.reduce(
    (r, v) => {
      const nf = checkNestedField(v);

      if (nf) {
        // ignore all unknown cases - perhaps people have actual db fields
        // with . in them
        const nestedFunction = nf.nested.toLowerCase();
        if (
          ['year', 'quarter', 'month', 'day', 'dayofweek'].includes(
            nestedFunction
          )
        ) {
          // timezone adjusted field
          const tafield = {
            $subtract: ['$' + nf.base, timezoneOffset * 60 * 1000],
          };

          switch (nestedFunction) {
            case 'year':
              r.pipeline[1][nf.filterFieldName] = {
                $year: tafield,
              };
              r.nestedFields.push(nf.filterFieldName);
              break;
            case 'quarter': {
              const tempField = `___${nf.base}_mp2`;
              r.pipeline[0][tempField] = {
                $add: [
                  {
                    $month: tafield,
                  },
                  2,
                ],
              };
              r.nestedFields.push(tempField);
              r.pipeline[1][nf.filterFieldName] = divInt('$' + tempField, 3);
              r.nestedFields.push(nf.filterFieldName);
              break;
            }
            case 'month':
              r.pipeline[1][nf.filterFieldName] = {
                $month: tafield,
              };
              r.nestedFields.push(nf.filterFieldName);
              break;
            case 'day':
              r.pipeline[1][nf.filterFieldName] = {
                $dayOfMonth: tafield,
              };
              r.nestedFields.push(nf.filterFieldName);
              break;
            case 'dayofweek':
              r.pipeline[1][nf.filterFieldName] = {
                $subtract: [
                  {
                    $dayOfWeek: tafield,
                  },
                  1,
                ],
              };
              r.nestedFields.push(nf.filterFieldName);
              break;
            default:
              console.error('Hit a completely impossible default case');
          }
        }
      }
      return r;
    },
    {
      pipeline: [{}, {}],
      nestedFields: [],
    }
  );
  [1, 0].forEach((i) => {
    if (Object.getOwnPropertyNames(pr.pipeline[i]).length === 0) {
      pr.pipeline.splice(i, 1); // nothing in this part, remove
    } else {
      pr.pipeline[i] = {
        $addFields: pr.pipeline[i],
      };
    }
  });

  return pr;
};

const createCompleteFilterPipeline = (
  searchExpr,
  searchOperation,
  searchValue,
  filter,
  contextOptions
) => {
  // this pipeline has the search options, the function also returns
  // a list of fields that are being accessed
  const searchPipeline = createSearchPipeline(
    searchExpr,
    searchOperation,
    searchValue,
    contextOptions
  );
  // and the same for the filter option
  const filterPipeline = createFilterPipeline(filter, contextOptions);

  // this pipeline adds fields in case there are nested elements:
  // dateField.Month
  const addNestedFieldsPipelineDetails = createAddNestedFieldsPipeline(
    searchPipeline.fieldList.concat(filterPipeline.fieldList),
    contextOptions
  );

  return {
    pipeline: addNestedFieldsPipelineDetails.pipeline.concat(
      searchPipeline.pipeline,
      filterPipeline.pipeline
    ),
    nestedFields: addNestedFieldsPipelineDetails.nestedFields,
  };
};

const createRemoveNestedFieldsPipeline = (nestedFields) => {
  if (nestedFields.length === 0) return [];

  let pd = {};
  for (const f of nestedFields) pd[f] = 0;
  return [
    {
      $project: pd,
    },
  ];
};

module.exports = {
  createGroupFieldName,
  createGroupKeyPipeline,
  createGroupingPipeline,
  createSkipTakePipeline,
  createCountPipeline,
  createMatchPipeline,
  createSortPipeline,
  createSummaryPipeline,
  createSelectProjectExpression,
  createSelectPipeline,
  createCompleteFilterPipeline,
  createRemoveNestedFieldsPipeline,
  testing: {
    divInt,
    subtractMod,
    createGroupStagePipeline,
    construct,
    constructRegex,
    parseFilter,
    createFilterPipeline,
    createSearchPipeline,
    checkNestedField,
    createAddNestedFieldsPipeline,
    isAndChainWithIncompleteAnds,
    fixAndChainWithIncompleteAnds,
    isCorrectFilterOperatorStructure,
  },
};
