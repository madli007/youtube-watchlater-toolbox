const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const idMatches = Array.from(html.matchAll(/\bid="([^"]+)"/g), match => match[1]);
const declaredIds = new Set(idMatches);
assert.equal(declaredIds.size, idMatches.length, "DOM IDs must be unique");
const referencedIds = Array.from(html.matchAll(/document\.getElementById\("([^"]+)"\)/g), match => match[1]);
assert.deepEqual(referencedIds.filter(id => !declaredIds.has(id)), [], "all referenced DOM IDs must exist");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, "triage script not found");

const source = scriptMatch[1].replace(
  "    init();",
  "    globalThis.testApi = { buildWorkspacePayload, parseWorkspacePayload, createHistoryEntry, applyHistoryEntry, normalizeHistory, compareVideoDatasets, createDatasetBaseline, normalizeImportComparison, normalizeUserRules, ruleMatchesVideo, normalizeChannelRules, normalizeChannelRule, getChannelRuleDecision, getChannelRuleImpact, getCombinedChannelRuleImpact, getProtectedChannelMatches, channelMatchesQuery, filterChannelOptions, getChannelOptionPage, updateDecisionDetails, getPortableDecisions, normalizeFilterState, normalizeSavedViews, parseApproximateAgeDays, parseApproximateViewCount, videoMatchesFilters, normalizeTimeBudgetHours, calculateDurationStats, getSortedDurationGroups, buildTimeBudgetShortlist, formatDuration };",
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

const exportedAt = "2026-07-19T12:00:00.000Z";
const workspace = sandbox.testApi.buildWorkspacePayload({
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

const parsed = sandbox.testApi.parseWorkspacePayload(workspace);
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
assert.throws(
  () => sandbox.testApi.parseWorkspacePayload({ mode: "decisions-export", schemaVersion: 1 }),
  /workspace snapshot/i,
);
assert.throws(
  () => sandbox.testApi.parseWorkspacePayload({ mode: "workspace-snapshot", schemaVersion: 2 }),
  /schema version/i,
);

const historyEntry = sandbox.testApi.createHistoryEntry(
  "2 visible → delete",
  "bulk-status",
  {
    one: { status: "keep", tags: [], note: "", updatedAt: exportedAt },
    two: null,
  },
  exportedAt,
  "snapshot-1",
);
const restored = sandbox.testApi.applyHistoryEntry({
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
assert.equal(sandbox.testApi.normalizeHistory(oversizedHistory).length, 20);

const previousVideos = [
  { videoId: "same", title: "Original", channel: "Channel", durationSeconds: 60, views: "10 views" },
  { videoId: "gone", title: "Removed", channel: "Old" },
];
const currentVideos = [
  { videoId: "same", title: "Renamed", channel: "Channel", durationSeconds: 60, views: "20 views" },
  { videoId: "new", title: "New", channel: "Fresh" },
];
const comparison = sandbox.testApi.compareVideoDatasets(
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

const volatileOnly = sandbox.testApi.compareVideoDatasets(
  [{ videoId: "same", title: "Stable", views: "10 views", uploaded: "1 day ago" }],
  [{ videoId: "same", title: "Stable", views: "99 views", uploaded: "2 days ago" }],
);
assert.deepEqual([...volatileOnly.changedIds], []);

const baseline = sandbox.testApi.createDatasetBaseline(currentVideos, { fileName: "current.json" });
assert.equal(baseline.schemaVersion, 1);
assert.equal(baseline.videos.length, 2);
assert.equal(baseline.videos[0].views, undefined);

const channelRule = { positive: ["documentary"], negative: ["trailer"], channel: "Channel" };
assert.equal(sandbox.testApi.ruleMatchesVideo({ title: "Great documentary", channel: "Channel" }, channelRule), true);
assert.equal(sandbox.testApi.ruleMatchesVideo({ title: "Documentary trailer", channel: "Channel" }, channelRule), false);
assert.equal(sandbox.testApi.ruleMatchesVideo({ title: "Great documentary", channel: "Elsewhere" }, channelRule), false);

const normalizedChannelRules = sandbox.testApi.normalizeChannelRules([
  { channel: "Channel A", mode: "default-keep", tag: "favorite", protected: true },
  { channel: "channel a", mode: "always-review" },
  { channel: "", mode: "always-keep" },
]);
assert.equal(normalizedChannelRules.length, 1);
assert.equal(normalizedChannelRules[0].mode, "always-review");
assert.equal(sandbox.testApi.normalizeChannelRule({ channel: "Always", mode: "always-keep" }).protected, true);

const channelVideos = [
  { videoId: "new", channel: "Channel A" },
  { videoId: "decided", channel: "Channel A" },
  { videoId: "other", channel: "Channel B" },
];
const channelDecisions = {
  decided: { status: "delete", tags: [], note: "", updatedAt: exportedAt },
};
const defaultRuleImpact = sandbox.testApi.getChannelRuleImpact(channelVideos, channelDecisions, {
  channel: "channel a",
  mode: "default-keep",
  tag: "favorite",
  protected: true,
});
assert.equal(defaultRuleImpact.matchCount, 2);
assert.equal(defaultRuleImpact.statusChangeCount, 1);
assert.equal(defaultRuleImpact.tagAdditionCount, 2);
assert.deepEqual([...defaultRuleImpact.affectedIds], ["new", "decided"]);
const defaultExisting = sandbox.testApi.getChannelRuleDecision(channelDecisions.decided, {
  channel: "Channel A",
  mode: "default-keep",
}, exportedAt);
assert.equal(defaultExisting.status, "delete");
const alwaysReview = sandbox.testApi.getChannelRuleDecision(channelDecisions.decided, {
  channel: "Channel A",
  mode: "always-review",
}, exportedAt);
assert.equal(alwaysReview.status, "maybe");
const protectedMatches = sandbox.testApi.getProtectedChannelMatches(channelVideos, ["new", "other"], [
  { channel: "Channel A", protected: true },
]);
assert.deepEqual([...protectedMatches].map(match => match.videoId), ["new"]);

const detailDecisions = {};
sandbox.testApi.updateDecisionDetails(detailDecisions, "one", ["manual", "manual"], "Watch later", exportedAt);
assert.equal(detailDecisions.one.status, "unreviewed");
assert.deepEqual([...detailDecisions.one.tags], ["manual"]);
assert.equal(detailDecisions.one.note, "Watch later");
assert.equal(Object.keys(sandbox.testApi.getPortableDecisions(detailDecisions)).length, 1);
sandbox.testApi.updateDecisionDetails(detailDecisions, "one", [], "", exportedAt);
assert.equal(detailDecisions.one, undefined);

const legacyFilters = sandbox.testApi.normalizeFilterState({
  channel: "Channel A",
  tag: "dev",
  minViews: "1000",
  availability: "unavailable",
});
assert.deepEqual([...legacyFilters.channels], ["Channel A"]);
assert.deepEqual([...legacyFilters.tags], ["dev"]);
assert.equal(legacyFilters.minViews, "1000");
assert.equal(legacyFilters.availability, "unavailable");

assert.equal(sandbox.testApi.parseApproximateAgeDays("pred 2 dnevoma"), 2);
assert.equal(sandbox.testApi.parseApproximateAgeDays("3 weeks ago"), 21);
assert.equal(sandbox.testApi.parseApproximateViewCount("1,4 tis. ogledov"), 1400);
assert.equal(sandbox.testApi.parseApproximateViewCount("2.5M views"), 2500000);

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
assert.equal(sandbox.testApi.videoMatchesFilters(filterVideo, filterDecision, {
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
assert.equal(sandbox.testApi.channelMatchesQuery("Čudežni Kanal", "cude kanal"), true);
assert.deepEqual(
  [...sandbox.testApi.filterChannelOptions([
    { name: "Linus Tech Tips", count: 2 },
    { name: "TechAltar", count: 1 },
  ], "lin tech")].map(item => item.name),
  ["Linus Tech Tips"],
);
const channelOptionPage = sandbox.testApi.getChannelOptionPage(
  Array.from({ length: 100 }, (_, index) => ({ name: `Channel ${index}`, count: 100 - index })),
  "channel",
  24,
);
assert.equal(channelOptionPage.totalCount, 100);
assert.equal(channelOptionPage.options.length, 24);
const exactChannelFirst = sandbox.testApi.filterChannelOptions([
  { name: "Channel Extra", count: 100 },
  { name: "Channel", count: 1 },
], "channel");
assert.equal(exactChannelFirst[0].name, "Channel");
assert.equal(sandbox.testApi.videoMatchesFilters(filterVideo, filterDecision, {
  tags: ["dev", "missing"],
  tagMode: "and",
}), false);
assert.equal(sandbox.testApi.videoMatchesFilters(filterVideo, filterDecision, {
  tags: ["dev", "missing"],
  tagMode: "or",
}), true);
assert.equal(sandbox.testApi.videoMatchesFilters(filterVideo, filterDecision, {
  minViews: 2000,
}), false);

const normalizedViews = sandbox.testApi.normalizeSavedViews([
  { id: "podcasts", name: "Podcasts", filters: { minDurationMinutes: 30, tags: ["podcast"] } },
  { name: "Legacy" },
]);
assert.equal(normalizedViews.length, 2);
assert.equal(normalizedViews.find(view => view.id === "podcasts").filters.minDurationMinutes, "30");
assert.deepEqual([...normalizedViews.find(view => view.id === "podcasts").filters.tags], ["podcast"]);

assert.equal(sandbox.testApi.normalizeTimeBudgetHours("2.6"), 2.5);
assert.equal(sandbox.testApi.normalizeTimeBudgetHours(0), 2);
assert.equal(sandbox.testApi.normalizeTimeBudgetHours(999), 168);
assert.equal(sandbox.testApi.formatDuration(90 * 60), "1h 30m");

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
const durationStats = sandbox.testApi.calculateDurationStats(durationVideos, durationDecisions);
assert.equal(durationStats.totalCount, 7);
assert.equal(durationStats.knownCount, 6);
assert.equal(durationStats.unknownCount, 1);
assert.equal(durationStats.totalSeconds, 120 * 60);
assert.equal(durationStats.protectedSeconds, 100 * 60);
assert.equal(durationStats.decidedSeconds, 105 * 60);
assert.equal(durationStats.byChannel.A.seconds, 70 * 60);
assert.equal(durationStats.byTag.dev.seconds, 70 * 60);
assert.equal(durationStats.byTag.manual.seconds, 20 * 60);

const shortlist = sandbox.testApi.buildTimeBudgetShortlist(durationVideos, durationDecisions, 60 * 60);
assert.deepEqual([...shortlist.videos].map(video => video.videoId), ["keep-short", "maybe", "unreviewed"]);
assert.equal(shortlist.totalSeconds, 60 * 60);
assert.equal([...shortlist.videos].some(video => video.videoId === "delete"), false);
assert.equal([...shortlist.videos].some(video => video.videoId === "unavailable"), false);

console.log("triage workspace test passed");
