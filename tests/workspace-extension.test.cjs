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

const {
  decisions,
  grouping,
  importHistory,
  workspace,
} = sandbox.WatchLaterApp.domain;
const plain = value => JSON.parse(JSON.stringify(value));
const exportedAt = "2026-07-30T18:00:00.000Z";

const oldHistoryEntry = decisions.createHistoryEntry(
  "Before workspace export",
  "bulk-status",
  {
    one: {
      status: "keep",
      tags: ["manual"],
      note: "",
      updatedAt: exportedAt,
    },
  },
  exportedAt,
  "history-1",
);
const oldV1Payload = {
  schemaVersion: 1,
  exportedAt,
  source: "youtube-watchlater-triage",
  mode: "workspace-snapshot",
  workspace: {
    videos: [{
      videoId: "one",
      title: "Legacy video",
      channel: "Legacy channel",
      durationSeconds: 120,
    }],
    decisions: {
      one: {
        status: "keep",
        tags: ["manual"],
        note: "Preserve me",
        updatedAt: exportedAt,
      },
    },
    userRules: {
      legacy: {
        positive: ["alpha"],
        negative: ["beta"],
        channel: "Legacy channel",
      },
    },
    channelRules: [{
      id: "channel-rule-1",
      channel: "Legacy channel",
      mode: "default-keep",
      tag: "favorite",
      protected: true,
    }],
    savedViews: [{
      id: "saved-view-1",
      name: "Legacy keep",
      filters: { status: "keep" },
    }],
    lastImport: {
      fileName: "legacy.json",
      importedAt: exportedAt,
    },
    importComparison: {
      baselineAvailable: true,
      newIds: ["one"],
      removedVideos: [],
      decidedIds: ["one"],
      changedIds: [],
      changedFieldsById: {},
      orphanedDecisionIds: [],
    },
    history: [oldHistoryEntry],
    timeBudgetHours: 3.5,
    previewProgress: { one: 42 },
    ui: {
      status: "keep",
      channels: ["Legacy channel"],
      selectedIds: ["one"],
      currentId: "one",
    },
  },
};

const parsedOldV1 = workspace.parseWorkspacePayload(oldV1Payload);
assert.equal(parsedOldV1.videos[0].title, "Legacy video");
assert.equal(parsedOldV1.decisions.one.note, "Preserve me");
assert.equal(parsedOldV1.userRules.legacy.channel, "Legacy channel");
assert.equal(parsedOldV1.channelRules[0].protected, true);
assert.equal(parsedOldV1.savedViews[0].id, "saved-view-1");
assert.equal(parsedOldV1.lastImport.fileName, "legacy.json");
assert.equal(parsedOldV1.importComparison.baselineAvailable, true);
assert.equal(parsedOldV1.history[0].id, "history-1");
assert.equal(parsedOldV1.timeBudgetHours, 3.5);
assert.deepEqual(plain(parsedOldV1.previewProgress), { one: 42 });
assert.equal(parsedOldV1.ui.currentId, "one");
assert.deepEqual(plain(parsedOldV1.importHistory), []);
assert.deepEqual(plain(parsedOldV1.groupingOverrides), {
  schemaVersion: 1,
  aliases: [],
  merges: [],
  splits: [],
});

const snapshots = [
  importHistory.createImportSnapshot(
    [{
      videoId: "one",
      channel: "Legacy channel",
      channelUrl: "/@legacy",
      durationSeconds: 120,
    }],
    {
      fileName: "watchlater-1.json",
      importedAt: "2026-07-29T18:00:00.000Z",
      sourceExportedAt: "2026-07-29T17:55:00.000Z",
      sourceSchemaVersion: 1,
    },
  ),
  importHistory.createImportSnapshot(
    [
      {
        videoId: "one",
        channel: "Legacy channel",
        channelUrl: "/@legacy",
        durationSeconds: 120,
      },
      {
        videoId: "two",
        channel: "Legacy channel",
        channelUrl: "/@legacy",
        durationSeconds: null,
      },
    ],
    {
      fileName: "watchlater-2.json",
      importedAt: exportedAt,
      sourceExportedAt: "2026-07-30T17:55:00.000Z",
      sourceSchemaVersion: 1,
    },
  ),
];
const groupingOverrides = grouping.normalizeGroupingOverrides({
  aliases: [{
    id: "alias-1",
    channelKey: "url:@legacy",
    fromBases: ["old show"],
    to: "canonical show",
    createdAt: exportedAt,
  }],
});
const newPayload = workspace.buildWorkspacePayload({
  ...parsedOldV1,
  importHistory: snapshots,
  groupingOverrides,
}, exportedAt);

assert.equal(newPayload.schemaVersion, 1);
assert.equal(
  newPayload.workspace.extensions.channelInsights.schemaVersion,
  1,
);
assert.equal(
  newPayload.workspace.extensions.channelInsights.importHistory.length,
  2,
);
assert.equal(
  newPayload.workspace.extensions.channelInsights.groupingOverrides.aliases.length,
  1,
);
assert.equal(
  Object.hasOwn(newPayload.workspace, "importHistory"),
  false,
  "new history belongs only to the optional extension",
);

const roundTripped = workspace.parseWorkspacePayload(
  JSON.parse(JSON.stringify(newPayload)),
);
assert.deepEqual(
  plain(roundTripped.importHistory),
  plain(importHistory.normalizeImportHistory(snapshots)),
  "compact import history must survive a semantic JSON round-trip",
);
assert.deepEqual(
  plain(roundTripped.groupingOverrides),
  plain(groupingOverrides),
  "grouping corrections must share the same extension round-trip",
);
assert.equal(roundTripped.decisions.one.note, "Preserve me");
assert.equal(roundTripped.savedViews[0].id, "saved-view-1");
assert.equal(roundTripped.history[0].id, "history-1");
assert.deepEqual(plain(roundTripped.previewProgress), { one: 42 });

const invalidExtension = workspace.parseWorkspacePayload({
  schemaVersion: 1,
  mode: "workspace-snapshot",
  workspace: {
    videos: [],
    decisions: {},
    extensions: {
      channelInsights: {
        schemaVersion: 2,
        importHistory: snapshots,
        groupingOverrides,
      },
    },
  },
});
assert.deepEqual(plain(invalidExtension.importHistory), []);
assert.deepEqual(plain(invalidExtension.groupingOverrides), {
  schemaVersion: 1,
  aliases: [],
  merges: [],
  splits: [],
});

const malformedExtension = workspace.parseWorkspacePayload({
  schemaVersion: 1,
  mode: "workspace-snapshot",
  workspace: {
    videos: [],
    decisions: {},
    extensions: {
      channelInsights: {
        schemaVersion: 1,
        importHistory: { invalid: true },
        groupingOverrides: "invalid",
        futureField: { ignored: true },
      },
    },
  },
});
assert.deepEqual(plain(malformedExtension.importHistory), []);
assert.equal(malformedExtension.groupingOverrides.aliases.length, 0);

console.log("workspace extension test passed");
