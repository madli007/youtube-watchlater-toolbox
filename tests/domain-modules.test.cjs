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
  importComparison,
  filters,
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
assert.deepEqual(plain(filters.normalizeSavedViews("not-an-array")), []);

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
