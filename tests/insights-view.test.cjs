const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadTriageApp } = require("./helpers/load-triage-app.cjs");

const projectRoot = path.resolve(__dirname, "..");
const modulePaths = [
  "docs/assets/js/config.js",
  "docs/assets/js/domain/decisions.js",
  "docs/assets/js/domain/filters.js",
  "docs/assets/js/domain/insights.js",
  "docs/assets/js/domain/time-budget.js",
  "docs/assets/js/ui/insights-view.js",
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

const { insights } = sandbox.WatchLaterApp.domain;
const { formatDuration } = sandbox.WatchLaterApp.domain.timeBudget;
const {
  formatApproximateAge,
  getImportContext,
  createInsightsViewUi,
} = sandbox.WatchLaterApp.ui.insightsView;

assert.equal(formatApproximateAge(null), "Unknown");
assert.equal(formatApproximateAge(10), "≈ 10d");
assert.equal(formatApproximateAge(183), "≈ 6mo");
assert.equal(formatApproximateAge(730), "≈ 2.0y");
assert.match(
  getImportContext({
    fileName: "watchlater.json",
    sourceExportedAt: "2026-07-01T12:00:00.000Z",
  }),
  /^watchlater\.json · exported /,
);

function createElement() {
  return {
    hidden: false,
    textContent: "",
  };
}

const elementNames = [
  "insightsImportContext",
  "insightsSummary",
  "insightsEmptyState",
  "insightsNextStep",
  "insightsChannelCount",
  "insightsVideoCount",
  "insightsWatchTime",
  "insightsWatchTimeHint",
  "insightsUndecidedCount",
  "insightsOldestAge",
  "insightsOldestHint",
  "insightsCoverageValue",
  "insightsCoverageHint",
];
const els = Object.fromEntries(elementNames.map(name => [name, createElement()]));
const state = {
  lastImport: null,
  datasetRevision: 0,
  decisionRevision: 0,
};
let model = insights.createEmptyInsightsModel();
const view = createInsightsViewUi({
  state,
  els,
  getInsightsModel() {
    return model;
  },
  formatDuration,
});

view.renderInsights();
assert.equal(els.insightsSummary.hidden, true);
assert.equal(els.insightsEmptyState.hidden, false);
assert.equal(els.insightsNextStep.hidden, true);

state.lastImport = {
  fileName: "empty.json",
  importedAt: "2026-07-02T12:00:00.000Z",
};
state.datasetRevision++;
view.renderInsights();
assert.equal(els.insightsSummary.hidden, false, "an imported empty dataset has known zero counts");
assert.equal(els.insightsVideoCount.textContent, "0");
assert.equal(els.insightsWatchTime.textContent, "—");
assert.equal(els.insightsWatchTimeHint.textContent, "No videos in this import");

const unknownFacts = insights.deriveVideoFacts([
  {
    videoId: "unknown-one",
    channel: "Unknowns",
    durationSeconds: null,
    uploaded: "",
  },
  {
    videoId: "unknown-two",
    channel: "Unknowns",
    durationSeconds: -1,
    uploaded: "not available",
  },
], {}, { sourceExportedAt: "2026-07-01T12:00:00.000Z" });
model = insights.buildChannelInsights(unknownFacts);
state.datasetRevision++;
view.renderInsights();
assert.equal(els.insightsEmptyState.hidden, true);
assert.equal(els.insightsNextStep.hidden, false);
assert.equal(els.insightsChannelCount.textContent, "1");
assert.equal(els.insightsVideoCount.textContent, "2");
assert.equal(els.insightsWatchTime.textContent, "Unknown");
assert.equal(els.insightsWatchTimeHint.textContent, "0 of 2 durations known");
assert.equal(els.insightsUndecidedCount.textContent, "2");
assert.equal(els.insightsOldestAge.textContent, "Unknown");
assert.equal(els.insightsCoverageValue.textContent, "0% time · 0% age");

els.insightsWatchTime.textContent = "dataset KPI sentinel";
model = insights.buildChannelInsights(
  insights.refreshVideoFactDecisions(unknownFacts, {
    "unknown-one": { status: "keep" },
  }),
);
state.decisionRevision++;
view.renderInsights();
assert.equal(
  els.insightsWatchTime.textContent,
  "dataset KPI sentinel",
  "a decision-only revision must not rewrite dataset-dependent KPIs",
);
assert.equal(els.insightsUndecidedCount.textContent, "1");

const html = loadTriageApp().html;
assert.match(html, /id=["']insightsSummary["'][^>]*aria-label=["']Channel insight summary["']/i);
assert.match(html, /id=["']insightsUndecidedCount["']/i);
assert.doesNotMatch(
  html,
  /id=["']insightsView["'][\s\S]{0,200}Coming in Phase 2/i,
  "the Insights route must no longer render the Phase 2 placeholder",
);

console.log("channel insights view test passed");
