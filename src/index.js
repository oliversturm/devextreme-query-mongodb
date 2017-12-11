function createContext(contextOptions, loadOptions) {
  // Mongo doesn't seem to have the ability of simply returning its ids as strings
  // to begin with. Bit of a pita, but hey...
  // We'll replace ids with strings if required.
  const replaceId = item => {
    if (!contextOptions.replaceIds) return item;
    if (item._id) item._id = item._id.toHexString();
    return item;
  };

  // We can apply a limit for summaries calculated per group query. The realistic problem
  // is that if a programmer makes the grid use server-side grouping as well as summaries,
  // but *not* groupPaging, there may be enormous numbers of summary queries to run, and because
  // this happens across levels, it can't easily be checked elsewhere and the server will just
  // keep working on that query as long as it takes.
  const createSummaryQueryExecutor = () => {
    let queriesExecuted = 0;

    return function(fn) {
      if (
        !contextOptions.summaryQueryLimit ||
        ++queriesExecuted <= contextOptions.summaryQueryLimit
      )
        return fn();
      else return Promise.resolve();
    };
  };

  const createGroupFieldName = groupIndex => '___group_key_' + groupIndex;

  const createGroupKeyPipeline = (selector, groupInterval, groupIndex) => {
    const wrapGroupKey = keyExpr => {
      let field = {};
      field[createGroupFieldName(groupIndex)] = keyExpr;

      return {
        $addFields: field
      };
    };

    const prefix = s => '$' + s;

    // much more complicated than it should be because braindead mongo
    // doesn't support integer division by itself
    // so I'm doing (dividend - (dividend MOD divisor)) / divisor
    const divInt = (dividend, divisor) => ({
      $divide: [subtractMod(dividend, divisor), divisor]
    });

    const subtractMod = (a, b) => ({
      $subtract: [
        a,
        {
          $mod: [a, b]
        }
      ]
    });

    const pipe = (...args) => {
      let result = Array.from(args);
      result.groupIndex = groupIndex;
      return result;
    };

    if (groupInterval) {
      const numericInterval = parseInt(Number(groupInterval));
      if (numericInterval) {
        return pipe(
          wrapGroupKey(subtractMod(prefix(selector), numericInterval))
        );
      } else {
        // timezone adjusted field
        const tafield = {
          $subtract: [
            prefix(selector),
            contextOptions.timezoneOffset * 60 * 1000
          ]
        };

        switch (groupInterval) {
          case 'year':
            return pipe(
              wrapGroupKey({
                $year: tafield
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
                        $month: tafield
                      },
                      2
                    ]
                  }
                }
              },
              wrapGroupKey(divInt('$___mp2', 3))
            );
          case 'month':
            return pipe(
              wrapGroupKey({
                $month: tafield
              })
            );
          case 'day':
            return pipe(
              wrapGroupKey({
                $dayOfMonth: tafield
              })
            );
          case 'dayOfWeek':
            return pipe(
              wrapGroupKey({
                $subtract: [
                  {
                    $dayOfWeek: tafield // correct in that it's sunday to saturday, but it's 1-7 (must be 0-6)
                  },
                  1
                ]
              })
            );
          case 'hour':
            return pipe(
              wrapGroupKey({
                $hour: tafield
              })
            );
          case 'minute':
            return pipe(
              wrapGroupKey({
                $minute: tafield
              })
            );
          case 'second':
            return pipe(
              wrapGroupKey({
                $second: tafield
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
    countingSeparately,
    includeDataItems,
    itemProjection,
    groupKeyPipeline
  ) => {
    let result = {
      $group: {
        // must use _id at this point for the group key
        _id: '$' + createGroupFieldName(groupKeyPipeline.groupIndex)
      }
    };
    if (!countingSeparately) {
      // this method of counting results in the number of data items in the group
      // if the group has sub-groups, it can't be used
      result.$group.count = {
        $sum: 1
      };
    }
    if (includeDataItems) {
      // include items directly if we're expected to do so, and if this is the
      // most deeply nested group in case there are several
      result.$group.items = {
        $push: itemProjection
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
        key: '$_id'
      }
    };
    let sortStage = {
      $sort: {
        key: desc ? -1 : 1
      }
    };

    let pipeline = createGroupStagePipeline(
      countingSeparately,
      includeDataItems,
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
          items: null // only null works, not [] or leaving out items altogether
        }
      });
    }

    return pipeline;
  };

  const createSkipTakePipeline = () => {
    let pipeline = [];

    if (loadOptions.skip)
      pipeline.push({
        $skip: loadOptions.skip
      });
    if (loadOptions.take)
      pipeline.push({
        $limit: loadOptions.take
      });

    return pipeline;
  };

  const createCountPipeline = () => {
    return [
      {
        $count: 'count'
      }
    ];
  };

  const createMatchPipeline = (selector, value) => [
    { $match: { [selector]: value } }
  ];

  const createFilterPipeline = filter => {
    const dummy = {
      pipeline: [],
      fieldList: []
    };

    if (filter) {
      let fieldList = [];
      const match = parseFilter(filter, fieldList);
      if (match)
        return {
          pipeline: [
            {
              $match: match
            }
          ],
          fieldList: fieldList
        };
      else return dummy;
    } else return dummy;
  };

  const createSortPipeline = () =>
    loadOptions.sort
      ? [
          {
            $sort: loadOptions.sort.reduce(
              (r, v) => ({ ...r, [v.selector]: v.desc ? -1 : 1 }),
              {}
            )
          }
        ]
      : [];

  const createSummaryPipeline = summary => {
    if (summary) {
      let gc = { _id: null };
      for (const s of summary) {
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
            console.error(`Invalid summary type ${s.summaryType}, ignoring`);
        }
      }
      return [
        {
          $group: gc
        }
      ];
    } else return [];
  };

  const createSearchPipeline = (expr, op, val) => {
    const dummy = {
      pipeline: [],
      fieldList: []
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

    return createFilterPipeline(criteria);
  };

  const createSelectProjectExpression = (fields, explicitId = false) => {
    if (fields && fields.length > 0) {
      let project = {};
      if (explicitId) project._id = '$_id';
      for (const field of fields) project[field] = '$' + field;
      return project;
    } else return undefined;
  };

  const createSelectPipeline = fields => {
    if (fields && fields.length > 0) {
      return [
        {
          $project: createSelectProjectExpression(fields)
        }
      ];
    } else return [];
  };

  const getCount = (collection, pipeline) =>
    collection
      .aggregate(pipeline)
      .toArray()
      // Strangely, the pipeline returns an empty array when the "match" part
      // filters out all rows - I would expect to still see the "count" stage
      // working, but it doesn't. Ask mongo.
      .then(r => (r.length > 0 ? r[0].count : 0));

  const construct = (fieldName, operator, compValue) => ({
    [fieldName]: { [operator]: compValue }
  });

  const constructRegex = (fieldName, regex) => ({
    [fieldName]: { $regex: regex, $options: '' }
  });

  const parseFilter = (element, fieldList) => {
    // Element can be a string denoting a field name - I don't know if that's a case
    // supported by the widgets in any way, but it seems conceivable that somebody constructs
    // an expression like [ "!", "boolValueField" ]
    // In the string case, I return a truth-checking filter.
    //
    // Otherwise, element can be an array with two items
    // For two items:
    // 0: unary operator
    // 1: operand
    //
    // Otherwise, element can be an element with an odd number of items
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
    // 3: "or" or "and" - must be the same as (1)
    // 4: operand 3
    // .... etc
    //

    if (typeof element === 'string') {
      fieldList.push(element);
      const nf = checkNestedField(element);
      const fieldName = nf ? nf.filterFieldName : element;
      return construct(fieldName, '$eq', true);
    } else if (element.length) {
      if (element.length === 1 && element[0].length) {
        // assuming a nested array in this case:
        // the pivot grid sometimes does this
        // [ [ "field", "=", 5 ] ]
        return parseFilter(element[0], fieldList);
      } else if (element.length === 2) {
        // unary operator - only one supported
        if (element[0] === '!') {
          const nor = parseFilter(element[1], fieldList);
          if (nor)
            return {
              $nor: [nor]
            };
          else return null;
        } else return null;
      } else if (element.length % 2 === 1) {
        // odd number of elements - let's see what the operator is
        const operator = element[1].toLowerCase();

        if (['and', 'or'].includes(operator)) {
          if (
            element.reduce(
              (r, v) => {
                // check whether the chain contains only "and" or only "or" operators
                if (r.previous) return { ok: r.ok, previous: false };
                else
                  return {
                    ok: r.ok && v.toLowerCase() === operator,
                    previous: true
                  };
              },
              { ok: true, previous: true }
            ).ok
          ) {
            // all operators are the same - build a list of conditions from the nested
            // items, combine with the operator
            let result = {};
            result['$' + operator] = element.reduce(
              (r, v) => {
                if (r.previous) return { list: r.list, previous: false };
                else {
                  const nestedFilter = parseFilter(v, fieldList);
                  if (nestedFilter) r.list.push(nestedFilter);
                  return { list: r.list, previous: true };
                }
              },
              { list: [], previous: false }
            ).list;

            return result;
          } else return null;
        } else {
          if (element.length === 3) {
            fieldList.push(element[0]);
            const nf = checkNestedField(element[0]);
            const fieldName = nf ? nf.filterFieldName : element[0];

            switch (operator) {
              case '=':
                return construct(fieldName, '$eq', element[2]);
              case '<>':
                return construct(fieldName, '$ne', element[2]);
              case '>':
                return construct(fieldName, '$gt', element[2]);
              case '>=':
                return construct(fieldName, '$gte', element[2]);
              case '<':
                return construct(fieldName, '$lt', element[2]);
              case '<=':
                return construct(fieldName, '$lte', element[2]);
              case 'startswith':
                return constructRegex(fieldName, '^' + element[2]);
              case 'endswith':
                return constructRegex(fieldName, element[2] + '$');
              case 'contains':
                return constructRegex(fieldName, element[2]);
              case 'notcontains':
                return constructRegex(
                  fieldName,
                  '^((?!' + element[2] + ').)*$'
                );
              default:
                return null;
            }
          } else return null;
        }
      } else return null;
    } else return null;
  };

  const populateSummaryResults = (target, summary, summaryResults) => {
    if (summary) {
      target.summary = [];

      for (const s of summary) {
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
            console.error(`Invalid summaryType ${s.summaryType}, ignoring`);
        }
      }
    }
    return target;
  };

  const queryGroupData = (
    collection,
    desc,
    includeDataItems,
    countSeparately,
    itemProjection,
    groupKeyPipeline,
    sortPipeline,
    filterPipelineDetails,
    skipTakePipeline,
    matchPipeline
  ) =>
    collection
      .aggregate([
        // sort pipeline first, apparently that enables it to use indexes
        ...sortPipeline,
        ...filterPipelineDetails.pipeline,
        ...matchPipeline,
        ...createRemoveNestedFieldsPipeline(filterPipelineDetails.nestedFields),
        ...createGroupingPipeline(
          desc,
          includeDataItems,
          countSeparately,
          groupKeyPipeline,
          itemProjection
        ),
        ...skipTakePipeline
      ])
      .toArray()
      .then(
        r =>
          includeDataItems
            ? r.map(i => ({ ...i, items: i.items.map(replaceId) }))
            : r
      );

  const queryGroup = (
    collection,
    groupIndex,
    runSummaryQuery,
    filterPipelineDetails,
    skipTakePipeline = [],
    summaryPipeline = [],
    matchPipeline = []
  ) => {
    const group = loadOptions.group[groupIndex];
    const lastGroup = groupIndex === loadOptions.group.length - 1;
    const itemDataRequired = lastGroup && group.isExpanded;
    const separateCountRequired = !lastGroup;

    // The current implementation of the dxDataGrid, at least, assumes that sub-group details are
    // always included in the result, whether or not the group is marked isExpanded.
    const subGroupsRequired = !lastGroup; // && group.isExpanded;
    const summariesRequired =
      loadOptions.groupSummary && loadOptions.groupSummary.length > 0;

    const groupKeyPipeline = createGroupKeyPipeline(
      group.selector,
      group.groupInterval,
      groupIndex
    );

    const augmentWithSubGroups = groupData =>
      subGroupsRequired
        ? groupData.map(item =>
            queryGroup(
              collection,
              groupIndex + 1,
              runSummaryQuery,
              filterPipelineDetails, // used unchanged in lower levels
              [], // skip/take doesn't apply on lower levels - correct?
              summaryPipeline, // unmodified
              // matchPipeline modified to filter down into group level
              [
                ...matchPipeline,
                // not completely clean to include this in the match pipeline, but the field
                // added in the groupKeyPipeline is required specifically for the following match
                ...groupKeyPipeline,
                ...createMatchPipeline(
                  createGroupFieldName(groupIndex),
                  item.key
                )
              ]
            ).then(r => {
              item.items = r;
              item.count = r.length;
            })
          )
        : [];

    const augmentWithSeparateCount = groupData => {
      if (separateCountRequired) {
        // We need to count separately because this is not the lowest level group,
        // but since we didn't query details about our nested group, we can't just go
        // for the length of the result array. An extra query is required in this case.
        // Even though the count is a type of summary for the group, it is special - different
        // from other group level summaries. The difference is that for each group, a summary
        // is usually calculated with its data, even if that data isn't actually visible in the
        // UI at the time. The count on the other hand is meant to represent the number of
        // elements in the group, and in case these elements are sub-groups instead of data
        // items, count represents a value that must not be calculated using the data items.

        const nextGroup = loadOptions.group[groupIndex + 1];
        const nextGroupKeyPipeline = createGroupKeyPipeline(
          nextGroup.selector,
          nextGroup.groupInterval,
          groupIndex + 1
        );
        return groupData.map(item =>
          getCount(collection, [
            ...filterPipelineDetails.pipeline,
            ...groupKeyPipeline,

            ...matchPipeline,
            ...createMatchPipeline(createGroupFieldName(groupIndex), item.key),
            ...createGroupingPipeline(
              nextGroup.desc,
              false,
              true,
              nextGroupKeyPipeline
            ),
            ...createCountPipeline()
          ]).then(r => {
            item.count = r;
          })
        );
      } else return [];
    };

    const augmentWithSummaries = groupData =>
      summariesRequired
        ? groupData.map(item =>
            runSummaryQuery(() =>
              collection
                .aggregate([
                  ...filterPipelineDetails.pipeline,
                  ...groupKeyPipeline,
                  ...matchPipeline,
                  ...createMatchPipeline(
                    createGroupFieldName(groupIndex),
                    item.key
                  ),
                  ...summaryPipeline
                ])
                .toArray()
            ).then(r =>
              populateSummaryResults(item, loadOptions.groupSummary, r[0])
            )
          )
        : [];

    return queryGroupData(
      collection,
      group.desc,
      itemDataRequired,
      separateCountRequired,
      createSelectProjectExpression(loadOptions.select, true),
      groupKeyPipeline,
      itemDataRequired ? createSortPipeline() : [],
      filterPipelineDetails,
      skipTakePipeline,
      matchPipeline
    ).then(groupData =>
      Promise.all([
        ...augmentWithSubGroups(groupData),
        ...augmentWithSeparateCount(groupData),
        ...augmentWithSummaries(groupData)
      ]).then(() => groupData)
    );
  };

  // check whether any of the fields have a path structure ("field.Nested")
  // and a recognized element for the nested part
  // if so, I need to add the nested fields to the pipeline for filtering
  const nestedFieldRegex = /^([^.]+)\.(year|quarter|month|dayofweek|day)$/i;

  const checkNestedField = fieldName => {
    const match = nestedFieldRegex.exec(fieldName);
    if (!match) return undefined;
    return {
      base: match[1],
      nested: match[2],
      filterFieldName: `___${match[1]}_${match[2]}`
    };
  };

  const createAddNestedFieldsPipeline = fieldNames => {
    // copy&paste warning: these functions also exist in createGroupKeyPipeline,
    // should be refactored
    const divInt = (dividend, divisor) => ({
      $divide: [subtractMod(dividend, divisor), divisor]
    });

    const subtractMod = (a, b) => ({
      $subtract: [
        a,
        {
          $mod: [a, b]
        }
      ]
    });

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
              $subtract: [
                '$' + nf.base,
                contextOptions.timezoneOffset * 60 * 1000
              ]
            };

            switch (nestedFunction) {
              case 'year':
                r.pipeline[1][nf.filterFieldName] = {
                  $year: tafield
                };
                r.nestedFields.push(nf.filterFieldName);
                break;
              case 'quarter': {
                const tempField = `___${nf.base}_mp2`;
                r.pipeline[0][tempField] = {
                  $add: [
                    {
                      $month: tafield
                    },
                    2
                  ]
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
                  $subtract: [
                    {
                      $dayOfWeek: tafield
                    },
                    1
                  ]
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
        nestedFields: []
      }
    );
    [1, 0].forEach(i => {
      if (Object.getOwnPropertyNames(pr.pipeline[i]).length === 0) {
        pr.pipeline.splice(i, 1); // nothing in this part, remove
      } else {
        pr.pipeline[i] = {
          $addFields: pr.pipeline[i]
        };
      }
    });

    return pr;
  };

  const createCompleteFilterPipeline = () => {
    // this pipeline has the search options, the function also returns
    // a list of fields that are being accessed
    const searchPipeline = createSearchPipeline(
      loadOptions.searchExpr,
      loadOptions.searchOperation,
      loadOptions.searchValue
    );
    // and the same for the filter option
    const filterPipeline = createFilterPipeline(loadOptions.filter);

    // this pipeline adds fields in case there are nested elements:
    // dateField.Month
    const addNestedFieldsPipelineDetails = createAddNestedFieldsPipeline(
      searchPipeline.fieldList.concat(filterPipeline.fieldList)
    );

    return {
      pipeline: addNestedFieldsPipelineDetails.pipeline.concat(
        searchPipeline.pipeline,
        filterPipeline.pipeline
      ),
      nestedFields: addNestedFieldsPipelineDetails.nestedFields
    };
  };

  const createRemoveNestedFieldsPipeline = nestedFields => {
    if (nestedFields.length === 0) return [];

    let pd = {};
    for (const f of nestedFields) pd[f] = 0;
    return [
      {
        $project: pd
      }
    ];
  };

  const queryGroups = collection => {
    const completeFilterPipelineDetails = createCompleteFilterPipeline();
    const summaryPipeline = createSummaryPipeline(loadOptions.groupSummary);
    const skipTakePipeline = createSkipTakePipeline();

    const mainQueryResult = () =>
      queryGroup(
        collection,
        0,
        createSummaryQueryExecutor(),
        completeFilterPipelineDetails,
        skipTakePipeline,
        summaryPipeline
      ).then(r => ({ data: r }));

    const groupCount = () => {
      if (loadOptions.requireGroupCount) {
        const group = loadOptions.group[0];

        return [
          getCount(collection, [
            ...completeFilterPipelineDetails.pipeline,
            ...createGroupingPipeline(
              group.desc,
              false,
              true,
              createGroupKeyPipeline(group.selector, group.groupInterval, 0)
            ),
            ...createCountPipeline()
          ]).then(r => ({ groupCount: r }))
        ];
      } else return [];
    };

    const totalCount = () =>
      loadOptions.requireTotalCount || loadOptions.totalSummary
        ? [
            getCount(collection, [
              ...completeFilterPipelineDetails.pipeline,
              ...createCountPipeline()
            ]).then(r => ({ totalCount: r }))
          ]
        : [];

    const summary = resultObject =>
      resultObject.totalCount > 0 && loadOptions.totalSummary
        ? collection
            .aggregate([
              ...completeFilterPipelineDetails.pipeline,
              ...createSummaryPipeline(loadOptions.totalSummary)
            ])
            .toArray()
            .then(r =>
              populateSummaryResults(
                resultObject,
                loadOptions.totalSummary,
                r[0]
              )
            )
        : Promise.resolve(resultObject);

    return Promise.all([mainQueryResult(), ...groupCount(), ...totalCount()])
      .then(merge)
      .then(summary);
  };

  const merge = os => os.reduce((r, v) => ({ ...r, ...v }), {});

  const querySimple = collection => {
    const completeFilterPipelineDetails = createCompleteFilterPipeline();
    const sortPipeline = createSortPipeline();
    const skipTakePipeline = createSkipTakePipeline();
    const selectPipeline = createSelectPipeline(loadOptions.select);
    const removeNestedFieldsPipeline = createRemoveNestedFieldsPipeline(
      completeFilterPipelineDetails.nestedFields
    );

    const mainQueryResult = () =>
      collection
        .aggregate([
          ...completeFilterPipelineDetails.pipeline,
          ...sortPipeline,
          ...skipTakePipeline,
          ...selectPipeline,
          ...removeNestedFieldsPipeline
        ])
        .toArray()
        .then(r => r.map(replaceId))
        .then(r => ({ data: r }));

    // FIXME this function is exactly the same as the one in the group query execution path
    const totalCount = () =>
      loadOptions.requireTotalCount || loadOptions.totalSummary
        ? [
            getCount(collection, [
              ...completeFilterPipelineDetails.pipeline,
              ...createCountPipeline()
            ]).then(r => ({ totalCount: r }))
          ]
        : [];

    // FIXME and again, exactly the same as the group one
    const summary = resultObject =>
      resultObject.totalCount > 0 && loadOptions.totalSummary
        ? collection
            .aggregate([
              ...completeFilterPipelineDetails.pipeline,
              ...createSummaryPipeline(loadOptions.totalSummary)
            ])
            .toArray()
            .then(r =>
              populateSummaryResults(
                resultObject,
                loadOptions.totalSummary,
                r[0]
              )
            )
        : Promise.resolve(resultObject);

    return Promise.all([mainQueryResult(), ...totalCount()])
      .then(merge)
      .then(summary);
  };

  return { queryGroups, querySimple };
}

function query(collection, loadOptions = {}, options = {}) {
  const standardContextOptions = {
    replaceIds: true,
    summaryQueryLimit: 100,
    // timezone offset for the query, in the form returned by
    // Date.getTimezoneOffset
    timezoneOffset: 0
  };
  const contextOptions = Object.assign(standardContextOptions, options);
  const context = createContext(contextOptions, loadOptions);

  return loadOptions.group && loadOptions.group.length > 0
    ? context.queryGroups(collection, loadOptions)
    : context.querySimple(collection, loadOptions);
}

module.exports = query;
