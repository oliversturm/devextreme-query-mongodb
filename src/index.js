const {
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
  createRemoveNestedFieldsPipeline
} = require('./pipelines');
const {
  replaceId,
  createSummaryQueryExecutor,
  merge,
  debug
} = require('./utils');

function createContext(contextOptions, loadOptions) {
  const getCount = (collection, pipeline) =>
    collection
      .aggregate(pipeline)
      .toArray()
      // Strangely, the pipeline returns an empty array when the "match" part
      // filters out all rows - I would expect to still see the "count" stage
      // working, but it doesn't. Ask mongo.
      .then(r => (r.length > 0 ? r[0].count : 0));

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
      groupIndex,
      contextOptions.timezoneOffset
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
              return r;
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
          groupIndex + 1,
          contextOptions.timezoneOffset
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
            return r;
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
      itemDataRequired ? createSortPipeline(loadOptions.sort) : [],
      filterPipelineDetails,
      skipTakePipeline,
      matchPipeline
    ).then(
      groupData =>
        /* eslint-disable promise/no-nesting */
        Promise.all([
          ...augmentWithSubGroups(groupData),
          ...augmentWithSeparateCount(groupData),
          ...augmentWithSummaries(groupData)
        ]).then(() => groupData)
      /* eslint-enable promise/no-nesting */
    );
  };

  const queryGroups = collection => {
    const completeFilterPipelineDetails = createCompleteFilterPipeline(
      loadOptions.searchExpr,
      loadOptions.searchOperation,
      loadOptions.searchValue,
      loadOptions.filter,
      contextOptions.timezoneOffset
    );
    const summaryPipeline = createSummaryPipeline(loadOptions.groupSummary);
    const skipTakePipeline = createSkipTakePipeline(
      loadOptions.skip,
      loadOptions.take
    );

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
              createGroupKeyPipeline(
                group.selector,
                group.groupInterval,
                0,
                contextOptions.timezoneOffset
              )
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

  const querySimple = collection => {
    const completeFilterPipelineDetails = createCompleteFilterPipeline(
      loadOptions.searchExpr,
      loadOptions.searchOperation,
      loadOptions.searchValue,
      loadOptions.filter,
      contextOptions.timezoneOffset
    );
    const sortPipeline = createSortPipeline(loadOptions.sort);
    const skipTakePipeline = createSkipTakePipeline(
      loadOptions.skip,
      loadOptions.take
    );
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
