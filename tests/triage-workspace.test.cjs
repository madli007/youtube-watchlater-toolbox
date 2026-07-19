const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, "triage script not found");

const source = scriptMatch[1].replace(
  "    init();",
  "    globalThis.testApi = { buildWorkspacePayload, parseWorkspacePayload, createHistoryEntry, applyHistoryEntry, normalizeHistory };",
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
  history: [],
  ui: { status: "keep", selectedIds: ["one"] },
}, exportedAt);

assert.equal(workspace.mode, "workspace-snapshot");
assert.equal(workspace.schemaVersion, 1);
assert.equal(workspace.exportedAt, exportedAt);
assert.equal(workspace.workspace.videos.length, 1);
assert.equal(Object.keys(workspace.workspace.decisions).length, 1);
assert.deepEqual([...workspace.workspace.decisions.one.tags], ["manual"]);
assert.deepEqual([...workspace.workspace.userRules.custom], ["alpha", "beta"]);
assert.equal(workspace.workspace.userRules.invalid, undefined);

const parsed = sandbox.testApi.parseWorkspacePayload(workspace);
assert.equal(parsed.videos[0].videoId, "one");
assert.equal(parsed.decisions.one.status, "keep");
assert.equal(parsed.ui.status, "keep");
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

console.log("triage workspace test passed");
