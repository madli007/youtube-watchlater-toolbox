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

const { decisions, grouping } = sandbox.WatchLaterApp.domain;
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
let decisionState = null;
const getStatus = videoId =>
  decisionState?.decisions?.[videoId]?.status || statuses[videoId] || "unreviewed";

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
  "groupsOverridesPanel",
  "groupsOverridesCount",
  "groupsOverridesList",
  "groupsSummary",
  "groupsList",
  "groupsShowMore",
  "groupsMergeSelected",
  "groupsClearSelected",
  "groupsDetail",
  "groupsDetailTitle",
  "groupsDetailMeta",
  "groupsDetailConfidence",
  "groupsDetailSafety",
  "groupsConfirmMatch",
  "groupsKeepAll",
  "groupsMaybeAll",
  "groupsDeleteAll",
  "groupsKeepNewest",
  "groupsKeepMostViewed",
  "groupsEditAlias",
  "groupsSplitMembers",
  "groupsOpenInTriage",
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
  decisions: Object.fromEntries(
    Object.entries(statuses)
      .filter(([, status]) => status !== "unreviewed")
      .map(([videoId, status]) => [videoId, {
        status,
        tags: [],
        note: "",
        updatedAt: "2026-07-30T08:00:00.000Z",
      }]),
  ),
  history: [],
  channelRules: [],
  selectedIds: new Set(),
  currentId: "",
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
  selectedGroupIds: new Set(),
  selectedGroupMemberIds: new Set(),
  groupingOverrides: grouping.createEmptyGroupingOverrides(),
  groupingOverrideRevision: 0,
};
decisionState = state;
let currentGroups = [];
let navigatedGroupId = "";
let triageVideoIds = [];
let latestToast = "";
let latestConfirm = "";
let confirmResult = true;
let saveCount = 0;
const view = createGroupsViewUi({
  state,
  els,
  getStatus,
  createGroupDecisionPlan: decisions.createGroupDecisionPlan,
  applyDecisionPlan: decisions.applyDecisionPlan,
  getProtectedChannelMatches: decisions.getProtectedChannelMatches,
  getMemoizedVideoGroups() {
    return currentGroups;
  },
  chooseGroupWinner: grouping.chooseGroupWinner,
  parseSeriesTitle: grouping.parseSeriesTitle,
  createAliasOverride: grouping.createAliasOverride,
  createMergeOverride: grouping.createMergeOverride,
  createSplitOverride: grouping.createSplitOverride,
  getGroupingOverrideDiagnostics: grouping.getGroupingOverrideDiagnostics,
  normalizeGroupingOverrides: grouping.normalizeGroupingOverrides,
  removeGroupingOverride: grouping.removeGroupingOverride,
  createSnapshotId() {
    return `override-${state.groupingOverrideRevision + 1}`;
  },
  saveGroupingOverrides(value) {
    state.groupingOverrides = grouping.normalizeGroupingOverrides(value);
    state.groupingOverrideRevision++;
    return true;
  },
  openGroupingAliasEditor(_group, onSave) {
    onSave("Canonical alias");
  },
  navigateToGroupsGroup(groupId) {
    navigatedGroupId = groupId;
    state.selectedGroupId = groupId;
    state.groupFocusVideoId = "";
    view.renderGroups();
  },
  navigateToTriageFromInsights({ videoIds }) {
    triageVideoIds = videoIds;
  },
  addHistoryEntry(description, action, videoIds) {
    const beforeDecisions = {};
    for (const videoId of videoIds) {
      beforeDecisions[videoId] = Object.hasOwn(state.decisions, videoId)
        ? decisions.normalizeDecision(state.decisions[videoId])
        : null;
    }
    state.history.unshift(decisions.createHistoryEntry(
      description,
      action,
      beforeDecisions,
      "2026-07-30T10:00:00.000Z",
      `group-snapshot-${state.history.length + 1}`,
    ));
    return true;
  },
  saveDecisions() {
    saveCount++;
    return true;
  },
  render() {
    view.renderGroups();
  },
  showToast(message) {
    latestToast = message;
  },
  window: {
    confirm(message) {
      latestConfirm = message;
      return confirmResult;
    },
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
assert.equal(els.groupsDetailMembers.children[0].children[3].textContent, "S1 \u00b7 E1");
assert.match(els.groupsDetailConfidence.textContent, /^Auto/);
assert.equal(els.groupsKeepAll.disabled, false);
assert.equal(els.groupsKeepNewest.disabled, true, "unknown upload age disables the newest recommendation");

els.groupsKeepAll.listeners.click();
assert.equal(getStatus("series-2"), "keep");
assert.equal(state.history[0].action, "group-decision");
assert.equal(state.history[0].affectedCount, 1, "the snapshot only contains changed members");
assert.equal(saveCount, 1);
state.decisions = decisions.applyHistoryEntry(state.decisions, state.history.shift());
view.renderGroups();
assert.equal(getStatus("series-2"), "unreviewed", "the group snapshot restores the previous status");

state.decisions["series-2"] = {
  status: "keep",
  tags: [],
  note: "",
  updatedAt: "2026-07-30T11:00:00.000Z",
};
const noOpHistoryCount = state.history.length;
els.groupsKeepAll.listeners.click();
assert.equal(state.history.length, noOpHistoryCount, "a no-op group action must not create a snapshot");
assert.match(latestToast, /already keep/i);

els.groupsList.children[1].children[1].listeners.click();
assert.equal(navigatedGroupId, "duplicate-documentary");
assert.equal(els.groupsDetailTitle.textContent, "A shared documentary");
state.decisions["duplicate-1"].status = "maybe";
state.channelRules = [{ channel: "Channel A", protected: true }];
confirmResult = true;
els.groupsDeleteAll.listeners.click();
assert.match(latestConfirm, /protected channels: Channel A/i);
assert.equal(getStatus("duplicate-1"), "delete");
assert.equal(state.history[0].affectedCount, 1);
els.groupsOpenInTriage.listeners.click();
assert.deepEqual(triageVideoIds, ["duplicate-1", "duplicate-2"]);

els.groupsType.value = "similar";
els.groupsType.listeners.change();
assert.equal(state.groupType, "similar");
assert.equal(els.groupsList.children.length, 1);
assert.match(els.groupsSummary.textContent, /^1 of 3 groups/);
els.groupsList.children[0].children[1].listeners.click();
assert.equal(els.groupsKeepAll.disabled, true, "review-confidence groups start with bulk actions locked");
assert.equal(els.groupsConfirmMatch.hidden, false);
els.groupsConfirmMatch.listeners.click();
assert.equal(els.groupsKeepAll.disabled, false);
assert.equal(els.groupsKeepNewest.disabled, true, "confirmation cannot invent missing age data");
assert.equal(els.groupsKeepMostViewed.disabled, true, "confirmation cannot invent missing view data");

els.groupsSearch.value = "not present";
els.groupsSearch.listeners.input();
assert.equal(els.groupsList.children.length, 1);
assert.equal(els.groupsList.children[0].textContent, "No groups match the current filters.");
els.groupsClearFilters.listeners.click();
assert.equal(state.groupSearch, "");
assert.equal(state.groupType, "all");
assert.equal(els.groupsList.children.length, 3);

let firstMergeCheckbox = els.groupsList.children[0].children[0];
firstMergeCheckbox.checked = true;
firstMergeCheckbox.listeners.change();
let secondMergeCheckbox = els.groupsList.children[1].children[0];
secondMergeCheckbox.checked = true;
secondMergeCheckbox.listeners.change();
assert.equal(els.groupsMergeSelected.disabled, false);
els.groupsMergeSelected.listeners.click();
assert.match(latestToast, /different channels cannot be merged/i);
assert.equal(state.groupingOverrides.merges.length, 0);
els.groupsClearSelected.listeners.click();
assert.equal(state.selectedGroupIds.size, 0);

state.selectedGroupId = "series-tlou";
view.renderGroups();
els.groupsEditAlias.listeners.click();
assert.equal(state.groupingOverrides.aliases.length, 1);
assert.equal(state.groupingOverrides.aliases[0].to, "canonical alias");
assert.equal(els.groupsOverridesPanel.hidden, false);
assert.equal(els.groupsOverridesList.children.length, 1);
els.groupsOverridesList.children[0].children[2].listeners.click();
assert.equal(state.groupingOverrides.aliases.length, 0, "a manual correction can be removed");
assert.equal(els.groupsOverridesPanel.hidden, true);

state.selectedGroupId = "series-tlou";
view.renderGroups();
const splitCheckbox = els.groupsDetailMembers.children[0].children[0];
splitCheckbox.checked = true;
splitCheckbox.listeners.change();
assert.equal(els.groupsSplitMembers.disabled, false);
els.groupsSplitMembers.listeners.click();
assert.equal(state.groupingOverrides.splits.length, 1);
assert.deepEqual([...state.groupingOverrides.splits[0].memberIds], ["series-1"]);
assert.equal(els.groupsOverridesList.children.length, 1);
els.groupsOverridesList.children[0].children[2].listeners.click();
assert.equal(state.groupingOverrides.splits.length, 0);

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
assert.match(html, /id=["']groupsConfirmMatch["']/i);
assert.match(html, /id=["']groupsKeepAll["']/i);
assert.match(html, /id=["']groupsKeepNewest["']/i);
assert.match(html, /id=["']groupsOpenInTriage["']/i);
assert.match(html, /id=["']groupsMergeSelected["']/i);
assert.match(html, /id=["']groupsEditAlias["']/i);
assert.match(html, /id=["']groupsSplitMembers["']/i);
assert.match(html, /id=["']groupsOverridesList["']/i);
assert.match(html, /id=["']groupingAliasDialog["']/i);
assert.doesNotMatch(html, /Coming in Phase 3/i);

console.log("series groups view test passed");
