const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const modulePaths = [
  "docs/assets/js/config.js",
  "docs/assets/js/domain/decisions.js",
  "docs/assets/js/domain/watchlater-import.js",
  "docs/assets/js/domain/import-comparison.js",
  "docs/assets/js/domain/filters.js",
  "docs/assets/js/domain/insights.js",
  "docs/assets/js/domain/time-budget.js",
  "docs/assets/js/domain/grouping.js",
  "docs/assets/js/domain/workspace.js",
];
const sandbox = {};
vm.createContext(sandbox);
for (const relativePath of modulePaths) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
  assert.doesNotMatch(
    source,
    /\b(?:document|localStorage)\b/,
    `${relativePath} must remain independent of DOM and browser persistence`,
  );
  vm.runInContext(source, sandbox, { filename: relativePath });
}

const { config, domain } = sandbox.WatchLaterApp;
const {
  decisions,
  watchLaterImport,
  importComparison,
  filters,
  insights,
  timeBudget,
  grouping,
  workspace,
} = domain;
const plain = value => JSON.parse(JSON.stringify(value));

assert.equal(config.STORAGE_KEY, "watchlater-triage-decisions-v1");
assert.equal(config.PAGE_SIZE, 220);
assert.equal(config.GROUPING_STOP_WORDS.has("official"), true);
assert.equal(Object.isFrozen(config), true);
assert.equal(Object.isFrozen(config.RULES), true);

const decisionMap = {};
const decision = decisions.updateDecisionDetails(
  decisionMap,
  "video-1",
  ["manual", "manual"],
  "Watch later",
  "2026-07-28T12:00:00.000Z",
);
assert.deepEqual(plain(decision), {
  status: "unreviewed",
  tags: ["manual"],
  note: "Watch later",
  updatedAt: "2026-07-28T12:00:00.000Z",
});
assert.equal(decisions.normalizeDecision({ status: "invalid" }).status, "unreviewed");
assert.deepEqual(plain(decisions.normalizeTags("not-an-array")), []);
assert.equal(decisions.ruleMatchesVideo(
  { title: "A useful documentary", channel: "Channel A" },
  { positive: ["documentary"], negative: ["trailer"], channel: "Channel A" },
), true);

const importTime = "2026-07-29T09:00:00.000Z";
const sourceExportTime = "2026-07-28T12:34:56.000Z";
const versionedFixture = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "tests/fixtures/watchlater-versioned-smoke.json"),
  "utf8",
));
const versionedImport = watchLaterImport.normalizeWatchLaterPayload(versionedFixture, importTime);
assert.equal(versionedImport.ageAnchorAt, versionedFixture.exportedAt);
assert.equal(versionedImport.ageAnchorSource, "export");
assert.equal(versionedImport.schemaVersion, 1);
assert.equal(versionedImport.videos[0].videoId, "versioned-smoke-1");
const legacyImport = watchLaterImport.normalizeWatchLaterPayload(
  [{ videoId: "legacy" }],
  importTime,
);
assert.equal(legacyImport.ageAnchorAt, importTime);
assert.equal(legacyImport.ageAnchorSource, "import");
assert.equal(legacyImport.schemaVersion, null);
assert.equal(watchLaterImport.isValidUtcTimestamp("2026-02-29T12:00:00.000Z"), false);
assert.throws(
  () => watchLaterImport.normalizeWatchLaterPayload({
    schemaVersion: 1,
    exportedAt: "not-a-date",
    videos: [],
  }, importTime),
  /invalid exportedAt/i,
);
assert.throws(
  () => watchLaterImport.normalizeWatchLaterPayload({
    schemaVersion: 2,
    exportedAt: sourceExportTime,
    videos: [],
  }, importTime),
  /schema version: 2/i,
);
assert.throws(
  () => watchLaterImport.normalizeWatchLaterPayload({
    schemaVersion: 1,
    exportedAt: sourceExportTime,
    videos: {},
  }, importTime),
  /videos array/i,
);

const comparison = importComparison.compareVideoDatasets(
  [{ videoId: "same", title: "Old" }, { videoId: "removed", title: "Removed" }],
  [{ videoId: "same", title: "New" }, { videoId: "added", title: "Added" }],
  { same: { status: "keep" }, orphaned: { status: "delete" } },
);
assert.deepEqual(plain(comparison.newIds), ["added"]);
assert.deepEqual(plain(comparison.changedFieldsById.same), ["title"]);
assert.deepEqual(plain(comparison.orphanedDecisionIds), ["orphaned"]);
assert.equal(importComparison.normalizeImportComparison(null).baselineAvailable, false);

assert.equal(filters.parseApproximateAgeDays("3 weeks ago"), 21);
assert.equal(filters.parseApproximateViewCount("1,4 tis. ogledov"), 1400);
assert.equal(filters.videoMatchesFilters(
  {
    videoId: "video-1",
    channel: "Channel A",
    durationSeconds: 900,
    uploaded: "2 days ago",
    views: "2K views",
    suggestedTags: ["dev"],
  },
  { status: "keep", tags: ["manual"], note: "Useful" },
  { status: "keep", channels: ["Channel A"], tags: ["dev", "manual"], tagMode: "and" },
), true);
assert.deepEqual(
  plain(["0-7d", "8-30d", "1-3m", "3-6m", "6-12m", "1y+"]
    .map(key => [key, filters.getAgeBucketFilter(key)])),
  [
    ["0-7d", { minAgeDays: "0", maxAgeDays: "7", label: "0–7 days" }],
    ["8-30d", { minAgeDays: "8", maxAgeDays: "30", label: "8–30 days" }],
    ["1-3m", { minAgeDays: "31", maxAgeDays: "90", label: "1–3 months" }],
    ["3-6m", { minAgeDays: "91", maxAgeDays: "182", label: "3–6 months" }],
    ["6-12m", { minAgeDays: "183", maxAgeDays: "365", label: "6–12 months" }],
    ["1y+", { minAgeDays: "366", maxAgeDays: "", label: "1 year or older" }],
  ],
);
const bridgedFilters = filters.buildInsightsTriageFilters(
  { status: "maybe", tags: ["manual"], availability: "available" },
  {
    channelKey: "url:@alpha",
    ageBucket: "6-12m",
    channels: [{ channelKey: "url:@alpha", channelName: "Alpha" }],
  },
);
assert.deepEqual(plain(bridgedFilters.channels), ["Alpha"]);
assert.equal(bridgedFilters.status, "maybe");
assert.deepEqual(plain(bridgedFilters.tags), ["manual"]);
assert.equal(bridgedFilters.availability, "available");
assert.equal(bridgedFilters.ageBucket, "6-12m");
assert.equal(bridgedFilters.minAgeDays, "183");
assert.equal(bridgedFilters.maxAgeDays, "365");
assert.equal(filters.videoMatchesFilters(
  { channel: "Alpha", uploaded: "12 months ago", suggestedTags: ["manual"] },
  { status: "maybe" },
  bridgedFilters,
), true);
assert.equal(filters.videoMatchesFilters(
  { channel: "Alpha", uploaded: "2 years ago", suggestedTags: ["manual"] },
  { status: "maybe" },
  bridgedFilters,
), false, "the 6–12 month bridge must exclude 1y+ videos");
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
assert.equal(filters.videoMatchesFilters(
  { channel: "Alpha", uploaded: "12 months ago" },
  {},
  filters.buildInsightsTriageFilters({}, {
    channelName: "Alpha",
    ageBucket: "6-12m",
    ageAnchorAt: thirtyDaysAgo,
  }),
), false, "relative ages must advance from the import/export anchor just as Insights facts do");
assert.equal(filters.videoMatchesFilters(
  { channel: "Alpha", uploaded: "" },
  {},
  filters.buildInsightsTriageFilters({}, {
    channelName: "Alpha",
    ageBucket: "unknown",
  }),
), true);
assert.deepEqual(plain(filters.normalizeSavedViews("not-an-array")), []);
assert.deepEqual(plain(filters.getAdvancedFilterEntries({
  tags: ["dev", "manual"],
  tagMode: "and",
  minDurationMinutes: 10,
  availability: "available",
  note: "yes",
})), [
  { key: "tags", label: "Tags: dev AND manual" },
  { key: "minDurationMinutes", label: "Duration \u2265 10m" },
  { key: "availability", label: "Available only" },
  { key: "note", label: "Has note" },
]);
assert.equal(insights.getAgeBucket(366), "1y+");
assert.deepEqual(plain(insights.buildChannelInsights([], {})), plain(
  insights.createEmptyInsightsModel(),
));

const durationStats = timeBudget.calculateDurationStats([
  { videoId: "keep", channel: "A", durationSeconds: 600, suggestedTags: ["dev"] },
  { videoId: "unknown", channel: "A", durationSeconds: null },
], {
  keep: { status: "keep", tags: ["manual"] },
});
assert.equal(durationStats.totalCount, 2);
assert.equal(durationStats.knownCount, 1);
assert.equal(durationStats.protectedSeconds, 600);
assert.equal(timeBudget.normalizeTimeBudgetHours("invalid"), 2);
assert.deepEqual(
  plain(timeBudget.buildTimeBudgetShortlist(
    [{ videoId: "short", durationSeconds: 300 }, { videoId: "long", durationSeconds: 900 }],
    {},
    600,
  ).videos.map(video => video.videoId)),
  ["short"],
);
const timeBudgetSummary = timeBudget.buildTimeBudgetSummary([
  { videoId: "keep", channel: "A", durationSeconds: 600 },
  { videoId: "maybe", channel: "B", durationSeconds: 1200 },
  { videoId: "delete", channel: "B", durationSeconds: 300 },
], {
  keep: { status: "keep" },
  maybe: { status: "maybe" },
  delete: { status: "delete" },
}, 0.5);
assert.equal(timeBudgetSummary.budgetHours, 0.5);
assert.equal(timeBudgetSummary.stats.protectedSeconds, 1800);
assert.equal(timeBudgetSummary.protectedWeeks, 1);
assert.deepEqual(
  plain(timeBudgetSummary.shortlist.videos.map(video => video.videoId)),
  ["keep", "maybe"],
);
assert.equal(timeBudgetSummary.byChannel[0].name, "B");

const groups = grouping.buildVideoGroups([
  { videoId: "episode-1", title: "Great Show S01E01", channel: "Channel A", uploaded: "2 days ago" },
  { videoId: "episode-2", title: "Great Show S01E02", channel: "Channel A", uploaded: "1 day ago" },
]);
assert.equal(groups.length, 1);
assert.equal(groups[0].type, "series");
assert.equal(grouping.chooseGroupWinner(groups[0], "newest").videoId, "episode-2");
assert.deepEqual(plain(grouping.buildVideoGroups(null)), []);
assert.equal(grouping.chooseGroupWinner({ members: [{ videoId: "unknown" }] }, "newest"), null);

const exportedAt = "2026-07-28T12:00:00.000Z";
const payload = workspace.buildWorkspacePayload({
  videos: [{ videoId: "video-1", title: "Video" }],
  decisions: decisionMap,
  ui: { status: "keep", channels: ["Channel A"] },
  timeBudgetHours: 3.5,
}, exportedAt);
const restored = workspace.parseWorkspacePayload(payload);
assert.equal(payload.exportedAt, exportedAt);
assert.equal(restored.videos[0].videoId, "video-1");
assert.equal(restored.decisions["video-1"].note, "Watch later");
assert.equal(restored.ui.status, "keep");
assert.equal(restored.timeBudgetHours, 3.5);
assert.throws(() => workspace.parseWorkspacePayload(null), /workspace snapshot/i);
assert.throws(
  () => workspace.parseWorkspacePayload({ mode: "workspace-snapshot", schemaVersion: 2 }),
  /Unsupported workspace schema version/,
);

console.log("domain modules test passed");
