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
const {
  buildTimeBudgetSummary,
  formatDuration,
} = sandbox.WatchLaterApp.domain.timeBudget;
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
  const attributes = new Map();
  const classes = new Set();
  return {
    hidden: false,
    textContent: "",
    value: "",
    dataset: {},
    children: [],
    listeners: {},
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = String(value);
      },
    },
    classList: {
      add(name) {
        classes.add(name);
      },
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    querySelectorAll(selector) {
      if (selector === "[data-insights-measure]") {
        return this.children.filter(child => child.dataset.insightsMeasure);
      }
      return [];
    },
    closest(selector) {
      if (selector === "[data-insights-measure]" && this.dataset.insightsMeasure) {
        return this;
      }
      if (selector === "[data-channel-key]" && this.dataset.channelKey) {
        return this;
      }
      return null;
    },
  };
}

const elementNames = [
  "insightsImportContext",
  "insightsSummary",
  "insightsEmptyState",
  "insightsChannelCount",
  "insightsVideoCount",
  "insightsWatchTime",
  "insightsWatchTimeHint",
  "insightsUndecidedCount",
  "insightsOldestAge",
  "insightsOldestHint",
  "insightsCoverageValue",
  "insightsCoverageHint",
  "insightsMatrix",
  "insightsSearch",
  "insightsMeasureGroup",
  "insightsSort",
  "insightsScale",
  "insightsSelectedChannel",
  "insightsMatrixStatus",
  "insightsMatrixCaption",
  "insightsMatrixBody",
  "insightsShowAll",
  "insightsWorkspace",
  "insightsChannelDetail",
  "insightsDetailTitle",
  "insightsDetailMeta",
  "insightsViewVideos",
  "insightsDetailBacklog",
  "insightsDetailDecision",
  "insightsStaleDays",
  "insightsDetailAge",
  "insightsDetailOldest",
  "insightsDetailNew",
  "insightsDetailPersistence",
  "insightsTimeDashboard",
  "insightsTimeScope",
  "insightsTimeScopeHint",
  "insightsTimeBudgetHours",
  "insightsTimeTotal",
  "insightsTimeProtected",
  "insightsTimeWeeks",
  "insightsTimeReviewed",
  "insightsTimeCoverage",
  "insightsTimeByStatus",
  "insightsTimeByChannel",
  "insightsTimeByTag",
  "insightsTimeShortlistSummary",
  "insightsTimeShortlistItems",
  "insightsOpenShortlist",
];
const els = Object.fromEntries(elementNames.map(name => [name, createElement()]));
const countMeasureButton = createElement();
countMeasureButton.dataset.insightsMeasure = "count";
const watchTimeMeasureButton = createElement();
watchTimeMeasureButton.dataset.insightsMeasure = "watch-time";
els.insightsMeasureGroup.append(countMeasureButton, watchTimeMeasureButton);
els.insightsScale.value = "global";
const state = {
  lastImport: null,
  datasetRevision: 0,
  decisionRevision: 0,
  insightsMeasure: "count",
  insightsSort: "backlog",
  selectedChannelKey: "",
  insightsSettings: { decisionStaleDays: 180 },
  insightsCache: { videoFacts: [] },
  importComparison: { baselineAvailable: false },
  videos: [],
  decisions: {},
  timeBudgetHours: 1,
};
let model = insights.createEmptyInsightsModel();
let savedInsightsSettings = null;
let savedTimeBudgetHours = null;
let triageNavigation = null;
const view = createInsightsViewUi({
  state,
  els,
  getInsightsModel() {
    return model;
  },
  formatDuration,
  buildTimeBudgetSummary,
  saveTimeBudgetHours(value) {
    savedTimeBudgetHours = value;
    return true;
  },
  saveInsightsSettings(value) {
    savedInsightsSettings = value;
    return true;
  },
  navigateToInsightsChannel(channelKey) {
    state.selectedChannelKey = channelKey;
    view.renderInsights();
  },
  navigateToTriageFromInsights(options) {
    triageNavigation = options;
  },
  now: () => new Date("2026-07-01T12:00:00.000Z").getTime(),
  document: {
    createElement,
  },
});

view.initializeInsightsView();
view.renderInsights();
assert.equal(els.insightsSummary.hidden, true);
assert.equal(els.insightsEmptyState.hidden, false);
assert.equal(els.insightsMatrix.hidden, true);
assert.equal(countMeasureButton.getAttribute("aria-pressed"), "true");

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
state.insightsCache.videoFacts = unknownFacts;
state.videos = [
  {
    videoId: "unknown-one",
    channel: "Unknowns",
    durationSeconds: null,
  },
  {
    videoId: "unknown-two",
    channel: "Unknowns",
    durationSeconds: -1,
  },
];
state.datasetRevision++;
view.renderInsights();
assert.equal(els.insightsEmptyState.hidden, true);
assert.equal(els.insightsMatrix.hidden, false);
assert.equal(els.insightsChannelCount.textContent, "1");
assert.equal(els.insightsVideoCount.textContent, "2");
assert.equal(els.insightsWatchTime.textContent, "Unknown");
assert.equal(els.insightsWatchTimeHint.textContent, "0 of 2 durations known");
assert.equal(els.insightsUndecidedCount.textContent, "2");
assert.equal(els.insightsMatrixBody.children.length, 1);
assert.equal(els.insightsMatrixBody.children[0].children.length, 10);
assert.match(els.insightsMatrixStatus.textContent, /^Showing all 1 channels/);
assert.match(els.insightsMatrixCaption.textContent, /^Video count by channel/);

els.insightsMeasureGroup.listeners.click({
  target: watchTimeMeasureButton,
});
assert.equal(state.insightsMeasure, "watch-time");
assert.equal(watchTimeMeasureButton.getAttribute("aria-pressed"), "true");
assert.match(els.insightsMatrixCaption.textContent, /^Known watch time/);
const firstAgeCell = els.insightsMatrixBody.children[0].children[1];
assert.equal(firstAgeCell.children[0].children[0].textContent, "\u2014");
assert.equal(firstAgeCell.children[0].dataset.ageBucket, "0-7d");
assert.match(firstAgeCell.children[0].getAttribute("aria-label"), /^View 0 to 7 days videos/);
els.insightsMatrixBody.listeners.click({ target: firstAgeCell.children[0] });
assert.deepEqual(JSON.parse(JSON.stringify(triageNavigation)), {
  channelKey: "name:unknowns",
  channelName: "Unknowns",
  ageBucket: "0-7d",
});

const channelButton = els.insightsMatrixBody.children[0].children[0].children[0];
els.insightsMatrixBody.listeners.click({ target: channelButton });
assert.equal(state.selectedChannelKey, "name:unknowns");
assert.match(els.insightsSelectedChannel.textContent, /^Selected: Unknowns/);
assert.equal(els.insightsChannelDetail.hidden, false);
assert.equal(els.insightsWorkspace.classList.contains("has-detail"), true);
assert.equal(els.insightsDetailTitle.textContent, "Unknowns");
assert.equal(els.insightsViewVideos.title, "View Unknowns videos in Triage");
els.insightsViewVideos.listeners.click();
assert.deepEqual(JSON.parse(JSON.stringify(triageNavigation)), {
  channelKey: "name:unknowns",
});
assert.match(
  els.insightsDetailBacklog.getAttribute("aria-label"),
  /^Unknowns has 100% of backlog videos/,
);
assert.match(
  els.insightsDetailDecision.getAttribute("aria-label"),
  /^0 of 2 videos explicitly decided/,
);
assert.equal(els.insightsStaleDays.value, "180");
assert.match(
  els.insightsDetailOldest.getAttribute("aria-label"),
  /^2 untouched videos; 2 have unknown age/,
);
assert.equal(
  els.insightsDetailNew.getAttribute("aria-label"),
  "New-since-last-import comparison unavailable",
);
assert.equal(els.insightsOldestAge.textContent, "Unknown");
assert.equal(els.insightsTimeDashboard.hidden, false);
assert.equal(els.insightsTimeTotal.textContent, "0m");
assert.match(els.insightsTimeCoverage.textContent, /2 unknown/);
assert.equal(els.insightsCoverageValue.textContent, "0% time · 0% age");

els.insightsStaleDays.value = "off";
els.insightsStaleDays.listeners.change();
assert.deepEqual(JSON.parse(JSON.stringify(savedInsightsSettings)), {
  decisionStaleDays: "off",
});
assert.equal(state.insightsSettings.decisionStaleDays, "off");

els.insightsWatchTime.textContent = "dataset KPI sentinel";
state.insightsCache.videoFacts = insights.refreshVideoFactDecisions(unknownFacts, {
  "unknown-one": {
    status: "keep",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
});
model = insights.buildChannelInsights(state.insightsCache.videoFacts);
state.decisionRevision++;
view.renderInsights();
assert.equal(
  els.insightsWatchTime.textContent,
  "dataset KPI sentinel",
  "a decision-only revision must not rewrite dataset-dependent KPIs",
);
assert.equal(els.insightsUndecidedCount.textContent, "1");
assert.match(
  els.insightsDetailDecision.getAttribute("aria-label"),
  /^1 of 2 videos explicitly decided/,
);

state.videos = [
  {
    videoId: "alpha-short",
    title: "Alpha short",
    channel: "Alpha",
    durationSeconds: 900,
  },
  {
    videoId: "alpha-long",
    title: "Alpha long",
    channel: "Alpha",
    durationSeconds: 3600,
  },
  {
    videoId: "beta",
    title: "Beta",
    channel: "Beta",
    durationSeconds: 1800,
  },
];
state.decisions = {
  "alpha-short": { status: "keep" },
  "alpha-long": { status: "delete" },
  beta: { status: "maybe" },
};
state.insightsCache.videoFacts = insights.deriveVideoFacts(
  state.videos,
  state.decisions,
  { sourceExportedAt: "2026-07-01T12:00:00.000Z" },
);
model = insights.buildChannelInsights(state.insightsCache.videoFacts);
state.selectedChannelKey = "name:alpha";
state.datasetRevision++;
state.decisionRevision++;
view.renderInsights();
assert.equal(els.insightsTimeTotal.textContent, "1h 45m");
assert.equal(els.insightsTimeProtected.textContent, "45m");
assert.equal(
  els.insightsTimeShortlistSummary.textContent.startsWith("2 available"),
  true,
);

els.insightsTimeScope.checked = true;
els.insightsTimeScope.listeners.change();
assert.match(els.insightsTimeScopeHint.textContent, /2 videos from Alpha/);
assert.equal(els.insightsTimeTotal.textContent, "1h 15m");
assert.equal(
  els.insightsTimeShortlistSummary.textContent.startsWith("1 available"),
  true,
);

els.insightsTimeBudgetHours.value = "0.5";
els.insightsTimeBudgetHours.listeners.change();
assert.equal(savedTimeBudgetHours, 0.5);
assert.equal(state.timeBudgetHours, 0.5);
els.insightsOpenShortlist.listeners.click();
assert.deepEqual(JSON.parse(JSON.stringify(triageNavigation)), {
  videoIds: ["alpha-short"],
});

model = insights.createEmptyInsightsModel();
state.insightsCache.videoFacts = [];
state.videos = [];
state.datasetRevision++;
view.renderInsights();
assert.equal(state.selectedChannelKey, "");
assert.equal(els.insightsChannelDetail.hidden, true);
assert.equal(els.insightsWorkspace.classList.contains("has-detail"), false);

const html = loadTriageApp().html;
assert.match(html, /id=["']insightsSummary["'][^>]*aria-label=["']Channel insight summary["']/i);
assert.match(html, /id=["']insightsUndecidedCount["']/i);
assert.match(html, /id=["']insightsMatrix["'][^>]*aria-labelledby=["']insightsMatrixTitle["']/i);
assert.match(html, /<table class=["']insights-table["']>/i);
assert.match(html, /id=["']insightsShowAll["']/i);
assert.match(html, /id=["']insightsChannelDetail["'][^>]*aria-labelledby=["']insightsDetailTitle["']/i);
assert.match(html, /id=["']insightsViewVideos["'][^>]*>View videos</i);
assert.match(html, /id=["']insightsStaleDays["']/i);
assert.match(html, /id=["']insightsDetailPersistence["']/i);
assert.match(
  html,
  /id=["']insightsTimeDashboard["'][^>]*aria-labelledby=["']insightsTimeTitle["']/i,
);
assert.match(
  html,
  /id=["']insightsOpenShortlist["'][^>]*>Open shortlist in Triage</i,
);
assert.doesNotMatch(
  html,
  /sortable channel and age breakdown arrives in the next slice/i,
  "the Insights route must no longer render the matrix placeholder",
);

console.log("channel insights view test passed");
