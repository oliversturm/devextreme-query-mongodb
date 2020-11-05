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
  createRemoveNestedFieldsPipeline,
} = require('./pipelines');
const {
  replaceId,
  createSummaryQueryExecutor,
  merge,
  debug,
} = require('./utils');

function createContext(contextOptions, loadOptions) {
  const aggregateCall = (collection, pipeline, identifier) =>
    ((aggregateOptions) => collection.aggregate(pipeline, aggregateOptions))(
      contextOptions.dynamicAggregateOptions
        ? filterAggregateOptions(
            contextOptions.dynamicAggregateOptions(
              identifier,
              pipeline,
              collection
            )
          )
        : contextOptions.aggregateOptions
    );

  const getCount = (collection, pipeline) =>
    aggregateCall(collection, pipeline, 'getCount')
      .toArray()
      // Strangely, the pipeline returns an empty array when the "match" part
      // filters out all rows - I would expect to still see the "count" stage
      // working, but it doesn't. Ask mongo.
      .then((r) => (r.length > 0 ? r[0].count : 0));

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
    aggregateCall(
      collection,
      [
        ...contextOptions.preProcessingPipeline,
        // sort pipeline first, apparently that enables it to use indexes
        ...sortPipeline,
        ...filterPipelineDetails.pipeline,
        ...matchPipeline,
        ...createRemoveNestedFieldsPipeline(
          filterPipelineDetails.nestedFields,
          contextOptions
        ),
        ...createGroupingPipeline(
          desc,
          includeDataItems,
          countSeparately,
          groupKeyPipeline,
          itemProjection,
          contextOptions
        ),
        ...skipTakePipeline,
      ],
      'queryGroupData'
    )
      .toArray()
      .then((r) =>
        includeDataItems
          ? r.map((i) => ({ ...i, items: i.items.map(replaceId) }))
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
      contextOptions
    );

    const augmentWithSubGroups = (groupData) =>
      subGroupsRequired
        ? groupData.map((item) =>
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
                  item.key,
                  contextOptions
                ),
              ]
            ).then((r) => {
              item.items = r;
              item.count = r.length;
              return r;
            })
          )
        : [];

    const augmentWithSeparateCount = (groupData) => {
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
          contextOptions
        );
        return groupData.map((item) =>
          getCount(collection, [
            ...contextOptions.preProcessingPipeline,
            ...filterPipelineDetails.pipeline,
            ...groupKeyPipeline,

            ...matchPipeline,
            ...createMatchPipeline(
              createGroupFieldName(groupIndex),
              item.key,
              contextOptions
            ),
            ...createGroupingPipeline(
              nextGroup.desc,
              false,
              true,
              nextGroupKeyPipeline,
              contextOptions
            ),
            ...createCountPipeline(contextOptions),
          ]).then((r) => {
            item.count = r;
            return r;
          })
        );
      } else return [];
    };

    const augmentWithSummaries = (groupData) =>
      summariesRequired
        ? groupData.map((item) =>
            runSummaryQuery(() =>
              aggregateCall(
                collection,
                [
                  ...contextOptions.preProcessingPipeline,
                  ...filterPipelineDetails.pipeline,
                  ...groupKeyPipeline,
                  ...matchPipeline,
                  ...createMatchPipeline(
                    createGroupFieldName(groupIndex),
                    item.key,
                    contextOptions
                  ),
                  ...summaryPipeline,
                ],
                'augmentWithSummaries'
              ).toArray()
            ).then((r) =>
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
      itemDataRequired
        ? createSortPipeline(loadOptions.sort, contextOptions)
        : [],
      filterPipelineDetails,
      skipTakePipeline,
      matchPipeline
    ).then(
      (groupData) =>
        /* eslint-disable promise/no-nesting */
        Promise.all([
          ...augmentWithSubGroups(groupData),
          ...augmentWithSeparateCount(groupData),
          ...augmentWithSummaries(groupData),
        ]).then(() => groupData)
      /* eslint-enable promise/no-nesting */
    );
  };

  const totalCount = (collection, completeFilterPipelineDetails) =>
    loadOptions.requireTotalCount || loadOptions.totalSummary
      ? contextOptions.preferMetadataCount &&
        contextOptions.preProcessingPipeline.length === 0 &&
        completeFilterPipelineDetails.pipeline.length <= 1
        ? [
            collection
              .count(
                completeFilterPipelineDetails.pipeline.length === 1
                  ? completeFilterPipelineDetails.pipeline[0]['$match']
                  : undefined
              )
              .then((r) => ({ totalCount: r })),
          ]
        : [
            getCount(collection, [
              ...contextOptions.preProcessingPipeline,
              ...completeFilterPipelineDetails.pipeline,
              ...createCountPipeline(contextOptions),
            ]).then((r) => ({ totalCount: r })),
          ]
      : [];

  const summary = (collection, completeFilterPipelineDetails) => (
    resultObject
  ) =>
    resultObject.totalCount > 0 && loadOptions.totalSummary
      ? aggregateCall(
          collection,
          [
            ...contextOptions.preProcessingPipeline,
            ...completeFilterPipelineDetails.pipeline,
            ...createSummaryPipeline(loadOptions.totalSummary, contextOptions),
          ],
          'summary'
        )
          .toArray()
          .then((r) =>
            populateSummaryResults(resultObject, loadOptions.totalSummary, r[0])
          )
      : Promise.resolve(resultObject);

  const queryGroups = (collection) => {
    const completeFilterPipelineDetails = createCompleteFilterPipeline(
      loadOptions.searchExpr,
      loadOptions.searchOperation,
      loadOptions.searchValue,
      loadOptions.filter,
      contextOptions
    );
    const summaryPipeline = createSummaryPipeline(
      loadOptions.groupSummary,
      contextOptions
    );
    const skipTakePipeline = createSkipTakePipeline(
      loadOptions.skip,
      loadOptions.take,
      contextOptions
    );

    const mainQueryResult = () =>
      queryGroup(
        collection,
        0,
        createSummaryQueryExecutor(undefined),
        completeFilterPipelineDetails,
        skipTakePipeline,
        summaryPipeline
      ).then((r) => ({ data: r }));

    const groupCount = () => {
      if (loadOptions.requireGroupCount) {
        const group = loadOptions.group[0];

        return [
          getCount(collection, [
            ...contextOptions.preProcessingPipeline,
            ...completeFilterPipelineDetails.pipeline,
            ...createGroupingPipeline(
              group.desc,
              false,
              true,
              createGroupKeyPipeline(
                group.selector,
                group.groupInterval,
                0,
                contextOptions
              ),
              contextOptions
            ),
            ...createCountPipeline(contextOptions),
          ]).then((r) => ({ groupCount: r })),
        ];
      } else return [];
    };

    return Promise.all([
      mainQueryResult(),
      ...groupCount(),
      ...totalCount(collection, completeFilterPipelineDetails),
    ])
      .then(merge)
      .then(summary(collection, completeFilterPipelineDetails));
  };

  const querySimple = (collection) => {
    const completeFilterPipelineDetails = createCompleteFilterPipeline(
      loadOptions.searchExpr,
      loadOptions.searchOperation,
      loadOptions.searchValue,
      loadOptions.filter,
      contextOptions
    );
    const sortPipeline = createSortPipeline(loadOptions.sort, contextOptions);
    const skipTakePipeline = createSkipTakePipeline(
      loadOptions.skip,
      loadOptions.take,
      contextOptions
    );
    const selectPipeline = createSelectPipeline(
      loadOptions.select,
      contextOptions
    );
    const removeNestedFieldsPipeline = createRemoveNestedFieldsPipeline(
      completeFilterPipelineDetails.nestedFields,
      contextOptions
    );

    const mainQueryResult = () =>
      aggregateCall(
        collection,
        [
          ...contextOptions.preProcessingPipeline,
          ...completeFilterPipelineDetails.pipeline,
          ...sortPipeline,
          ...skipTakePipeline,
          ...selectPipeline,
          ...removeNestedFieldsPipeline,
        ],
        'mainQueryResult'
      )
        .toArray()
        .then((r) => r.map(replaceId))
        .then((r) => ({ data: r }));

    return Promise.all([
      mainQueryResult(),
      ...totalCount(collection, completeFilterPipelineDetails),
    ])
      .then(merge)
      .then(summary(collection, completeFilterPipelineDetails));
  };

  return { queryGroups, querySimple };
}

function filterAggregateOptions(proposedOptions) {
  const acceptableAggregateOptionNames = [
    'allowDiskUse',
    'maxTimeMS',
    'readConcern',
    'collation',
    'hint',
    'comment',
  ];
  return Object.keys(proposedOptions).reduce(
    (r, v) =>
      acceptableAggregateOptionNames.includes(v)
        ? { ...r, [v]: proposedOptions[v] }
        : r,
    {}
  );
}

function query(collection, loadOptions = {}, options = {}) {
  const proposedAggregateOptions = options.aggregateOptions;
  delete options.aggregateOptions;

  const standardContextOptions = {
    replaceIds: true,
    summaryQueryLimit: 100,
    // timezone offset for the query, in the form returned by
    // Date.getTimezoneOffset
    timezoneOffset: 0,
    preProcessingPipeline: [],
    caseInsensitiveRegex: true,
  };
  const contextOptions = Object.assign(standardContextOptions, options);

  if (!options.dynamicAggregateOptions && proposedAggregateOptions)
    contextOptions.aggregateOptions = filterAggregateOptions(
      proposedAggregateOptions
    );

  const context = createContext(contextOptions, loadOptions);

  return loadOptions.group && loadOptions.group.length > 0
    ? context.queryGroups(collection)
    : context.querySimple(collection);
}

module.exports = query;
