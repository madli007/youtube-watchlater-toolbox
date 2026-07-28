const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  assertLinkedAssetsExist,
  getLinkedAssets,
  loadScriptSources,
  loadTriageApp,
} = require("./helpers/load-triage-app.cjs");

const {
  entryPath,
  html,
  scripts,
  source,
} = loadTriageApp();
assert.doesNotMatch(
  html,
  /<style\b/i,
  "production HTML must not contain an inline application stylesheet",
);
assert.deepEqual(
  getLinkedAssets(html, entryPath)
    .filter(asset => asset.type === "CSS")
    .map(asset => asset.reference),
  ["./assets/css/app.css"],
  "production HTML must link the single application stylesheet",
);
const expectedApplicationScripts = [
  "./assets/js/config.js",
  "./assets/js/domain/decisions.js",
  "./assets/js/domain/import-comparison.js",
  "./assets/js/domain/filters.js",
  "./assets/js/domain/time-budget.js",
  "./assets/js/domain/grouping.js",
  "./assets/js/domain/workspace.js",
  "./assets/js/storage.js",
  "./assets/js/browser-io.js",
  "./assets/js/state.js",
  "./assets/js/app.js",
];
assert.equal(scripts.length, expectedApplicationScripts.length);
assert.ok(
  scripts.every(script => script.kind === "external"),
  "production HTML must not contain an inline application script",
);
assert.deepEqual(
  getLinkedAssets(html, entryPath)
    .filter(asset => asset.type === "JavaScript")
    .map(asset => asset.reference),
  expectedApplicationScripts,
  "production HTML must load config, domain modules, and the application orchestrator in dependency order",
);
assert.match(
  html,
  /<script src=["']\.\/assets\/js\/config\.js["']><\/script>[\s\S]*<script src=["']\.\/assets\/js\/app\.js["']><\/script>/i,
  "application modules must use plain blocking script tags",
);
assert.doesNotMatch(
  fs.readFileSync(path.join(path.dirname(entryPath), "assets/js/app.js"), "utf8"),
  /\b(?:localStorage|FileReader|Blob|createObjectURL|revokeObjectURL)\b/,
  "the application orchestrator must use the replaceable storage and browser I/O boundaries",
);
assert.match(source, /event\.key === "p"/, "the p shortcut must toggle the quick preview");

const fixtureEntryPath = path.join(__dirname, "fixtures", "loader-entry.html");
const externalFixtureHtml = [
  '<link rel="stylesheet" href="./loader-style.css">',
  '<script src="./loader-script.js"></script>',
].join("\n");
assertLinkedAssetsExist(externalFixtureHtml, fixtureEntryPath);
const externalFixtureScripts = loadScriptSources(externalFixtureHtml, fixtureEntryPath);
assert.equal(externalFixtureScripts.length, 1);
assert.equal(externalFixtureScripts[0].kind, "external");
assert.match(externalFixtureScripts[0].source, /loaderFixture/);
assert.throws(
  () => assertLinkedAssetsExist(
    '<link rel="stylesheet" href="./missing-style.css">',
    fixtureEntryPath,
  ),
  /Missing CSS asset.*missing-style\.css/,
);
assert.throws(
  () => assertLinkedAssetsExist(
    '<script src="./missing-script.js"></script>',
    fixtureEntryPath,
  ),
  /Missing JavaScript asset.*missing-script\.js/,
);
assert.throws(
  () => assertLinkedAssetsExist(
    '<img src="./missing-image.png" alt="">',
    fixtureEntryPath,
  ),
  /Missing media asset.*missing-image\.png/,
);

const elementStub = {
  addEventListener() {},
  appendChild() {},
  classList: { add() {}, remove() {} },
  options: [],
  replaceChildren() {},
  value: "",
};
const sandbox = {
  __WATCHLATER_TEST__: true,
  document: {
    getElementById() {
      return { ...elementStub, classList: { ...elementStub.classList } };
    },
  },
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);
assert.ok(sandbox.WatchLaterApp, "controlled application namespace not exposed");
assert.deepEqual(
  Object.keys(sandbox.WatchLaterApp.domain),
  ["decisions", "importComparison", "filters", "timeBudget", "grouping", "workspace"],
);
assert.ok(
  Object.values(sandbox.WatchLaterApp.domain).every(Object.isFrozen),
  "domain module APIs must be immutable",
);
assert.ok(sandbox.WatchLaterTestApi, "triage test API not exposed");
const {
  decisions: decisionsApi,
  importComparison: importComparisonApi,
  filters: filtersApi,
  timeBudget: timeBudgetApi,
  grouping: groupingApi,
  workspace: workspaceApi,
} = sandbox.WatchLaterApp.domain;
sandbox.testApi = sandbox.WatchLaterTestApi;

assert.equal(sandbox.WatchLaterApp.config.PAGE_SIZE, 220);
assert.equal(sandbox.WatchLaterApp.config.STORAGE_KEY, "watchlater-triage-decisions-v1");
assert.equal(decisionsApi.normalizeDecision({ status: "invalid" }).status, "unreviewed");
assert.deepEqual([...decisionsApi.normalizeTags("not-an-array")], []);
assert.equal(importComparisonApi.normalizeImportComparison(null).baselineAvailable, false);
assert.deepEqual([...filtersApi.normalizeSavedViews("not-an-array")], []);
assert.equal(timeBudgetApi.normalizeTimeBudgetHours("invalid"), 2);
assert.deepEqual([...groupingApi.buildVideoGroups(null)], []);
assert.throws(() => workspaceApi.parseWorkspacePayload(null), /workspace snapshot/i);

const exportedAt = "2026-07-19T12:00:00.000Z";
const workspace = workspaceApi.buildWorkspacePayload({
  videos: [{ videoId: "one", title: "One" }],
  decisions: {
    one: { status: "keep", tags: ["manual", "manual"], note: "Later", updatedAt: exportedAt },
    ignored: { status: "unreviewed", tags: [], note: "", updatedAt: "" },
  },
  userRules: {
    custom: { positive: ["alpha", "alpha", "beta"], negative: ["skip"], channel: "Channel" },
    legacy: ["old format"],
    invalid: "nope",
  },
  channelRules: [
    { id: "channel-a", channel: "Channel A", mode: "default-keep", tag: "favorite", protected: true },
  ],
  savedViews: [{ id: "keep-view", name: "Keep", filters: { status: "keep", minDurationMinutes: 10 } }],
  lastImport: { fileName: "watchlater.json", importedAt: exportedAt },
  importComparison: {
    baselineAvailable: true,
    newIds: ["one"],
    removedVideos: [{ videoId: "gone", title: "Gone" }],
    decidedIds: ["one"],
    changedIds: [],
    orphanedDecisionIds: ["ignored"],
  },
  history: [],
  timeBudgetHours: 3.5,
  previewProgress: { one: 83.9, invalid: -4, nope: "not-a-time" },
  ui: {
    status: "keep",
    datasetView: "inbox",
    channels: ["Channel"],
    tags: ["dev", "manual"],
    tagMode: "and",
    minDurationMinutes: 10,
    availability: "available",
    selectedIds: ["one"],
  },
}, exportedAt);

assert.equal(workspace.mode, "workspace-snapshot");
assert.equal(workspace.schemaVersion, 1);
assert.equal(workspace.exportedAt, exportedAt);
assert.equal(workspace.workspace.videos.length, 1);
assert.equal(Object.keys(workspace.workspace.decisions).length, 1);
assert.deepEqual([...workspace.workspace.decisions.one.tags], ["manual"]);
assert.deepEqual([...workspace.workspace.userRules.custom.positive], ["alpha", "beta"]);
assert.deepEqual([...workspace.workspace.userRules.custom.negative], ["skip"]);
assert.equal(workspace.workspace.userRules.custom.channel, "Channel");
assert.equal(workspace.workspace.channelRules[0].channel, "Channel A");
assert.equal(workspace.workspace.channelRules[0].protected, true);
assert.deepEqual([...workspace.workspace.userRules.legacy.positive], ["old format"]);
assert.equal(workspace.workspace.userRules.invalid, undefined);
assert.equal(workspace.workspace.importComparison.baselineAvailable, true);
assert.deepEqual([...workspace.workspace.importComparison.newIds], ["one"]);
assert.equal(workspace.workspace.timeBudgetHours, 3.5);
assert.deepEqual({ ...workspace.workspace.previewProgress }, { one: 83 });

const parsed = workspaceApi.parseWorkspacePayload(workspace);
assert.equal(parsed.videos[0].videoId, "one");
assert.equal(parsed.decisions.one.status, "keep");
assert.equal(parsed.ui.status, "keep");
assert.equal(parsed.ui.datasetView, "inbox");
assert.deepEqual([...parsed.ui.channels], ["Channel"]);
assert.deepEqual([...parsed.ui.tags], ["dev", "manual"]);
assert.equal(parsed.ui.tagMode, "and");
assert.equal(parsed.ui.minDurationMinutes, "10");
assert.equal(parsed.ui.availability, "available");
assert.equal(parsed.importComparison.removedVideos[0].videoId, "gone");
assert.deepEqual([...parsed.ui.selectedIds], ["one"]);
assert.deepEqual([...parsed.userRules.custom.positive], ["alpha", "beta"]);
assert.equal(parsed.channelRules[0].mode, "default-keep");
assert.equal(parsed.savedViews[0].id, "keep-view");
assert.equal(parsed.savedViews[0].filters.status, "keep");
assert.equal(parsed.savedViews[0].filters.minDurationMinutes, "10");
assert.equal(parsed.timeBudgetHours, 3.5);
assert.deepEqual({ ...parsed.previewProgress }, { one: 83 });
assert.throws(
  () => workspaceApi.parseWorkspacePayload({ mode: "decisions-export", schemaVersion: 1 }),
  /workspace snapshot/i,
);
assert.throws(
  () => workspaceApi.parseWorkspacePayload({ mode: "workspace-snapshot", schemaVersion: 2 }),
  /schema version/i,
);

const historyEntry = decisionsApi.createHistoryEntry(
  "2 visible → delete",
  "bulk-status",
  {
    one: { status: "keep", tags: [], note: "", updatedAt: exportedAt },
    two: null,
  },
  exportedAt,
  "snapshot-1",
);
const restored = decisionsApi.applyHistoryEntry({
  one: { status: "delete", tags: [], note: "", updatedAt: exportedAt },
  two: { status: "delete", tags: [], note: "", updatedAt: exportedAt },
  three: { status: "maybe", tags: [], note: "", updatedAt: exportedAt },
}, historyEntry);

assert.equal(restored.one.status, "keep");
assert.equal(restored.two, undefined);
assert.equal(restored.three.status, "maybe");
assert.equal(historyEntry.affectedCount, 2);

const oversizedHistory = Array.from({ length: 25 }, (_, index) => ({
  ...historyEntry,
  id: `snapshot-${index}`,
}));
assert.equal(decisionsApi.normalizeHistory(oversizedHistory).length, 20);

const previousVideos = [
  { videoId: "same", title: "Original", channel: "Channel", durationSeconds: 60, views: "10 views" },
  { videoId: "gone", title: "Removed", channel: "Old" },
];
const currentVideos = [
  { videoId: "same", title: "Renamed", channel: "Channel", durationSeconds: 60, views: "20 views" },
  { videoId: "new", title: "New", channel: "Fresh" },
];
const comparison = importComparisonApi.compareVideoDatasets(
  previousVideos,
  currentVideos,
  {
    same: { status: "keep", updatedAt: exportedAt },
    orphan: { status: "maybe", updatedAt: exportedAt },
  },
  { fileName: "previous.json" },
  { fileName: "current.json" },
);

assert.equal(comparison.baselineAvailable, true);
assert.deepEqual([...comparison.newIds], ["new"]);
assert.deepEqual([...comparison.removedVideos].map(video => video.videoId), ["gone"]);
assert.deepEqual([...comparison.decidedIds], ["same"]);
assert.deepEqual([...comparison.changedIds], ["same"]);
assert.deepEqual([...comparison.changedFieldsById.same], ["title"]);
assert.deepEqual([...comparison.orphanedDecisionIds], ["orphan"]);

const volatileOnly = importComparisonApi.compareVideoDatasets(
  [{ videoId: "same", title: "Stable", views: "10 views", uploaded: "1 day ago" }],
  [{ videoId: "same", title: "Stable", views: "99 views", uploaded: "2 days ago" }],
);
assert.deepEqual([...volatileOnly.changedIds], []);

const baseline = importComparisonApi.createDatasetBaseline(currentVideos, { fileName: "current.json" });
assert.equal(baseline.schemaVersion, 1);
assert.equal(baseline.videos.length, 2);
assert.equal(baseline.videos[0].views, undefined);

const channelRule = { positive: ["documentary"], negative: ["trailer"], channel: "Channel" };
assert.equal(decisionsApi.ruleMatchesVideo({ title: "Great documentary", channel: "Channel" }, channelRule), true);
assert.equal(decisionsApi.ruleMatchesVideo({ title: "Documentary trailer", channel: "Channel" }, channelRule), false);
assert.equal(decisionsApi.ruleMatchesVideo({ title: "Great documentary", channel: "Elsewhere" }, channelRule), false);

const normalizedChannelRules = decisionsApi.normalizeChannelRules([
  { channel: "Channel A", mode: "default-keep", tag: "favorite", protected: true },
  { channel: "channel a", mode: "always-review" },
  { channel: "", mode: "always-keep" },
]);
assert.equal(normalizedChannelRules.length, 1);
assert.equal(normalizedChannelRules[0].mode, "always-review");
assert.equal(decisionsApi.normalizeChannelRule({ channel: "Always", mode: "always-keep" }).protected, true);

const channelVideos = [
  { videoId: "new", channel: "Channel A" },
  { videoId: "decided", channel: "Channel A" },
  { videoId: "other", channel: "Channel B" },
];
const channelDecisions = {
  decided: { status: "delete", tags: [], note: "", updatedAt: exportedAt },
};
const defaultRuleImpact = decisionsApi.getChannelRuleImpact(channelVideos, channelDecisions, {
  channel: "channel a",
  mode: "default-keep",
  tag: "favorite",
  protected: true,
});
assert.equal(defaultRuleImpact.matchCount, 2);
assert.equal(defaultRuleImpact.statusChangeCount, 1);
assert.equal(defaultRuleImpact.tagAdditionCount, 2);
assert.deepEqual([...defaultRuleImpact.affectedIds], ["new", "decided"]);
const defaultExisting = decisionsApi.getChannelRuleDecision(channelDecisions.decided, {
  channel: "Channel A",
  mode: "default-keep",
}, exportedAt);
assert.equal(defaultExisting.status, "delete");
const alwaysReview = decisionsApi.getChannelRuleDecision(channelDecisions.decided, {
  channel: "Channel A",
  mode: "always-review",
}, exportedAt);
assert.equal(alwaysReview.status, "maybe");
const protectedMatches = decisionsApi.getProtectedChannelMatches(channelVideos, ["new", "other"], [
  { channel: "Channel A", protected: true },
]);
assert.deepEqual([...protectedMatches].map(match => match.videoId), ["new"]);

const detailDecisions = {};
decisionsApi.updateDecisionDetails(detailDecisions, "one", ["manual", "manual"], "Watch later", exportedAt);
assert.equal(detailDecisions.one.status, "unreviewed");
assert.deepEqual([...detailDecisions.one.tags], ["manual"]);
assert.equal(detailDecisions.one.note, "Watch later");
assert.equal(Object.keys(decisionsApi.getPortableDecisions(detailDecisions)).length, 1);
decisionsApi.updateDecisionDetails(detailDecisions, "one", [], "", exportedAt);
assert.equal(detailDecisions.one, undefined);

const legacyFilters = filtersApi.normalizeFilterState({
  channel: "Channel A",
  tag: "dev",
  minViews: "1000",
  availability: "unavailable",
});
assert.deepEqual([...legacyFilters.channels], ["Channel A"]);
assert.deepEqual([...legacyFilters.tags], ["dev"]);
assert.equal(legacyFilters.minViews, "1000");
assert.equal(legacyFilters.availability, "unavailable");

assert.equal(filtersApi.parseApproximateAgeDays("pred 2 dnevoma"), 2);
assert.equal(filtersApi.parseApproximateAgeDays("3 weeks ago"), 21);
assert.equal(filtersApi.parseApproximateViewCount("1,4 tis. ogledov"), 1400);
assert.equal(filtersApi.parseApproximateViewCount("2.5M views"), 2500000);

const filterVideo = {
  videoId: "filter-one",
  title: "Advanced filters",
  channel: "Channel A",
  durationSeconds: 900,
  views: "1,4 tis. ogledov",
  uploaded: "pred 2 dnevoma",
  badges: ["4K"],
  isUnavailable: false,
  suggestedTags: ["dev"],
};
const filterDecision = { status: "maybe", tags: ["manual"], note: "Watch this" };
assert.equal(filtersApi.videoMatchesFilters(filterVideo, filterDecision, {
  status: "maybe",
  channels: ["Channel A", "Channel B"],
  tags: ["dev", "manual"],
  tagMode: "and",
  minDurationMinutes: 10,
  maxDurationMinutes: 20,
  maxAgeDays: 3,
  minViews: 1000,
  availability: "available",
  badge: "badge:4K",
  suggestedTag: "yes",
  note: "yes",
}), true);
assert.equal(filtersApi.channelMatchesQuery("Čudežni Kanal", "cude kanal"), true);
assert.deepEqual(
  [...filtersApi.filterChannelOptions([
    { name: "Linus Tech Tips", count: 2 },
    { name: "TechAltar", count: 1 },
  ], "lin tech")].map(item => item.name),
  ["Linus Tech Tips"],
);
const channelOptionPage = filtersApi.getChannelOptionPage(
  Array.from({ length: 100 }, (_, index) => ({ name: `Channel ${index}`, count: 100 - index })),
  "channel",
  24,
);
assert.equal(channelOptionPage.totalCount, 100);
assert.equal(channelOptionPage.options.length, 24);
const exactChannelFirst = filtersApi.filterChannelOptions([
  { name: "Channel Extra", count: 100 },
  { name: "Channel", count: 1 },
], "channel");
assert.equal(exactChannelFirst[0].name, "Channel");
assert.equal(filtersApi.videoMatchesFilters(filterVideo, filterDecision, {
  tags: ["dev", "missing"],
  tagMode: "and",
}), false);
assert.equal(filtersApi.videoMatchesFilters(filterVideo, filterDecision, {
  tags: ["dev", "missing"],
  tagMode: "or",
}), true);
assert.equal(filtersApi.videoMatchesFilters(filterVideo, filterDecision, {
  minViews: 2000,
}), false);

const normalizedViews = filtersApi.normalizeSavedViews([
  { id: "podcasts", name: "Podcasts", filters: { minDurationMinutes: 30, tags: ["podcast"] } },
  { name: "Legacy" },
]);
assert.equal(normalizedViews.length, 2);
assert.equal(normalizedViews.find(view => view.id === "podcasts").filters.minDurationMinutes, "30");
assert.deepEqual([...normalizedViews.find(view => view.id === "podcasts").filters.tags], ["podcast"]);

assert.equal(timeBudgetApi.normalizeTimeBudgetHours("2.6"), 2.5);
assert.equal(timeBudgetApi.normalizeTimeBudgetHours(0), 2);
assert.equal(timeBudgetApi.normalizeTimeBudgetHours(999), 168);
assert.equal(timeBudgetApi.formatDuration(90 * 60), "1h 30m");
assert.equal(sandbox.testApi.formatPreviewTime(83), "1:23");
assert.equal(sandbox.testApi.formatPreviewTime(3723), "1:02:03");
assert.deepEqual(
  { ...workspaceApi.normalizePreviewProgress({ one: 12.8, zero: 0, bad: "nope" }) },
  { one: 12 },
);
assert.equal(
  sandbox.testApi.buildYouTubeEmbedUrl("abc_123", 83, "https://example.test"),
  "https://www.youtube-nocookie.com/embed/abc_123?autoplay=1&enablejsapi=1&playsinline=1&rel=0&start=83&origin=https%3A%2F%2Fexample.test",
);

const durationVideos = [
  { videoId: "keep-short", title: "Keep short", channel: "A", durationSeconds: 20 * 60, suggestedTags: ["dev"] },
  { videoId: "keep-long", title: "Keep long", channel: "A", durationSeconds: 50 * 60, suggestedTags: ["dev"] },
  { videoId: "maybe", title: "Maybe", channel: "B", durationSeconds: 30 * 60, suggestedTags: ["music"] },
  { videoId: "unreviewed", title: "Unreviewed", channel: "B", durationSeconds: 10 * 60 },
  { videoId: "delete", title: "Delete", channel: "C", durationSeconds: 5 * 60 },
  { videoId: "unavailable", title: "Unavailable", channel: "C", durationSeconds: 5 * 60, isUnavailable: true },
  { videoId: "unknown", title: "Unknown", channel: "C", durationSeconds: null },
];
const durationDecisions = {
  "keep-short": { status: "keep", tags: ["manual"] },
  "keep-long": { status: "keep" },
  maybe: { status: "maybe" },
  delete: { status: "delete" },
};
const durationStats = timeBudgetApi.calculateDurationStats(durationVideos, durationDecisions);
assert.equal(durationStats.totalCount, 7);
assert.equal(durationStats.knownCount, 6);
assert.equal(durationStats.unknownCount, 1);
assert.equal(durationStats.totalSeconds, 120 * 60);
assert.equal(durationStats.protectedSeconds, 100 * 60);
assert.equal(durationStats.decidedSeconds, 105 * 60);
assert.equal(durationStats.byChannel.A.seconds, 70 * 60);
assert.equal(durationStats.byTag.dev.seconds, 70 * 60);
assert.equal(durationStats.byTag.manual.seconds, 20 * 60);

const shortlist = timeBudgetApi.buildTimeBudgetShortlist(durationVideos, durationDecisions, 60 * 60);
assert.deepEqual([...shortlist.videos].map(video => video.videoId), ["keep-short", "maybe", "unreviewed"]);
assert.equal(shortlist.totalSeconds, 60 * 60);
assert.equal([...shortlist.videos].some(video => video.videoId === "delete"), false);
assert.equal([...shortlist.videos].some(video => video.videoId === "unavailable"), false);

const groupedVideos = [
  { videoId: "series-1", title: "Build Log - Episode 1", channel: "Maker", uploaded: "1 year ago", views: "10K views", index: 1 },
  { videoId: "series-2", title: "Build Log - Episode 2", channel: "Maker", uploaded: "2 days ago", views: "25K views", index: 2 },
  { videoId: "similar-1", title: "JavaScript Async Await Tutorial for Beginners", channel: "Code", index: 3 },
  { videoId: "similar-2", title: "JavaScript Async Await Guide for Beginners", channel: "Code", index: 4 },
  { videoId: "duplicate-1", title: "Great Song (Official Video) [4K]", channel: "Artist", index: 5 },
  { videoId: "duplicate-2", title: "Great Song - Official Video", channel: "Archive", index: 6 },
  { videoId: "unrelated", title: "Completely unrelated topic", channel: "Other", index: 7 },
];
const groups = groupingApi.buildVideoGroups(groupedVideos);
const seriesGroup = groups.find(group => group.type === "series"
  && group.members.some(video => video.videoId === "series-1"));
const similarGroup = groups.find(group => group.type === "similar"
  && group.members.some(video => video.videoId === "similar-1"));
const duplicateGroup = groups.find(group => group.type === "duplicate"
  && group.members.some(video => video.videoId === "duplicate-1"));
assert.ok(seriesGroup, "episode patterns should form a series group");
assert.deepEqual([...seriesGroup.members].map(video => video.videoId), ["series-1", "series-2"]);
assert.ok(similarGroup, "similar titles on the same channel should form a group");
assert.ok(duplicateGroup, "normalized identical titles should form a probable duplicate group");
assert.deepEqual([...duplicateGroup.members].map(video => video.videoId), ["duplicate-1", "duplicate-2"]);
assert.equal(groups.some(group => group.members.some(video => video.videoId === "unrelated")), false);
assert.ok(groupingApi.calculateTitleSimilarity(
  "JavaScript Async Await Tutorial for Beginners",
  "JavaScript Async Await Guide for Beginners",
) >= 0.74);
assert.equal(groupingApi.normalizeDuplicateTitle("Great Song (Official Video) [4K]"), "great song");
assert.equal(groupingApi.chooseGroupWinner(seriesGroup, "newest").videoId, "series-2");
assert.equal(groupingApi.chooseGroupWinner(seriesGroup, "most-viewed").videoId, "series-2");
assert.equal(groupingApi.chooseGroupWinner({ members: [{ videoId: "unknown" }] }, "newest"), null);

console.log("triage workspace test passed");
