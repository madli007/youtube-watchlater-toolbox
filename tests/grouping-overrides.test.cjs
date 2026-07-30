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
  "docs/assets/js/domain/time-budget.js",
  "docs/assets/js/domain/grouping.js",
  "docs/assets/js/domain/workspace.js",
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

const { grouping, workspace } = sandbox.WatchLaterApp.domain;
const plain = value => JSON.parse(JSON.stringify(value));
const timestamp = "2026-07-30T10:00:00.000Z";
const video = (videoId, title, channel = "Channel A", channelUrl = "/@channel-a") => ({
  videoId,
  title,
  channel,
  channelUrl,
  index: Number(videoId.replace(/\D+/g, "")) || 1,
});

const aliasSource = [
  video("galactic-1", "Galactic Tales Episode 1"),
  video("galactic-2", "Galactic Tales Episode 2"),
];
const alias = grouping.createAliasOverride({
  label: "Galactic Tales",
  members: aliasSource,
}, "Cosmic Saga", {
  id: "alias-1",
  createdAt: timestamp,
});
assert.deepEqual(plain(alias.fromBases), ["galactic tales"]);
assert.equal(alias.to, "cosmic saga");

const aliasOverrides = grouping.normalizeGroupingOverrides({
  schemaVersion: 99,
  aliases: [
    alias,
    { id: "", channelKey: "url:@channel-a", fromBases: ["bad"], to: "ignored" },
  ],
  merges: "invalid",
});
assert.equal(aliasOverrides.schemaVersion, 1);
assert.equal(aliasOverrides.aliases.length, 1);
assert.deepEqual(
  plain(grouping.normalizeGroupingOverrides(JSON.parse(JSON.stringify(aliasOverrides)))),
  plain(aliasOverrides),
  "grouping overrides must round-trip through JSON",
);

const aliasGroups = grouping.buildVideoGroups([
  ...aliasSource,
  video("cosmic-3", "Cosmic Saga Episode 3"),
], {
  overrides: aliasOverrides,
});
const aliasedGroup = aliasGroups.find(group => group.overrideIds?.includes("alias-1"));
assert.ok(aliasedGroup, "a manual alias should affect derived series clustering");
assert.equal(aliasedGroup.manual, true);
assert.equal(aliasedGroup.members.length, 3);
assert.equal(aliasedGroup.label, "Cosmic saga");
assert.ok(aliasedGroup.reasons.includes("manual per-channel alias"));

const sourceVideos = [
  video("alpha-1", "Alpha Show Episode 1"),
  video("alpha-2", "Alpha Show Episode 2"),
  video("beta-1", "Beta Show Episode 1"),
  video("beta-2", "Beta Show Episode 2"),
];
const detected = grouping.buildVideoGroups(sourceVideos)
  .filter(group => group.type === "series");
assert.equal(detected.length, 2);

const merge = grouping.createMergeOverride(detected, {
  id: "merge-1",
  createdAt: timestamp,
});
const mergedOverrides = grouping.normalizeGroupingOverrides({ merges: [merge] });
const mergedGroups = grouping.buildVideoGroups(sourceVideos, {
  overrides: mergedOverrides,
});
const manualMerge = mergedGroups.find(group => group.id === "manual-merge-1");
assert.ok(manualMerge);
assert.equal(manualMerge.members.length, 4);
assert.equal(manualMerge.confidenceKind, "manual");

assert.throws(
  () => grouping.createMergeOverride([
    detected[0],
    {
      label: "Other channel",
      members: [
        video("other-1", "Other Episode 1", "Channel B", "/@channel-b"),
        video("other-2", "Other Episode 2", "Channel B", "/@channel-b"),
      ],
    },
  ], {
    id: "cross-channel",
    createdAt: timestamp,
  }),
  /different channels cannot be merged/i,
);

const split = grouping.createSplitOverride(manualMerge, ["beta-1", "beta-2"], {
  id: "split-1",
  createdAt: "2026-07-30T11:00:00.000Z",
});
const splitOverrides = grouping.normalizeGroupingOverrides({
  merges: [merge],
  splits: [split],
});
const splitGroups = grouping.buildVideoGroups(sourceVideos, {
  overrides: splitOverrides,
});
assert.equal(splitGroups.find(group => group.id === "manual-split-1").members.length, 2);
assert.equal(splitGroups.find(group => group.id === "manual-merge-1").members.length, 2);

const withoutSplit = grouping.removeGroupingOverride(splitOverrides, "split-1");
assert.equal(withoutSplit.splits.length, 0);
assert.equal(
  grouping.buildVideoGroups(sourceVideos, { overrides: withoutSplit })
    .find(group => group.id === "manual-merge-1").members.length,
  4,
  "removing a split override should restore the earlier derived/manual group",
);

const orphanedDiagnostics = grouping.getGroupingOverrideDiagnostics(
  splitOverrides,
  sourceVideos.filter(candidate => candidate.videoId !== "beta-2"),
);
const splitDiagnostic = orphanedDiagnostics.find(item => item.id === "split-1");
assert.equal(splitDiagnostic.stale, true);
assert.deepEqual(plain(splitDiagnostic.orphanedIds), ["beta-2"]);

const workspacePayload = workspace.buildWorkspacePayload({
  videos: sourceVideos,
  decisions: {},
  groupingOverrides: splitOverrides,
}, timestamp);
assert.equal(
  workspacePayload.workspace.extensions.channelInsights.groupingOverrides.merges.length,
  1,
);
assert.equal(
  workspacePayload.workspace.extensions.channelInsights.groupingOverrides.splits.length,
  1,
);
const restoredWorkspace = workspace.parseWorkspacePayload(
  JSON.parse(JSON.stringify(workspacePayload)),
);
assert.deepEqual(
  plain(restoredWorkspace.groupingOverrides),
  plain(splitOverrides),
  "workspace export/import must preserve grouping corrections",
);
const oldWorkspace = workspace.parseWorkspacePayload({
  schemaVersion: 1,
  mode: "workspace-snapshot",
  workspace: {
    videos: [],
    decisions: {},
  },
});
assert.deepEqual(plain(oldWorkspace.groupingOverrides), {
  schemaVersion: 1,
  aliases: [],
  merges: [],
  splits: [],
});
const invalidExtensionWorkspace = workspace.parseWorkspacePayload({
  schemaVersion: 1,
  mode: "workspace-snapshot",
  workspace: {
    videos: [],
    decisions: {},
    extensions: {
      channelInsights: {
        schemaVersion: 2,
        groupingOverrides: splitOverrides,
      },
    },
  },
});
assert.equal(invalidExtensionWorkspace.groupingOverrides.merges.length, 0);

console.log("grouping overrides test passed");
