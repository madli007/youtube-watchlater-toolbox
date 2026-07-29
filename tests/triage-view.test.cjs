const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadTriageApp } = require("./helpers/load-triage-app.cjs");

const projectRoot = path.resolve(__dirname, "..");
const sandbox = {};
vm.createContext(sandbox);
for (const relativePath of [
  "docs/assets/js/config.js",
  "docs/assets/js/domain/decisions.js",
  "docs/assets/js/domain/filters.js",
  "docs/assets/js/ui/triage-view.js",
]) {
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, relativePath), "utf8"),
    sandbox,
    { filename: relativePath },
  );
}

function createClassList() {
  const classes = new Set();
  return {
    toggle(name, force) {
      if (force) classes.add(name);
      else classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    },
  };
}

function createControl(value = "") {
  const attributes = new Map();
  const listeners = new Map();
  return {
    value,
    hidden: false,
    textContent: "",
    classList: createClassList(),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type) {
      listeners.get(type)?.();
    },
    setAttribute(name, attributeValue) {
      attributes.set(name, String(attributeValue));
    },
    getAttribute(name) {
      return attributes.get(name);
    },
  };
}

const els = Object.fromEntries([
  "searchInput",
  "statusFilter",
  "channelSearch",
  "tagModeSelect",
  "sortSelect",
  "minDurationInput",
  "maxDurationInput",
  "minAgeInput",
  "maxAgeInput",
  "minViewsInput",
  "availabilityFilter",
  "badgeFilter",
  "suggestedTagFilter",
  "noteFilter",
  "filtersToggle",
  "advancedFilterCount",
  "advancedFilterSummary",
  "advancedFilters",
].map(id => [id, createControl()]));
els.advancedFilters.hidden = true;

const state = {
  activeChannels: new Set(),
  activeTags: new Set(),
  datasetView: "all",
  importComparison: { baselineAvailable: true },
};
const {
  normalizeFilterState,
  getAdvancedFilterEntries,
} = sandbox.WatchLaterApp.domain.filters;
let renderedBadge = "all";
const triageView = sandbox.WatchLaterApp.ui.triageView.createTriageViewUi({
  state,
  els,
  normalizeFilterState,
  getAdvancedFilterEntries,
  renderBadgeOptions(value) {
    renderedBadge = value;
    els.badgeFilter.value = value;
  },
});

const {
  getKeyboardShortcutAction,
  isEditableShortcutTarget,
} = sandbox.WatchLaterApp.ui.triageView;
const shortcutAction = (key, options = {}, event = {}) => getKeyboardShortcutAction({
  key,
  target: { tagName: "BODY" },
  ...event,
}, {
  hasCurrent: true,
  ...options,
});

assert.equal(isEditableShortcutTarget({ tagName: "INPUT" }), true);
assert.equal(isEditableShortcutTarget({ tagName: "textarea" }), true);
assert.equal(isEditableShortcutTarget({ tagName: "DIV", isContentEditable: true }), true);
assert.equal(isEditableShortcutTarget({ tagName: "BUTTON" }), false);
assert.equal(shortcutAction("?"), "show-shortcuts");
assert.equal(shortcutAction("/"), "focus-search");
assert.equal(shortcutAction("x"), "toggle-selection");
assert.equal(shortcutAction("e"), "edit-video");
assert.equal(shortcutAction("o"), "open-video");
assert.equal(shortcutAction("r"), "status:unreviewed");
assert.equal(shortcutAction("k"), "status:keep");
assert.equal(shortcutAction("J"), "move:previous");
assert.equal(shortcutAction("ArrowDown"), "move:next");
assert.equal(shortcutAction("k", {}, { target: { tagName: "INPUT" } }), "");
assert.equal(shortcutAction("o", {}, { ctrlKey: true }), "");
assert.equal(shortcutAction("k", { openDialog: "other" }), "");
assert.equal(shortcutAction("Escape", { openDialog: "other" }), "close-dialog");
assert.equal(shortcutAction("k", { openDialog: "preview" }), "preview-status:keep");
assert.equal(shortcutAction("j", { openDialog: "preview" }), "preview-move:next");
assert.equal(shortcutAction("x", { hasCurrent: false }), "");

const expectedFilters = {
  search: "documentary",
  status: "maybe",
  channels: ["Channel A", "Channel B"],
  tags: ["dev", "manual"],
  tagMode: "and",
  sort: "duration-desc",
  datasetView: "changed",
  minDurationMinutes: 12,
  maxDurationMinutes: 90,
  minAgeDays: 30,
  maxAgeDays: 365,
  minViews: 1000,
  availability: "available",
  badge: "badge:New",
  suggestedTag: "yes",
  note: "no",
};
triageView.applyFilterStateToControls(expectedFilters);
assert.deepEqual(
  JSON.parse(JSON.stringify(triageView.captureFilterState())),
  JSON.parse(JSON.stringify(normalizeFilterState(expectedFilters))),
  "capture/apply must preserve the normalized FilterState",
);
assert.equal(renderedBadge, "badge:New");
assert.equal(els.advancedFilterCount.textContent, "10");
assert.equal(els.advancedFilterCount.hidden, false);
assert.match(els.advancedFilterSummary.textContent, /Tags: dev AND manual/);
assert.match(els.filtersToggle.getAttribute("aria-label"), /10 active/);

triageView.initializeTriageView();
assert.equal(els.advancedFilters.hidden, true);
assert.equal(els.filtersToggle.getAttribute("aria-expanded"), "false");
els.filtersToggle.dispatch("click");
assert.equal(els.advancedFilters.hidden, false);
assert.equal(els.filtersToggle.getAttribute("aria-expanded"), "true");
assert.equal(els.advancedFilterSummary.hidden, true);

triageView.setAdvancedFiltersOpen(false);
assert.equal(els.advancedFilterSummary.hidden, false);

triageView.applyFilterStateToControls({});
assert.equal(els.advancedFilterCount.hidden, true);
assert.equal(els.advancedFilterSummary.hidden, true);
assert.equal(els.filtersToggle.classList.contains("has-active-filters"), false);

const { html } = loadTriageApp();
assert.match(
  html,
  /id=["']filtersToggle["'][^>]*aria-expanded=["']false["'][^>]*aria-controls=["']advancedFilters["']/i,
);
assert.match(html, /id=["']advancedFilterCount["'][^>]*hidden/i);
assert.match(html, /id=["']advancedFilterSummary["'][^>]*hidden/i);
assert.match(
  html,
  /id=["']advancedFilters["'][^>]*aria-label=["']Advanced filters["'][^>]*hidden/i,
);
assert.match(
  html,
  /id=["']advancedFilters["'][\s\S]*id=["']tagFilter["'][\s\S]*id=["']savedViewSelect["'][\s\S]*<\/section>/i,
  "tags and saved views must remain available inside the advanced filter panel",
);
assert.match(
  html,
  /id=["']datasetViews["'][\s\S]*data-dataset-view=["']all["'][\s\S]*data-dataset-view=["']decided["']/i,
  "all import views must remain in the compact second row",
);
assert.match(
  html,
  /id=["']shortcutHelpButton["'][^>]*aria-keyshortcuts=["']\?["']/i,
  "the visible shortcut button must advertise the ? shortcut",
);
assert.match(
  html,
  /id=["']shortcutHelpDialog["'][^>]*aria-labelledby=["']shortcutHelpTitle["'][\s\S]*<kbd>\?<\/kbd>/i,
  "the shortcut cheat sheet must be an accessible dialog",
);

console.log("triage view test passed");
