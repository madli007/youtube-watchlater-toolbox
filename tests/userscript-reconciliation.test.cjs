const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const userscriptPath = path.join(__dirname, "..", "youtube-watchlater-toolbox.user.js");
let source = fs.readFileSync(userscriptPath, "utf8");
const initializationStart = source.lastIndexOf("  if (document.readyState");

assert.notEqual(initializationStart, -1, "userscript initialization block not found");
source = `${source.slice(0, initializationStart)}  globalThis.testApi = { buildReconciliationReport, parseReconciliationPayload, parseExecutionReportPayload };\n})();\n`;

const sandbox = {
  window: {
    localStorage: {
      getItem() {
        return null;
      },
    },
  },
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const run = {
  runId: "run-1",
  mode: "delete-explicit",
  status: "completed",
  startedAt: "2026-07-19T10:00:00.000Z",
  finishedAt: "2026-07-19T10:05:00.000Z",
  planExportedAt: "2026-07-19T09:59:00.000Z",
  targetVideoIds: ["removed", "still-present"],
  targets: [
    { videoId: "removed", title: "Removed target" },
    { videoId: "still-present", title: "Remaining target" },
  ],
  protectedVideoIds: ["protected-present", "protected-missing"],
  protectedVideos: [
    { videoId: "protected-present", title: "Protected present" },
    { videoId: "protected-missing", title: "Protected missing" },
  ],
  successes: [
    { videoId: "removed", removedAt: "2026-07-19T10:01:00.000Z" },
    { videoId: "still-present", removedAt: "2026-07-19T10:02:00.000Z" },
  ],
  failures: [],
  skipped: [],
};
const currentVideos = [
  { videoId: "still-present", title: "Remaining target" },
  { videoId: "protected-present", title: "Protected present" },
];

const report = sandbox.testApi.buildReconciliationReport(run, currentVideos);

assert.equal(report.summary.confirmedRemoved, 1);
assert.equal(report.confirmedRemoved[0].videoId, "removed");
assert.equal(report.summary.remainingCandidates, 1);
assert.equal(report.remainingCandidates[0].videoId, "still-present");
assert.deepEqual([...report.retryVideoIds], ["still-present"]);
assert.equal(report.summary.protectedPresent, 1);
assert.equal(report.summary.missingProtected, 1);
assert.equal(report.missingProtected[0].videoId, "protected-missing");

const parsedRetry = sandbox.testApi.parseReconciliationPayload(report);

assert.equal(parsedRetry.mode, "retry-failures");
assert.deepEqual([...parsedRetry.scopedIds], ["still-present"]);
assert.equal(parsedRetry.scopedStatuses.get("still-present"), "delete");
assert.deepEqual([...parsedRetry.keepIds], ["protected-present"]);

const parsedExecutionRetry = sandbox.testApi.parseExecutionReportPayload({
  mode: "delete-execution-report",
  runId: "run-1",
  failures: [{ videoId: "failed" }],
  protectedVideoIds: ["protected-present"],
});

assert.deepEqual([...parsedExecutionRetry.scopedIds], ["failed"]);
assert.deepEqual([...parsedExecutionRetry.keepIds], ["protected-present"]);

const oldRunReport = sandbox.testApi.buildReconciliationReport({
  ...run,
  protectedVideoIds: undefined,
  protectedVideos: undefined,
}, currentVideos);

assert.equal(oldRunReport.protectedCheckAvailable, false);
assert.equal(oldRunReport.summary.protectedExpected, 0);

console.log("userscript reconciliation test passed");
