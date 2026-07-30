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
  "docs/assets/js/storage.js",
  "docs/assets/js/browser-io.js",
  "docs/assets/js/state.js",
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
  config,
  domain,
  storage: storageModule,
  browserIo,
  state: stateModule,
} = sandbox.WatchLaterApp;
const plain = value => JSON.parse(JSON.stringify(value));

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

async function main() {
  const exportedAt = "2026-07-28T12:00:00.000Z";
  const memory = createMemoryStorage({
    [config.STORAGE_KEY]: JSON.stringify({
      one: { status: "keep", tags: ["manual"], note: "", updatedAt: exportedAt },
    }),
    [config.HISTORY_STORAGE_KEY]: JSON.stringify([
      domain.decisions.createHistoryEntry(
        "Before edit",
        "bulk-status",
        { one: null },
        exportedAt,
        "history-1",
      ),
    ]),
    [config.USER_RULES_STORAGE_KEY]: JSON.stringify({
      legacy: ["alpha", "beta"],
    }),
    [config.CHANNEL_RULES_STORAGE_KEY]: JSON.stringify([
      { channel: "Channel A", mode: "default-keep", protected: true },
    ]),
    [config.SAVED_VIEWS_STORAGE_KEY]: JSON.stringify([
      { name: "Legacy view", filters: { channel: "Channel A", tag: "manual" } },
    ]),
    [config.DATASET_BASELINE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      savedAt: exportedAt,
      lastImport: { fileName: "watchlater.json" },
      videos: [
        { videoId: "one", title: "Video", views: "volatile" },
        { title: "Missing ID" },
      ],
    }),
    [config.TIME_BUDGET_STORAGE_KEY]: "2.6",
    [config.INSIGHTS_SETTINGS_STORAGE_KEY]: JSON.stringify({
      decisionStaleDays: 90,
    }),
    [config.PREVIEW_PROGRESS_STORAGE_KEY]: JSON.stringify({
      one: 83.9,
      invalid: -1,
    }),
    [config.GROUPING_OVERRIDES_STORAGE_KEY]: JSON.stringify({
      aliases: [{
        id: "alias-1",
        channelKey: "url:@channel-a",
        fromBases: ["old show"],
        to: "canonical show",
        createdAt: exportedAt,
      }],
    }),
  });
  const persistence = storageModule.createStorage(memory);
  const state = stateModule.createInitialState(persistence);

  assert.equal(state.decisions.one.status, "keep");
  assert.equal(state.history.length, 1);
  assert.deepEqual([...state.userRules.legacy.positive], ["alpha", "beta"]);
  assert.equal(state.channelRules[0].channel, "Channel A");
  assert.deepEqual([...state.savedViews[0].filters.channels], ["Channel A"]);
  assert.deepEqual([...state.savedViews[0].filters.tags], ["manual"]);
  assert.equal(state.datasetBaseline.videos.length, 1);
  assert.equal(state.datasetBaseline.videos[0].views, undefined);
  assert.equal(state.timeBudgetHours, 2.5);
  assert.deepEqual(plain(state.insightsSettings), { decisionStaleDays: 90 });
  assert.deepEqual(plain(state.previewProgress), { one: 83 });
  assert.equal(state.groupingOverrides.aliases[0].id, "alias-1");
  assert.equal(state.groupingOverrideRevision, 0);
  assert.deepEqual([...state.selectedGroupIds], []);
  assert.deepEqual([...state.selectedGroupMemberIds], []);
  assert.deepEqual([...state.selectedIds], []);
  assert.deepEqual([...state.activeTags], []);
  assert.equal(state.activeView, "triage");
  assert.equal(state.datasetRevision, 0);
  assert.equal(state.decisionRevision, 0);
  assert.equal(state.insightsMeasure, "count");
  assert.equal(state.insightsSort, "backlog");
  assert.equal(state.selectedChannelKey, "");
  assert.equal(state.insightsCache.datasetRevision, -1);
  assert.equal(state.insightsCache.decisionRevision, -1);
  assert.deepEqual(plain(state.insightsCache.videoFacts), []);
  assert.equal(state.insightsCache.model.videoCount, 0);
  assert.equal(state.groupingCache.datasetRevision, -1);
  assert.equal(state.groupingCache.overrideRevision, -1);
  assert.deepEqual(plain(state.groupingCache.groups), []);
  assert.equal(state.groupingCache.diagnostics, null);

  state.decisions.two = {
    status: "maybe",
    tags: [],
    note: "Later",
    updatedAt: exportedAt,
  };
  assert.equal(persistence.saveDecisions(state.decisions), true);
  assert.equal(persistence.saveHistory(state.history), true);
  assert.equal(
    persistence.saveInsightsSettings({ decisionStaleDays: "off" }),
    true,
  );
  assert.equal(persistence.savePreviewProgress({ two: 42.8 }), true);
  assert.equal(persistence.saveGroupingOverrides({
    merges: [{
      id: "merge-1",
      channelKey: "url:@channel-a",
      memberIds: ["one", "two"],
    }],
  }), true);
  const refreshed = stateModule.createInitialState(storageModule.createStorage(memory));
  assert.equal(refreshed.decisions.two.status, "maybe");
  assert.equal(refreshed.history[0].id, "history-1");
  assert.deepEqual(plain(refreshed.insightsSettings), {
    decisionStaleDays: "off",
  });
  assert.deepEqual(plain(refreshed.previewProgress), { two: 42 });
  assert.equal(refreshed.groupingOverrides.merges[0].id, "merge-1");

  const stored = memory.snapshot();
  assert.ok(Object.hasOwn(stored, "watchlater-triage-decisions-v1"));
  assert.ok(Object.hasOwn(stored, "watchlater-triage-history-v1"));
  assert.ok(Object.hasOwn(stored, "watchlater-triage-preview-progress-v1"));
  assert.ok(Object.hasOwn(stored, "watchlater-triage-insights-settings-v1"));
  assert.ok(Object.hasOwn(stored, "watchlater-triage-grouping-overrides-v1"));

  const corrupt = storageModule.createStorage(createMemoryStorage({
    [config.STORAGE_KEY]: "{broken",
    [config.HISTORY_STORAGE_KEY]: "null",
    [config.DATASET_BASELINE_STORAGE_KEY]: JSON.stringify({ schemaVersion: 2, videos: [] }),
    [config.INSIGHTS_SETTINGS_STORAGE_KEY]: JSON.stringify({
      decisionStaleDays: "invalid",
    }),
    [config.PREVIEW_PROGRESS_STORAGE_KEY]: "[]",
  }));
  const emptyState = stateModule.createInitialState(corrupt);
  assert.deepEqual(plain(emptyState.decisions), {});
  assert.deepEqual(plain(emptyState.history), []);
  assert.equal(emptyState.datasetBaseline, null);
  assert.deepEqual(plain(emptyState.insightsSettings), {
    decisionStaleDays: 180,
  });
  assert.deepEqual(plain(emptyState.previewProgress), {});
  assert.deepEqual(plain(emptyState.groupingOverrides), {
    schemaVersion: 1,
    aliases: [],
    merges: [],
    splits: [],
  });

  const unavailable = storageModule.createStorage({
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("quota");
    },
  });
  assert.deepEqual(plain(unavailable.loadDecisions()), {});
  assert.deepEqual(plain(unavailable.loadHistory()), []);
  assert.equal(unavailable.saveDecisions({ one: { status: "keep" } }), false);
  assert.equal(unavailable.saveHistory([]), false);
  assert.equal(
    unavailable.saveInsightsSettings({ decisionStaleDays: 30 }),
    false,
  );
  assert.equal(unavailable.savePreviewProgress({ one: 10 }), false);
  assert.equal(unavailable.saveGroupingOverrides({}), false);

  const workspacePayload = domain.workspace.buildWorkspacePayload({
    videos: [{ videoId: "one", title: "Video" }],
    decisions: state.decisions,
    userRules: state.userRules,
    channelRules: state.channelRules,
    savedViews: state.savedViews,
    history: state.history,
    timeBudgetHours: state.timeBudgetHours,
    previewProgress: state.previewProgress,
    groupingOverrides: state.groupingOverrides,
    ui: { status: "keep", selectedIds: ["one"] },
  }, exportedAt);
  const workspaceRoundTrip = domain.workspace.parseWorkspacePayload(
    browserIo.parseJsonText(browserIo.serializeJson(workspacePayload)),
  );
  assert.equal(workspaceRoundTrip.decisions.two.status, "maybe");
  assert.equal(workspaceRoundTrip.history[0].id, "history-1");
  assert.equal(workspaceRoundTrip.timeBudgetHours, 2.5);
  assert.deepEqual(plain(workspaceRoundTrip.previewProgress), { one: 83 });
  assert.equal(workspaceRoundTrip.groupingOverrides.aliases[0].id, "alias-1");

  assert.equal(await browserIo.readFileText({
    text: async () => "{\"videos\":[]}",
  }), "{\"videos\":[]}");

  class FileReaderStub {
    constructor() {
      this.listeners = {};
      this.result = "";
    }
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }
    readAsText(file) {
      this.result = file.contents;
      this.listeners.load();
    }
  }
  assert.equal(
    await browserIo.readFileText({ contents: "legacy reader" }, FileReaderStub),
    "legacy reader",
  );

  const download = {
    appended: false,
    clicked: false,
    removed: false,
    revoked: "",
    blob: null,
  };
  class BlobStub {
    constructor(parts, options) {
      download.blob = { parts, options };
    }
  }
  const link = {
    click() {
      download.clicked = true;
    },
    remove() {
      download.removed = true;
    },
  };
  browserIo.downloadTextFile("workspace.json", "{}", {
    document: {
      body: {
        appendChild(node) {
          assert.equal(node, link);
          download.appended = true;
        },
      },
      createElement(tagName) {
        assert.equal(tagName, "a");
        return link;
      },
    },
    Blob: BlobStub,
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL(url) {
        download.revoked = url;
      },
    },
    setTimeout(callback) {
      callback();
    },
  });
  assert.equal(link.download, "workspace.json");
  assert.equal(link.href, "blob:test");
  assert.deepEqual([...download.blob.parts], ["{}"]);
  assert.equal(download.blob.options.type, "application/json;charset=utf-8");
  assert.deepEqual(download, {
    appended: true,
    clicked: true,
    removed: true,
    revoked: "blob:test",
    blob: download.blob,
  });

  console.log("state and storage test passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
