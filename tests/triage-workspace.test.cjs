const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, "triage script not found");

const source = scriptMatch[1].replace(
  "    init();",
  "    globalThis.testApi = { buildWorkspacePayload, parseWorkspacePayload, createHistoryEntry, applyHistoryEntry, normalizeHistory, compareVideoDatasets, createDatasetBaseline, normalizeImportComparison };",
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
  userRules: { custom: ["alpha", "alpha", "beta"], invalid: "nope" },
  savedViews: [{ name: "Keep" }],
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
  ui: { status: "keep", datasetView: "inbox", selectedIds: ["one"] },
}, exportedAt);

assert.equal(workspace.mode, "workspace-snapshot");
assert.equal(workspace.schemaVersion, 1);
assert.equal(workspace.exportedAt, exportedAt);
assert.equal(workspace.workspace.videos.length, 1);
assert.equal(Object.keys(workspace.workspace.decisions).length, 1);
assert.deepEqual([...workspace.workspace.decisions.one.tags], ["manual"]);
assert.deepEqual([...workspace.workspace.userRules.custom], ["alpha", "beta"]);
assert.equal(workspace.workspace.userRules.invalid, undefined);
assert.equal(workspace.workspace.importComparison.baselineAvailable, true);
assert.deepEqual([...workspace.workspace.importComparison.newIds], ["one"]);

const parsed = sandbox.testApi.parseWorkspacePayload(workspace);
assert.equal(parsed.videos[0].videoId, "one");
assert.equal(parsed.decisions.one.status, "keep");
assert.equal(parsed.ui.status, "keep");
assert.equal(parsed.ui.datasetView, "inbox");
assert.equal(parsed.importComparison.removedVideos[0].videoId, "gone");
assert.deepEqual([...parsed.ui.selectedIds], ["one"]);
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

console.log("triage workspace test passed");
