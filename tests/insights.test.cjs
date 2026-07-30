const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const modulePaths = [
  "docs/assets/js/config.js",
  "docs/assets/js/domain/decisions.js",
  "docs/assets/js/domain/import-comparison.js",
  "docs/assets/js/domain/filters.js",
  "docs/assets/js/domain/insights.js",
  "docs/assets/js/domain/import-history.js",
];
const sandbox = {};
vm.createContext(sandbox);
for (const relativePath of modulePaths) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
  assert.doesNotMatch(
    source,
    /\b(?:document|localStorage|sessionStorage)\b/,
    `${relativePath} must remain a pure domain module`,
  );
  vm.runInContext(source, sandbox, { filename: relativePath });
}

const { insights } = sandbox.WatchLaterApp.domain;
const { importHistory } = sandbox.WatchLaterApp.domain;
const plain = value => JSON.parse(JSON.stringify(value));
const anchor = "2026-07-01T12:00:00.000Z";

assert.deepEqual(plain(insights.AGE_BUCKET_KEYS), [
  "0-7d",
  "8-30d",
  "1-3m",
  "3-6m",
  "6-12m",
  "1y+",
  "unknown",
]);
assert.equal(insights.getAgeBucket(0), "0-7d");
assert.equal(insights.getAgeBucket(7.999), "0-7d");
assert.equal(insights.getAgeBucket(8), "8-30d");
assert.equal(insights.getAgeBucket(30.999), "8-30d");
assert.equal(insights.getAgeBucket(31), "1-3m");
assert.equal(insights.getAgeBucket(90.999), "1-3m");
assert.equal(insights.getAgeBucket(91), "3-6m");
assert.equal(insights.getAgeBucket(182.999), "3-6m");
assert.equal(insights.getAgeBucket(183), "6-12m");
assert.equal(insights.getAgeBucket(365.999), "6-12m");
assert.equal(insights.getAgeBucket(366), "1y+");
assert.equal(insights.getAgeBucket(null), "unknown");
assert.equal(insights.getAgeBucket(-1), "unknown");

assert.equal(
  insights.getChannelKey("https://www.youtube.com/@Example/videos?view=0", "Old name"),
  "url:@example",
);
assert.equal(
  insights.getChannelKey("https://youtube.com/channel/UC-AbC/featured", "Channel"),
  "url:channel/uc-abc",
);
assert.equal(insights.getChannelKey("", " Čudežni   Kanal "), "name:cudezni kanal");
assert.equal(insights.getChannelKey("", ""), "name:(unknown)");

const videos = [
  {
    videoId: "zero",
    channel: "Alpha",
    channelUrl: "https://www.youtube.com/@Alpha",
    durationSeconds: 60,
    uploaded: "today",
    viewCountApprox: 10,
  },
  {
    videoId: "eight",
    channel: "Alpha",
    channelUrl: "https://youtube.com/@alpha/videos",
    durationSeconds: 120,
    uploaded: "8 days ago",
    views: "2K views",
  },
  {
    videoId: "month",
    channel: "Alpha renamed",
    channelUrl: "/@ALPHA?feature=shared",
    durationSeconds: null,
    uploaded: "31 days ago",
  },
  {
    videoId: "quarter",
    channel: "Alpha",
    channelUrl: "youtube.com/@alpha",
    durationSeconds: 240,
    uploaded: "91 days ago",
    isUnavailable: true,
  },
  {
    videoId: "half-year",
    channel: "Alpha renamed",
    channelUrl: "https://m.youtube.com/@alpha/featured",
    durationSeconds: 300,
    uploaded: "183 days ago",
  },
  {
    videoId: "year",
    channel: "Čudežni Kanal",
    durationSeconds: 360,
    uploaded: "366 days ago",
  },
  {
    videoId: "fallback",
    channel: "cudezni   kanal",
    durationSeconds: -1,
    uploaded: "not available",
  },
  {
    videoId: "unknown-channel",
    channel: "",
    durationSeconds: 480,
    uploaded: "",
  },
  { title: "Missing video ID" },
];
const decisions = {
  zero: { status: "keep", updatedAt: "2026-06-01T00:00:00.000Z" },
  eight: { status: "maybe" },
  month: { status: "delete" },
  quarter: { status: "archive" },
  "half-year": { status: "keep" },
};
const facts = insights.deriveVideoFacts(
  videos,
  decisions,
  {
    sourceExportedAt: anchor,
    importedAt: "2026-07-02T12:00:00.000Z",
    importComparison: { newIds: ["eight", "fallback"] },
  },
  anchor,
);

assert.equal(facts.length, 8);
assert.deepEqual(plain(facts.map(fact => fact.ageBucket)), [
  "0-7d",
  "8-30d",
  "1-3m",
  "3-6m",
  "6-12m",
  "1y+",
  "unknown",
  "unknown",
]);
assert.equal(facts[0].approxPublishedAt, anchor);
assert.equal(facts[2].approxPublishedAt, "2026-05-31T12:00:00.000Z");
assert.equal(facts[1].viewCountApprox, 2000);
assert.equal(facts[6].durationSeconds, null);
assert.equal(facts[3].isUnavailable, true);
assert.equal(facts[1].isNewSinceLastImport, true);
assert.equal(facts[0].decisionUpdatedAt, "2026-06-01T00:00:00.000Z");

const agedFact = insights.deriveVideoFacts(
  [{ videoId: "anchored", uploaded: "30 days ago" }],
  {},
  { sourceExportedAt: anchor },
  "2026-07-11T12:00:00.000Z",
)[0];
assert.equal(agedFact.ageDays, 40);
assert.equal(agedFact.approxPublishedAt, "2026-06-01T12:00:00.000Z");
const legacyFact = insights.deriveVideoFacts(
  [{ videoId: "legacy-anchor", uploaded: "1 day ago" }],
  {},
  { importedAt: "2026-06-20T12:00:00.000Z" },
  "2026-06-22T12:00:00.000Z",
)[0];
assert.equal(legacyFact.ageDays, 3);
assert.equal(legacyFact.approxPublishedAt, "2026-06-19T12:00:00.000Z");

const model = insights.buildChannelInsights(facts);
assert.equal(model.videoCount, 8);
assert.equal(model.channelCount, 3);
assert.equal(model.knownDurationCount, 6);
assert.equal(model.totalDurationSeconds, 1560);
assert.equal(model.knownAgeCount, 6);
assert.equal(model.averageAgeDays, 679 / 6);
assert.equal(model.oldestVideo.videoId, "year");
assert.deepEqual(plain(model.statusCounts), {
  keep: 2,
  maybe: 1,
  delete: 1,
  unreviewed: 3,
  archive: 1,
});
assert.equal(model.ageBuckets["0-7d"].count, 1);
assert.equal(model.ageBuckets["8-30d"].durationSeconds, 120);
assert.equal(model.ageBuckets["1-3m"].knownDurationCount, 0);
assert.equal(model.ageBuckets["3-6m"].count, 1);
assert.equal(model.ageBuckets["6-12m"].count, 1);
assert.equal(model.ageBuckets["1y+"].count, 1);
assert.equal(model.ageBuckets.unknown.count, 2);
assert.equal(model.coverage.durationPercent, 75);
assert.equal(model.coverage.agePercent, 75);
assert.equal(model.coverage.channelIdentityPercent, 62.5);

const alpha = model.channels.find(channel => channel.channelKey === "url:@alpha");
assert.equal(alpha.channelName, "Alpha");
assert.equal(alpha.totalCount, 5);
assert.equal(alpha.knownDurationCount, 4);
assert.equal(alpha.totalDurationSeconds, 720);
assert.equal(alpha.knownAgeCount, 5);
assert.equal(alpha.averageAgeDays, 313 / 5);
assert.equal(alpha.oldestAgeDays, 183);
assert.equal(alpha.oldestUntouchedCount, 0);
assert.equal(alpha.newSinceLastImportCount, 1);
assert.deepEqual(plain(alpha.statusCounts), {
  keep: 2,
  maybe: 1,
  delete: 1,
  unreviewed: 0,
  archive: 1,
});
assert.equal(alpha.ageBuckets["6-12m"].durationSeconds, 300);
assert.equal(alpha.persistence, null);

const fallback = model.channels.find(
  channel => channel.channelKey === "name:cudezni kanal",
);
assert.equal(fallback.totalCount, 2);
assert.equal(fallback.oldestUntouchedCount, 2);
assert.equal(fallback.newSinceLastImportCount, 1);

assert.deepEqual(plain(insights.INSIGHTS_MEASURES), ["count", "watch-time"]);
assert.deepEqual(plain(insights.INSIGHTS_SORTS), [
  "backlog",
  "undecided",
  "watch-time",
  "channel",
]);
assert.equal(insights.normalizeInsightsMeasure("watch-time"), "watch-time");
assert.equal(insights.normalizeInsightsMeasure("invalid"), "count");
assert.equal(insights.normalizeInsightsSort("undecided"), "undecided");
assert.equal(insights.normalizeInsightsSort("invalid"), "backlog");
assert.equal(insights.normalizeDecisionStaleDays(undefined), 180);
assert.equal(insights.normalizeDecisionStaleDays("off"), "off");
assert.equal(insights.normalizeDecisionStaleDays(90.4), 90);
assert.deepEqual(plain(insights.normalizeInsightsSettings({})), {
  decisionStaleDays: 180,
});

const countMatrix = insights.buildChannelAgeMatrix(model);
assert.equal(countMatrix.measure, "count");
assert.equal(countMatrix.sort, "backlog");
assert.equal(countMatrix.channelCount, 3);
assert.equal(countMatrix.visibleChannelCount, 3);
assert.equal(countMatrix.isLimited, false);
assert.equal(countMatrix.rows[0].channelKey, "url:@alpha");
assert.equal(countMatrix.rows[0].totalCount, 5);
assert.equal(countMatrix.rows[0].undecidedCount, 0);
assert.equal(countMatrix.rows[0].cells.length, 7);
assert.equal(countMatrix.rows[0].cells[0].key, "0-7d");
assert.equal(countMatrix.rows[0].cells[0].count, 1);
assert.equal(countMatrix.rows[0].cells[6].key, "unknown");
assert.equal(countMatrix.rows[0].cells[6].count, 0);
assert.equal(countMatrix.globalMaximum, 1);

const watchTimeMatrix = insights.buildChannelAgeMatrix(model, {
  measure: "watch-time",
  sort: "watch-time",
});
assert.equal(watchTimeMatrix.rows[0].channelKey, "url:@alpha");
assert.equal(watchTimeMatrix.rows[0].totalDurationSeconds, 720);
assert.equal(watchTimeMatrix.rows[0].knownDurationCount, 4);
assert.equal(watchTimeMatrix.rows[0].durationCoveragePercent, 80);
assert.equal(watchTimeMatrix.rows[0].cells[2].count, 1);
assert.equal(watchTimeMatrix.rows[0].cells[2].knownDurationCount, 0);
assert.equal(watchTimeMatrix.rows[0].cells[2].durationCoveragePercent, 0);
assert.equal(watchTimeMatrix.globalMaximum, 480);

const undecidedMatrix = insights.buildChannelAgeMatrix(model, {
  sort: "undecided",
});
assert.equal(undecidedMatrix.rows[0].channelKey, "name:cudezni kanal");
assert.equal(undecidedMatrix.rows[0].undecidedCount, 2);

const detailNow = "2026-07-01T00:00:00.000Z";
const detailFacts = insights.deriveVideoFacts([
  {
    videoId: "old-untouched",
    title: "Old untouched",
    channel: "Detail Channel",
    durationSeconds: 100,
    uploaded: "400 days ago",
    url: "https://youtu.be/old-untouched",
  },
  {
    videoId: "unknown-untouched",
    title: "Unknown untouched",
    channel: "Detail Channel",
    durationSeconds: null,
    uploaded: "",
  },
  {
    videoId: "boundary",
    title: "Boundary decision",
    channel: "Detail Channel",
    durationSeconds: 200,
    uploaded: "30 days ago",
  },
  {
    videoId: "recent",
    title: "Recent decision",
    channel: "Detail Channel",
    durationSeconds: 300,
    uploaded: "10 days ago",
  },
  {
    videoId: "undated",
    title: "Undated decision",
    channel: "Detail Channel",
    durationSeconds: 400,
    uploaded: "90 days ago",
  },
  {
    videoId: "older-decision",
    title: "Older decision",
    channel: "Detail Channel",
    durationSeconds: 500,
    uploaded: "180 days ago",
  },
], {
  boundary: { status: "maybe", updatedAt: "2026-06-01T00:00:00.000Z" },
  recent: { status: "keep", updatedAt: "2026-06-02T00:00:00.000Z" },
  undated: { status: "archive" },
  "older-decision": { status: "delete", updatedAt: "2026-01-01T00:00:00.000Z" },
}, {
  sourceExportedAt: detailNow,
  importComparison: { newIds: ["old-untouched"] },
}, detailNow);
const detailModel = insights.buildChannelInsights(detailFacts);
const channelDetail = insights.buildChannelDetail(
  detailModel,
  detailFacts,
  "name:detail channel",
  {
    decisionStaleDays: 30,
    now: detailNow,
    hasImportBaseline: true,
  },
);
assert.equal(channelDetail.totalCount, 6);
assert.equal(channelDetail.backlogImpact.videoPercent, 100);
assert.equal(channelDetail.decisionHealth.statusMixDenominator, 6);
assert.equal(channelDetail.decisionHealth.decidedCount, 4);
assert.equal(channelDetail.decisionHealth.maybePercentOfDecided, 25);
assert.equal(channelDetail.decisionHealth.staleEligibleCount, 3);
assert.equal(
  channelDetail.decisionHealth.staleCount,
  2,
  "a decision exactly on the stale boundary must be included",
);
assert.equal(channelDetail.decisionHealth.undatedDecisionCount, 1);
assert.ok(
  Math.abs(
    channelDetail.decisionHealth.statusMix.find(
      item => item.status === "unreviewed",
    ).percent - 100 / 3,
  ) < 1e-10,
  "status mix percentages must use every channel video as the denominator",
);
assert.equal(channelDetail.oldestUntouchedCount, 2);
assert.equal(channelDetail.oldestUntouchedUnknownAgeCount, 1);
assert.equal(channelDetail.oldestUntouched[0].videoId, "old-untouched");
assert.equal(channelDetail.oldestUntouched[0].url, "https://youtu.be/old-untouched");
assert.equal(channelDetail.newSinceLastImportAvailable, true);
assert.equal(channelDetail.newSinceLastImportCount, 1);
assert.equal(channelDetail.newSinceLastImport[0].videoId, "old-untouched");
assert.equal(channelDetail.persistence.totalSnapshots, 0);
assert.equal(channelDetail.persistence.available, false);

const detailHistory = [
  importHistory.createImportSnapshot([
    {
      videoId: "old-untouched",
      channel: "Detail Channel before rename",
      durationSeconds: 100,
    },
    {
      videoId: "removed-detail",
      channel: "Detail Channel before rename",
      durationSeconds: null,
    },
  ], {
    fileName: "detail-old.json",
    importedAt: "2026-06-01T12:00:00.000Z",
  }),
  importHistory.createImportSnapshot([
    {
      videoId: "old-untouched",
      channel: "Detail Channel",
      durationSeconds: 100,
    },
    {
      videoId: "recent",
      channel: "Detail Channel",
      durationSeconds: 300,
    },
  ], {
    fileName: "detail-current.json",
    importedAt: "2026-07-01T12:00:00.000Z",
  }),
];
const detailWithPersistence = insights.buildChannelDetail(
  detailModel,
  detailFacts,
  "name:detail channel",
  {
    importHistory: detailHistory,
    now: detailNow,
  },
);
assert.equal(detailWithPersistence.persistence.available, true);
assert.equal(detailWithPersistence.persistence.totalSnapshots, 2);
assert.equal(
  detailWithPersistence.persistence.presentSnapshots,
  1,
  "a name-only channel rename must remain transparent instead of being guessed",
);
assert.equal(detailWithPersistence.persistence.points[0].videoCount, 0);
assert.equal(detailWithPersistence.persistence.points[1].videoCount, 2);
assert.equal(detailWithPersistence.persistence.points[1].newCount, 2);
const detailWithStaleOff = insights.buildChannelDetail(
  detailModel,
  detailFacts,
  "name:detail channel",
  { decisionStaleDays: "off", now: detailNow },
);
assert.equal(detailWithStaleOff.decisionHealth.staleDays, "off");
assert.equal(detailWithStaleOff.decisionHealth.staleCount, null);
assert.equal(detailWithStaleOff.decisionHealth.stalePercent, null);
assert.equal(
  insights.buildChannelDetail(detailModel, detailFacts, "name:missing"),
  null,
);

const manyVideos = [];
for (let channelIndex = 0; channelIndex < 105; channelIndex++) {
  const videoCount = channelIndex === 104 ? 1 : 2;
  for (let videoIndex = 0; videoIndex < videoCount; videoIndex++) {
    manyVideos.push({
      videoId: `many-${channelIndex}-${videoIndex}`,
      channel: channelIndex === 104
        ? "Needle Beyond Limit"
        : `Ranked Channel ${String(channelIndex).padStart(3, "0")}`,
      durationSeconds: 60 + channelIndex,
      uploaded: `${channelIndex + 1} days ago`,
    });
  }
}
const manyModel = insights.buildChannelInsights(insights.deriveVideoFacts(
  manyVideos,
  {},
  { sourceExportedAt: anchor },
  anchor,
));
const limitedMatrix = insights.buildChannelAgeMatrix(manyModel, {
  sort: "channel",
});
assert.equal(limitedMatrix.channelCount, 105);
assert.equal(limitedMatrix.visibleChannelCount, 100);
assert.equal(limitedMatrix.hiddenChannelCount, 5);
assert.equal(limitedMatrix.isLimited, true);
assert.equal(
  limitedMatrix.rows.some(row => row.channelName === "Needle Beyond Limit"),
  false,
  "the default limit must first choose the top channels by backlog size",
);
const allChannelsMatrix = insights.buildChannelAgeMatrix(manyModel, {
  showAll: true,
  sort: "channel",
});
assert.equal(allChannelsMatrix.visibleChannelCount, 105);
assert.equal(allChannelsMatrix.isLimited, false);
const searchedMatrix = insights.buildChannelAgeMatrix(manyModel, {
  search: "needle beyond",
});
assert.equal(searchedMatrix.visibleChannelCount, 1);
assert.equal(searchedMatrix.rows[0].channelName, "Needle Beyond Limit");
assert.equal(searchedMatrix.isLimited, false);

const reviewedModel = insights.buildChannelInsights(facts, {
  statuses: ["keep", "maybe", "delete", "archive"],
});
assert.equal(reviewedModel.videoCount, 5);
assert.equal(reviewedModel.channelCount, 1);
assert.equal(reviewedModel.statusCounts.unreviewed, 0);

assert.deepEqual(
  plain(insights.buildChannelInsights([], {})),
  plain(insights.createEmptyInsightsModel()),
);
assert.deepEqual(plain(insights.createEmptyInsightsCache()), {
  datasetRevision: -1,
  decisionRevision: -1,
  videoFacts: [],
  model: plain(insights.createEmptyInsightsModel()),
  factRecomputeCount: 0,
  decisionRefreshCount: 0,
  modelRecomputeCount: 0,
});

const memoizedCache = insights.createEmptyInsightsCache();
const memoizedInput = {
  videos: [
    {
      videoId: "memoized",
      channel: "Cache Channel",
      durationSeconds: 90,
      uploaded: "10 days ago",
    },
  ],
  decisions: {},
  importContext: { sourceExportedAt: anchor },
  datasetRevision: 1,
  decisionRevision: 0,
  now: anchor,
};
const initialMemoizedModel = insights.getMemoizedInsightsModel(
  memoizedCache,
  memoizedInput,
);
const initialMemoizedFacts = memoizedCache.videoFacts;
assert.equal(initialMemoizedModel.videoCount, 1);
assert.equal(initialMemoizedModel.statusCounts.unreviewed, 1);
assert.equal(memoizedCache.factRecomputeCount, 1);
assert.equal(memoizedCache.modelRecomputeCount, 1);
assert.equal(
  insights.getMemoizedInsightsModel(memoizedCache, memoizedInput),
  initialMemoizedModel,
  "unchanged revisions must return the memoized model",
);

const decidedMemoizedModel = insights.getMemoizedInsightsModel(memoizedCache, {
  ...memoizedInput,
  decisions: { memoized: { status: "keep" } },
  decisionRevision: 1,
});
assert.notEqual(decidedMemoizedModel, initialMemoizedModel);
assert.notEqual(memoizedCache.videoFacts, initialMemoizedFacts);
assert.equal(memoizedCache.videoFacts[0].durationSeconds, 90);
assert.equal(memoizedCache.videoFacts[0].ageDays, 10);
assert.equal(decidedMemoizedModel.statusCounts.keep, 1);
assert.equal(decidedMemoizedModel.statusCounts.unreviewed, 0);
assert.equal(memoizedCache.factRecomputeCount, 1);
assert.equal(memoizedCache.decisionRefreshCount, 1);
assert.equal(memoizedCache.modelRecomputeCount, 2);

const datasetMemoizedModel = insights.getMemoizedInsightsModel(memoizedCache, {
  ...memoizedInput,
  videos: [...memoizedInput.videos, {
    videoId: "second",
    channel: "Other channel",
    uploaded: "",
  }],
  decisions: { memoized: { status: "keep" } },
  datasetRevision: 2,
  decisionRevision: 1,
});
assert.equal(datasetMemoizedModel.videoCount, 2);
assert.equal(memoizedCache.datasetRevision, 2);

const performanceVideos = Array.from({ length: 5000 }, (_, index) => ({
  videoId: `performance-${index}`,
  channel: `Performance Channel ${index % 250}`,
  channelUrl: `https://youtube.com/@performance-${index % 250}`,
  durationSeconds: index % 9 === 0 ? null : 60 + index % 3600,
  uploaded: index % 11 === 0 ? "" : `${index % 800} days ago`,
}));
const performanceStart = Date.now();
const performanceModel = insights.buildChannelInsights(
  insights.deriveVideoFacts(
    performanceVideos,
    {},
    { sourceExportedAt: anchor },
    anchor,
  ),
);
const performanceMatrix = insights.buildChannelAgeMatrix(performanceModel);
const performanceElapsed = Date.now() - performanceStart;
assert.equal(performanceModel.videoCount, 5000);
assert.equal(performanceMatrix.visibleChannelCount, 100);
assert.ok(
  performanceElapsed < 2000,
  `5,000-video insight derivation took ${performanceElapsed}ms`,
);

console.log("channel insights domain test passed");
