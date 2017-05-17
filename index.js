function createContext(contextOptions, loadOptions) {
  return {
    // Mongo doesn't seem to have the ability of simply returning its ids as strings
    // to begin with. Bit of a pita, but hey...
    // We'll replace ids with strings if required.
    replaceId: function(item) {
      if (!contextOptions.replaceIds) return item;
      if (item._id) item._id = item._id.toHexString();
      return item;
    },

    // We can apply a limit for summaries calculated per group query. The realistic problem
    // is that if a programmer makes the grid use server-side grouping as well as summaries,
    // but *not* groupPaging, there may be enormous numbers of summary queries to run, and because
    // this happens across levels, it can't easily be checked elsewhere and the server will just
    // keep working on that query as long as it takes.
    createSummaryQueryExecutor: function() {
      let queriesExecuted = 0;

      return async function(fn) {
        if (
          !contextOptions.summaryQueryLimit ||
          ++queriesExecuted <= contextOptions.summaryQueryLimit
        )
          await fn();
      };
    },

    createGroupFieldName: groupIndex => '___group_key_' + groupIndex,

    createGroupKeyPipeline: function(selector, groupInterval, groupIndex) {
      const wrapGroupKey = keyExpr => {
        let field = {};
        field[this.createGroupFieldName(groupIndex)] = keyExpr;

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
    },

    createGroupStagePipeline: function(
      countingSeparately,
      includeDataItems,
      itemProjection,
      groupKeyPipeline
    ) {
      let result = {
        $group: {
          // must use _id at this point for the group key
          _id: '$' + this.createGroupFieldName(groupKeyPipeline.groupIndex)
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
    },

    createGroupingPipeline: function(
      desc,
      includeDataItems,
      countingSeparately,
      groupKeyPipeline,
      itemProjection = '$$CURRENT'
    ) {
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

      let pipeline = this.createGroupStagePipeline(
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
    },

    createSkipTakePipeline: function() {
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
    },

    createCountPipeline: function() {
      return [
        {
          $count: 'count'
        }
      ];
    },

    createMatchPipeline: function(selector, value) {
      let match = {
        $match: {}
      };
      match.$match[selector] = value;
      return [match];
    },

    createFilterPipeline: function(filter) {
      const dummy = {
        pipeline: [],
        fieldList: []
      };

      if (filter) {
        let fieldList = [];
        const match = this.parseFilter(filter, fieldList);
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
    },

    createSortPipeline: function() {
      if (loadOptions.sort) {
        let sorting = {};
        for (const sf of loadOptions.sort)
          sorting[sf.selector] = sf.desc ? -1 : 1;
        return [
          {
            $sort: sorting
          }
        ];
      } else return [];
    },

    createSummaryPipeline: function(summary) {
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
          }
        }
        return [
          {
            $group: gc
          }
        ];
      } else return [];
    },

    createSearchPipeline: function(expr, op, val) {
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

      return this.createFilterPipeline(criteria);
    },

    createSelectProjectExpression: function(fields, explicitId = false) {
      if (fields && fields.length > 0) {
        let project = {};
        if (explicitId) project._id = '$_id';
        for (const field of fields)
          project[field] = '$' + field;
        return project;
      } else return undefined;
    },

    createSelectPipeline: function(fields) {
      if (fields && fields.length > 0) {
        return [
          {
            $project: this.createSelectProjectExpression(fields)
          }
        ];
      } else return [];
    },

    getCount: async function(collection, pipeline) {
      const coll = await collection.aggregate(pipeline).toArray();
      // Strangely, the pipeline returns an empty array when the "match" part
      // filters out all rows - I would expect to still see the "count" stage
      // working, but it doesn't. Ask mongo.
      return coll.length > 0 ? coll[0].count : 0;
    },

    parseFilter: function(element, fieldList) {
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

      function construct(fieldName, operator, compValue) {
        let result = {};
        result[fieldName] = {};
        result[fieldName][operator] = compValue;
        return result;
      }

      function constructRegex(fieldName, regex) {
        let result = {};
        result[fieldName] = {
          $regex: regex,
          $options: '' // "i" for case-insensitive?
        };
        return result;
      }

      if (typeof element === 'string') {
        fieldList.push(element);
        const nf = this.checkNestedField(element);
        const fieldName = nf ? nf.filterFieldName : element;
        return construct(fieldName, '$eq', true);
      } else if (element.length) {
        if (element.length === 1 && element[0].length) {
          // assuming a nested array in this case:
          // the pivot grid sometimes does this
          // [ [ "field", "=", 5 ] ]
          return this.parseFilter(element[0], fieldList);
        } else if (element.length === 2) {
          // unary operator - only one supported
          if (element[0] === '!') {
            const nor = this.parseFilter(element[1], fieldList);
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
                    const nestedFilter = this.parseFilter(v, fieldList);
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
              const nf = this.checkNestedField(element[0]);
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
    },

    populateSummaryResults: function(target, summary, summaryResults) {
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
          }
        }
      }
    },

    queryGroupData: async function(
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
    ) {
      const pipeline = sortPipeline.concat(
        // sort pipeline first, apparently that enables it to use indexes
        filterPipelineDetails.pipeline,
        matchPipeline,
        this.createRemoveNestedFieldsPipeline(
          filterPipelineDetails.nestedFields
        ),
        this.createGroupingPipeline(
          desc,
          includeDataItems,
          countSeparately,
          groupKeyPipeline,
          itemProjection
        ),
        skipTakePipeline
      );

      //console.log("QueryGroupData pipeline: ", JSON.stringify(pipeline, null, 2));

      const groupData = await collection.aggregate(pipeline).toArray();
      if (includeDataItems) {
        for (const groupItem of groupData) {
          groupItem.items = groupItem.items.map(this.replaceId);
        }
      }
      return groupData;
    },

    queryGroup: async function(
      collection,
      groupIndex,
      runSummaryQuery,
      filterPipelineDetails,
      skipTakePipeline = [],
      summaryPipeline = [],
      matchPipeline = []
    ) {
      const group = loadOptions.group[groupIndex];
      const lastGroup = groupIndex === loadOptions.group.length - 1;
      const itemDataRequired = lastGroup && group.isExpanded;
      const separateCountRequired = !lastGroup;

      // The current implementation of the dxDataGrid, at least, assumes that sub-group details are
      // always included in the result, whether or not the group is marked isExpanded.
      const subGroupsRequired = !lastGroup; // && group.isExpanded;
      const summariesRequired =
        loadOptions.groupSummary && loadOptions.groupSummary.length > 0;

      const groupKeyPipeline = this.createGroupKeyPipeline(
        group.selector,
        group.groupInterval,
        groupIndex
      );

      const groupData = await this.queryGroupData(
        collection,
        group.desc,
        itemDataRequired,
        separateCountRequired,
        this.createSelectProjectExpression(loadOptions.select, true),
        groupKeyPipeline,
        itemDataRequired ? this.createSortPipeline() : [],
        filterPipelineDetails,
        skipTakePipeline,
        matchPipeline
      );
      if (subGroupsRequired) {
        for (const groupDataItem of groupData) {
          groupDataItem.items = await this.queryGroup(
            collection,
            groupIndex + 1,
            runSummaryQuery,
            filterPipelineDetails, // used unchanged in lower levels
            [], // skip/take doesn't apply on lower levels - correct?
            summaryPipeline, // unmodified
            // matchPipeline modified to filter down into group level
            matchPipeline.concat(
              // not completely clean to include this in the match pipeline, but the field
              // added in the groupKeyPipeline is required specifically for the following match
              groupKeyPipeline,
              this.createMatchPipeline(
                this.createGroupFieldName(groupIndex),
                groupDataItem.key
              )
            )
          );
          groupDataItem.count = groupDataItem.items.length;
        }
      } else if (separateCountRequired) {
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
        const nextGroupKeyPipeline = this.createGroupKeyPipeline(
          nextGroup.selector,
          nextGroup.groupInterval,
          groupIndex + 1
        );
        for (const groupDataItem of groupData) {
          const pipeline = filterPipelineDetails.pipeline.concat(
            groupKeyPipeline,
            matchPipeline.concat(
              this.createMatchPipeline(
                this.createGroupFieldName(groupIndex),
                groupDataItem.key
              )
            ),
            this.createGroupingPipeline(
              nextGroup.desc,
              false,
              true,
              nextGroupKeyPipeline
            ),
            this.createCountPipeline()
          );
          groupDataItem.count = await this.getCount(collection, pipeline);
        }
      }

      if (summariesRequired) {
        for (const groupDataItem of groupData) {
          await runSummaryQuery(async () => {
            const summaryQueryPipeline = filterPipelineDetails.pipeline.concat(
              groupKeyPipeline,
              matchPipeline.concat(
                this.createMatchPipeline(
                  this.createGroupFieldName(groupIndex),
                  groupDataItem.key
                )
              ),
              summaryPipeline
            );

            //console.log("Using summary query pipeline: ", JSON.stringify(summaryQueryPipeline, null, 2));

            this.populateSummaryResults(
              groupDataItem,
              loadOptions.groupSummary,
              (await collection.aggregate(summaryQueryPipeline).toArray())[0]
            );
          });
        }
      }

      return groupData;
    },

    // check whether any of the fields have a path structure ("field.Nested")
    // and a recognized element for the nested part
    // if so, I need to add the nested fields to the pipeline for filtering
    nestedFieldRegex: /^([^.]+)\.(year|quarter|month|dayofweek|day)$/i,

    checkNestedField: function(fieldName) {
      const match = this.nestedFieldRegex.exec(fieldName);
      if (!match) return undefined;
      return {
        base: match[1],
        nested: match[2],
        filterFieldName: `___${match[1]}_${match[2]}`
      };
    },

    createAddNestedFieldsPipeline: function(fieldNames) {
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
          const nf = this.checkNestedField(v);

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

              switch (nf.nested.toLowerCase()) {
                case 'year':
                  r.pipeline[1][nf.filterFieldName] = {
                    $year: tafield
                  };
                  r.nestedFields.push(nf.filterFieldName);
                  break;
                case 'quarter':
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
                  r.pipeline[1][nf.filterFieldName] = divInt(
                    '$' + tempField,
                    3
                  );
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
                    $subtract: [
                      {
                        $dayOfWeek: tafield
                      },
                      1
                    ]
                  };
                  r.nestedFields.push(nf.filterFieldName);
                  break;
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
    },

    createCompleteFilterPipeline: function() {
      // this pipeline has the search options, the function also returns
      // a list of fields that are being accessed
      const searchPipeline = this.createSearchPipeline(
        loadOptions.searchExpr,
        loadOptions.searchOperation,
        loadOptions.searchValue
      );
      // and the same for the filter option
      const filterPipeline = this.createFilterPipeline(loadOptions.filter);

      // this pipeline adds fields in case there are nested elements:
      // dateField.Month
      const addNestedFieldsPipelineDetails = this.createAddNestedFieldsPipeline(
        searchPipeline.fieldList.concat(filterPipeline.fieldList)
      );

      return {
        pipeline: addNestedFieldsPipelineDetails.pipeline.concat(
          searchPipeline.pipeline,
          filterPipeline.pipeline
        ),
        nestedFields: addNestedFieldsPipelineDetails.nestedFields
      };
    },

    createRemoveNestedFieldsPipeline: function(nestedFields) {
      if (nestedFields.length === 0) return [];

      let pd = {};
      for (const f of nestedFields)
        pd[f] = 0;
      return [
        {
          $project: pd
        }
      ];
    },

    queryGroups: async function(collection) {
      const completeFilterPipelineDetails = this.createCompleteFilterPipeline();
      const summaryPipeline = this.createSummaryPipeline(
        loadOptions.groupSummary
      );
      const skipTakePipeline = this.createSkipTakePipeline();

      let resultObject = {
        data: await this.queryGroup(
          collection,
          0,
          this.createSummaryQueryExecutor(),
          completeFilterPipelineDetails,
          skipTakePipeline,
          summaryPipeline
        )
      };

      if (loadOptions.requireGroupCount) {
        const group = loadOptions.group[0];
        const groupCountPipeline = completeFilterPipelineDetails.pipeline.concat(
          this.createGroupingPipeline(
            group.desc,
            false,
            true,
            this.createGroupKeyPipeline(group.selector, group.groupInterval, 0)
          ),
          this.createCountPipeline()
        );
        resultObject.groupCount = await this.getCount(
          collection,
          groupCountPipeline
        );
      }

      if (loadOptions.requireTotalCount || loadOptions.totalSummary) {
        const totalCountPipeline = completeFilterPipelineDetails.pipeline.concat(
          this.createCountPipeline()
        );
        resultObject.totalCount = await this.getCount(
          collection,
          totalCountPipeline
        );
      }

      // see comment in querySimple
      if (resultObject.totalCount > 0 && loadOptions.totalSummary) {
        const summaryPipeline = completeFilterPipelineDetails.pipeline.concat(
          this.createSummaryPipeline(loadOptions.totalSummary)
        );
        this.populateSummaryResults(
          resultObject,
          loadOptions.totalSummary,
          (await collection.aggregate(summaryPipeline).toArray())[0]
        );
      }

      return resultObject;
    },

    querySimple: async function(collection) {
      const completeFilterPipelineDetails = this.createCompleteFilterPipeline();
      const sortPipeline = this.createSortPipeline();
      const skipTakePipeline = this.createSkipTakePipeline();
      const selectPipeline = this.createSelectPipeline(loadOptions.select);
      const removeNestedFieldsPipeline = this.createRemoveNestedFieldsPipeline(
        completeFilterPipelineDetails.nestedFields
      );

      const dataPipeline = completeFilterPipelineDetails.pipeline.concat(
        sortPipeline,
        skipTakePipeline,
        selectPipeline,
        removeNestedFieldsPipeline
      );

      // console.log(
      //   'Simple query pipeline: ',
      //   JSON.stringify(dataPipeline, null, 2)
      // );

      let resultObject = {
        data: (await collection.aggregate(dataPipeline).toArray()).map(
          this.replaceId
        )
      };

      if (loadOptions.requireTotalCount || loadOptions.totalSummary) {
        const countPipeline = completeFilterPipelineDetails.pipeline.concat(
          this.createCountPipeline()
        );
        resultObject.totalCount = await this.getCount(
          collection,
          countPipeline
        );
      }

      // I need to check the totalCount for this, because theoretically it is possible
      // to have an empty dataset if loadOptions.take is zero, but still values to calculate
      // summaries against.
      if (resultObject.totalCount > 0 && loadOptions.totalSummary) {
        const summaryPipeline = completeFilterPipelineDetails.pipeline.concat(
          this.createSummaryPipeline(loadOptions.totalSummary)
        );
        this.populateSummaryResults(
          resultObject,
          loadOptions.totalSummary,
          (await collection.aggregate(summaryPipeline).toArray())[0]
        );
      }

      return resultObject;
    }
  };
}

async function query(collection, loadOptions = {}, options = {}) {
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
