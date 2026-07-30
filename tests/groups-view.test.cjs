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
  "docs/assets/js/domain/import-comparison.js",
  "docs/assets/js/domain/filters.js",
  "docs/assets/js/domain/insights.js",
  "docs/assets/js/domain/grouping.js",
  "docs/assets/js/ui/groups-view.js",
]) {
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, relativePath), "utf8"),
    sandbox,
    { filename: relativePath },
  );
}

const { grouping } = sandbox.WatchLaterApp.domain;
const {
  filterVideoGroups,
  formatSequence,
  createGroupsViewUi,
} = sandbox.WatchLaterApp.ui.groupsView;

const videos = [
  {
    videoId: "series-1",
    title: "The Last of Us S01E01 Reaction",
    channel: "Reactors",
    url: "https://youtube.test/series-1",
    index: 1,
  },
  {
    videoId: "series-2",
    title: "The Last of Us Episode 2 Reaction",
    channel: "Reactors",
    url: "https://youtube.test/series-2",
    index: 2,
  },
  {
    videoId: "duplicate-1",
    title: "A shared documentary",
    channel: "Channel A",
    index: 3,
  },
  {
    videoId: "duplicate-2",
    title: "A shared documentary",
    channel: "Channel B",
    index: 4,
  },
  {
    videoId: "similar-1",
    title: "Build a compact JavaScript dashboard",
    channel: "Code Lab",
    index: 5,
  },
  {
    videoId: "similar-2",
    title: "Build a compact JavaScript dashboard tutorial",
    channel: "Code Lab",
    index: 6,
  },
];

const seriesParsed = videos.slice(0, 2).map(grouping.parseSeriesTitle);
const groups = [
  {
    id: "series-tlou",
    type: "series",
    label: "The last of us",
    confidence: 0.94,
    reviewRequired: false,
    reasons: ["same normalized channel", "exact canonical base"],
    members: videos.slice(0, 2),
    parsedMembers: seriesParsed,
  },
  {
    id: "duplicate-documentary",
    type: "duplicate",
    label: "A shared documentary",
    confidence: 0.98,
    reviewRequired: false,
    reasons: ["same normalized title across 2 channels"],
    members: videos.slice(2, 4),
  },
  {
    id: "similar-dashboard",
    type: "similar",
    label: "Build compact javascript dashboard",
    confidence: 0.74,
    reviewRequired: true,
    reasons: ["strong title-word overlap"],
    members: videos.slice(4, 6),
  },
];
const statuses = {
  "series-1": "keep",
  "series-2": "unreviewed",
  "duplicate-1": "delete",
  "duplicate-2": "delete",
  "similar-1": "maybe",
  "similar-2": "keep",
};
const getStatus = videoId => statuses[videoId] || "unreviewed";

assert.deepEqual(
  filterVideoGroups(groups, { search: "episode 2" }, getStatus).map(group => group.id),
  ["series-tlou"],
);
assert.deepEqual(
  filterVideoGroups(groups, { channel: "Channel B" }, getStatus).map(group => group.id),
  ["duplicate-documentary"],
);
assert.deepEqual(
  filterVideoGroups(groups, { type: "similar", confidence: "review" }, getStatus).map(group => group.id),
  ["similar-dashboard"],
);
assert.deepEqual(
  filterVideoGroups(groups, { status: "all-delete" }, getStatus).map(group => group.id),
  ["duplicate-documentary"],
);
assert.deepEqual(
  filterVideoGroups(groups, { status: "mixed", onlyUndecided: true }, getStatus).map(group => group.id),
  ["series-tlou"],
);
assert.equal(formatSequence(seriesParsed[0].sequence), "S1 \u00b7 E1");
assert.equal(formatSequence(null), "");

function createElement() {
  const attributes = new Map();
  const classes = new Set();
  const element = {
    hidden: false,
    disabled: false,
    checked: false,
    value: "",
    textContent: "",
    className: "",
    dataset: {},
    children: [],
    listeners: {},
    classList: {
      add(...names) {
        names.forEach(name => classes.add(name));
      },
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name) || element.className.split(/\s+/).includes(name);
      },
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
  };
  return element;
}

const elementNames = [
  "fileInput",
  "groupsImportContext",
  "groupsEmptyState",
  "groupsEmptyTitle",
  "groupsEmptyDescription",
  "groupsImportJsonAction",
  "groupsBrowser",
  "groupsSearch",
  "groupsChannel",
  "groupsType",
  "groupsConfidence",
  "groupsStatus",
  "groupsOnlyUndecided",
  "groupsClearFilters",
  "groupsSummary",
  "groupsList",
  "groupsShowMore",
  "groupsDetail",
  "groupsDetailTitle",
  "groupsDetailMeta",
  "groupsDetailConfidence",
  "groupsDetailReasons",
  "groupsDetailMembers",
];
const els = Object.fromEntries(elementNames.map(name => [name, createElement()]));
let importClicks = 0;
els.fileInput.click = () => {
  importClicks++;
};
const state = {
  videos: [],
  lastImport: null,
  datasetRevision: 0,
  groupingCache: {},
  groupSearch: "",
  groupChannel: "all",
  groupType: "all",
  renderedGroupCount: 100,
  groupConfidence: "all",
  groupStatus: "all",
  groupOnlyUndecided: false,
  selectedGroupId: "",
  groupFocusVideoId: "",
};
let currentGroups = [];
let navigatedGroupId = "";
const view = createGroupsViewUi({
  state,
  els,
  getStatus,
  getMemoizedVideoGroups() {
    return currentGroups;
  },
  parseSeriesTitle: grouping.parseSeriesTitle,
  navigateToGroupsGroup(groupId) {
    navigatedGroupId = groupId;
    state.selectedGroupId = groupId;
    state.groupFocusVideoId = "";
    view.renderGroups();
  },
  document: {
    createElement,
  },
});

view.initializeGroupsView();
view.renderGroups();
assert.equal(els.groupsEmptyState.hidden, false);
assert.equal(els.groupsBrowser.hidden, true);
assert.equal(els.groupsEmptyTitle.textContent, "No dataset imported");
els.groupsImportJsonAction.listeners.click();
assert.equal(importClicks, 1);

state.videos = videos;
state.lastImport = {
  fileName: "fixture.json",
};
state.datasetRevision++;
currentGroups = groups;
state.groupFocusVideoId = "series-2";
view.renderGroups();
assert.equal(state.selectedGroupId, "series-tlou", "a Triage video deep link selects its matching group");
assert.equal(els.groupsBrowser.hidden, false);
assert.equal(els.groupsEmptyState.hidden, true);
assert.equal(els.groupsList.children.length, 3);
assert.equal(els.groupsDetail.hidden, false);
assert.equal(els.groupsDetailTitle.textContent, "The last of us");
assert.equal(els.groupsDetailMembers.children.length, 2);
assert.equal(els.groupsDetailMembers.children[0].children[2].textContent, "S1 \u00b7 E1");
assert.match(els.groupsDetailConfidence.textContent, /^Auto/);

els.groupsList.children[1].children[0].listeners.click();
assert.equal(navigatedGroupId, "duplicate-documentary");
assert.equal(els.groupsDetailTitle.textContent, "A shared documentary");

els.groupsType.value = "similar";
els.groupsType.listeners.change();
assert.equal(state.groupType, "similar");
assert.equal(els.groupsList.children.length, 1);
assert.match(els.groupsSummary.textContent, /^1 of 3 groups/);

els.groupsSearch.value = "not present";
els.groupsSearch.listeners.input();
assert.equal(els.groupsList.children.length, 1);
assert.equal(els.groupsList.children[0].textContent, "No groups match the current filters.");
els.groupsClearFilters.listeners.click();
assert.equal(state.groupSearch, "");
assert.equal(state.groupType, "all");
assert.equal(els.groupsList.children.length, 3);

currentGroups = Array.from({ length: 102 }, (_, index) => ({
  ...groups[0],
  id: `paged-${index}`,
  label: `Paged group ${index}`,
}));
state.selectedGroupId = "";
state.groupFocusVideoId = "";
state.renderedGroupCount = 100;
view.renderGroups();
assert.equal(els.groupsList.children.length, 100);
assert.equal(els.groupsShowMore.hidden, false);
els.groupsShowMore.listeners.click();
assert.equal(els.groupsList.children.length, 102);
assert.equal(els.groupsShowMore.hidden, true);

currentGroups = [];
state.selectedGroupId = "";
state.groupFocusVideoId = "";
view.renderGroups();
assert.equal(els.groupsEmptyTitle.textContent, "No groups detected");
assert.equal(els.groupsImportJsonAction.hidden, true);

const { html } = loadTriageApp();
assert.match(html, /id=["']groupsView["'][^>]*aria-labelledby=["']groupsTab["']/i);
assert.match(html, /id=["']groupsSearch["']/i);
assert.match(html, /id=["']groupsOnlyUndecided["']/i);
assert.match(html, /id=["']groupsList["'][^>]*role=["']list["']/i);
assert.match(html, /id=["']groupsDetail["'][^>]*aria-labelledby=["']groupsDetailTitle["']/i);
assert.match(html, /id=["']groupsDetailReasons["']/i);
assert.match(html, /id=["']groupsDetailMembers["']/i);
assert.doesNotMatch(html, /Coming in Phase 3/i);

console.log("series groups view test passed");
