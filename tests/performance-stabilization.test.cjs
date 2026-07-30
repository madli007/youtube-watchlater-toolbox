"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const {
  createPerformanceVideos,
} = require("./fixtures/create-performance-videos.cjs");

const projectRoot = path.resolve(__dirname, "..");
const modulePaths = [
  "docs/assets/js/config.js",
  "docs/assets/js/domain/decisions.js",
  "docs/assets/js/domain/import-comparison.js",
  "docs/assets/js/domain/filters.js",
  "docs/assets/js/domain/insights.js",
  "docs/assets/js/domain/grouping.js",
];
const sandbox = {};
vm.createContext(sandbox);
for (const relativePath of modulePaths) {
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, relativePath), "utf8"),
    sandbox,
    { filename: relativePath },
  );
}

const { filters, grouping, insights } = sandbox.WatchLaterApp.domain;
const videos = createPerformanceVideos();
const anchor = "2026-07-01T12:00:00.000Z";

const insightsCache = insights.createEmptyInsightsCache();
const insightsStart = performance.now();
const insightsModel = insights.getMemoizedInsightsModel(insightsCache, {
  videos,
  decisions: {},
  importContext: { sourceExportedAt: anchor },
  datasetRevision: 1,
  decisionRevision: 0,
  now: anchor,
});
const matrix = insights.buildChannelAgeMatrix(insightsModel);
const insightsElapsed = performance.now() - insightsStart;
assert.equal(insightsModel.videoCount, 5000);
assert.equal(matrix.visibleChannelCount, 100);
assert.equal(insightsCache.factRecomputeCount, 1);
assert.equal(insightsCache.modelRecomputeCount, 1);

const cachedInsights = insights.getMemoizedInsightsModel(insightsCache, {
  videos: [],
  decisions: {},
  datasetRevision: 1,
  decisionRevision: 0,
});
assert.equal(cachedInsights, insightsModel);
assert.equal(insightsCache.factRecomputeCount, 1);
assert.equal(insightsCache.modelRecomputeCount, 1);

insights.getMemoizedInsightsModel(insightsCache, {
  videos,
  decisions: {
    "performance-0": {
      status: "keep",
      updatedAt: "2026-07-30T12:00:00.000Z",
    },
  },
  datasetRevision: 1,
  decisionRevision: 1,
});
assert.equal(
  insightsCache.factRecomputeCount,
  1,
  "a decision must refresh decision fields without reparsing dataset facts",
);
assert.equal(insightsCache.decisionRefreshCount, 1);
assert.equal(insightsCache.modelRecomputeCount, 2);

const filteredCache = filters.createEmptyFilteredVideosCache();
let filterComputes = 0;
const filterInput = {
  datasetRevision: 1,
  decisionRevision: 1,
  filterKey: JSON.stringify({ search: "", status: "all", sort: "index" }),
  scopeIds: new Set(),
};
const computeFiltered = () => {
  filterComputes++;
  return videos.filter(video => !video.isUnavailable);
};
const firstFiltered = filters.getMemoizedFilteredVideos(
  filteredCache,
  filterInput,
  computeFiltered,
);
for (let index = 0; index < 20; index++) {
  assert.equal(
    filters.getMemoizedFilteredVideos(filteredCache, filterInput, computeFiltered),
    firstFiltered,
  );
}
assert.equal(filterComputes, 1, "one render context must reuse the filtered array");
assert.equal(filteredCache.recomputeCount, 1);

filters.getMemoizedFilteredVideos(filteredCache, {
  ...filterInput,
  decisionRevision: 2,
}, computeFiltered);
assert.equal(filterComputes, 2);
assert.equal(filteredCache.recomputeCount, 2);

const groupingCache = grouping.createEmptyGroupingCache();
const groups = grouping.getMemoizedVideoGroups(groupingCache, {
  videos,
  datasetRevision: 1,
  overrideRevision: 0,
});
assert.ok(groups.length > 0);
assert.equal(groupingCache.recomputeCount, 1);
assert.equal(
  grouping.getMemoizedVideoGroups(groupingCache, {
    videos: [],
    datasetRevision: 1,
    overrideRevision: 0,
    decisionRevision: 999,
  }),
  groups,
);
assert.equal(
  groupingCache.recomputeCount,
  1,
  "decision-only changes must not recompute groups",
);

assert.ok(
  insightsElapsed < 1500,
  `5,000-video Insights smoke benchmark took ${insightsElapsed.toFixed(1)}ms`,
);

console.log(
  `performance stabilization test passed (5,000-video Insights ${insightsElapsed.toFixed(1)}ms)`,
);
