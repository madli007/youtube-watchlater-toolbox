const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadTriageApp } = require("./helpers/load-triage-app.cjs");

const projectRoot = path.resolve(__dirname, "..");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(
    path.join(projectRoot, "docs/assets/js/ui/navigation.js"),
    "utf8",
  ),
  sandbox,
  { filename: "docs/assets/js/ui/navigation.js" },
);

const {
  VIEW_NAMES,
  parseHashParams,
  parseViewHash,
  parseNavigationHash,
  buildInsightsHash,
  buildTriageHash,
  buildGroupsHash,
  createNavigationUi,
} = sandbox.WatchLaterApp.ui.navigation;

assert.deepEqual(Array.from(VIEW_NAMES), ["triage", "insights", "groups"]);
assert.equal(parseViewHash("#triage"), "triage");
assert.equal(parseViewHash("#insights"), "insights");
assert.equal(parseViewHash("#groups?type=series"), "groups");
assert.equal(parseViewHash("#TRIAGE?status=keep"), "triage");
assert.equal(parseViewHash(""), "triage");
assert.equal(parseViewHash("#unknown"), "triage");
assert.deepEqual(
  JSON.parse(JSON.stringify(parseHashParams("#triage?channels=Channel%20A&ageBucket=6-12m"))),
  { channels: "Channel A", ageBucket: "6-12m" },
);
assert.deepEqual(
  JSON.parse(JSON.stringify(parseNavigationHash("#insights?channel=url%3A%40alpha"))),
  {
    view: "insights",
    hasQuery: true,
    channelKey: "url:@alpha",
    groups: null,
    triage: null,
  },
);
assert.deepEqual(
  JSON.parse(JSON.stringify(parseNavigationHash("#groups?video=video-1"))),
  {
    view: "groups",
    hasQuery: true,
    channelKey: "",
    groups: {
      groupId: "",
      videoId: "video-1",
    },
    triage: null,
  },
);
assert.equal(buildInsightsHash("url:@alpha"), "#insights?channel=url%3A%40alpha");
assert.equal(buildGroupsHash({ groupId: "series-abc" }), "#groups?group=series-abc");
assert.equal(buildGroupsHash({ videoId: "video-1" }), "#groups?video=video-1");
assert.equal(
  buildTriageHash({
    channelName: "Channel A",
    ageBucket: "6-12m",
    status: "maybe",
  }),
  "#triage?channels=Channel%20A&ageBucket=6-12m&status=maybe",
);

function createElement(view = "") {
  const attributes = new Map();
  const classes = new Set();
  return {
    dataset: view ? { view } : {},
    hidden: false,
    tabIndex: 0,
    focused: false,
    listeners: {},
    classList: {
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
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    closest(selector) {
      return selector === "[data-view]" && view ? this : null;
    },
    focus() {
      this.focused = true;
    },
  };
}

const windowListeners = {};
const windowStub = {
  location: { hash: "#insights" },
  addEventListener(type, listener) {
    windowListeners[type] = listener;
  },
};
const els = {
  viewTabs: createElement(),
  triageTab: createElement("triage"),
  insightsTab: createElement("insights"),
  groupsTab: createElement("groups"),
  triageView: createElement(),
  insightsView: createElement(),
  groupsView: createElement(),
};
const state = {
  activeView: "triage",
  videos: [{ videoId: "one" }, { videoId: "two" }],
  selectedIds: new Set(),
  currentId: "",
  selectedGroupId: "",
  groupFocusVideoId: "",
};
let renderCount = 0;
let appliedRouteFilters = null;
const navigation = createNavigationUi({
  state,
  els,
  window: windowStub,
  renderActiveView() {
    renderCount++;
  },
  getInsightsModel() {
    return {
      channels: [{ channelKey: "url:@alpha", channelName: "Alpha" }],
    };
  },
  captureFilterState() {
    return { status: "maybe" };
  },
  buildInsightsTriageFilters(current, options) {
    return {
      ...current,
      channels: [options.channelName || "Alpha"],
      ageBucket: options.ageBucket || "",
    };
  },
  applyFilterState(filters) {
    appliedRouteFilters = filters;
  },
});

navigation.initializeNavigation();
assert.equal(state.activeView, "insights");
assert.equal(els.insightsTab.getAttribute("aria-selected"), "true");
assert.equal(els.insightsTab.tabIndex, 0);
assert.equal(els.insightsView.hidden, false);
assert.equal(els.triageView.hidden, true);
assert.equal(renderCount, 1);

let prevented = false;
els.viewTabs.listeners.keydown({
  key: "ArrowRight",
  target: els.insightsTab,
  preventDefault() {
    prevented = true;
  },
});
assert.equal(prevented, true);
assert.equal(els.groupsTab.focused, true);
assert.equal(windowStub.location.hash, "#groups");

windowListeners.hashchange();
assert.equal(state.activeView, "groups");
assert.equal(els.groupsTab.classList.contains("is-active"), true);
assert.equal(els.groupsView.hidden, false);

navigation.navigateToGroupsVideo("two");
assert.equal(windowStub.location.hash, "#groups?video=two");
windowListeners.hashchange();
assert.equal(state.groupFocusVideoId, "two");
assert.equal(state.selectedGroupId, "");

navigation.navigateToGroupsGroup("series-abc");
assert.equal(windowStub.location.hash, "#groups?group=series-abc");
windowListeners.hashchange();
assert.equal(state.selectedGroupId, "series-abc");
assert.equal(state.groupFocusVideoId, "");

windowStub.location.hash = "#triage";
windowListeners.hashchange();
assert.equal(state.activeView, "triage");
assert.equal(els.triageView.hidden, false);
assert.equal(els.groupsView.hidden, true);

windowStub.location.hash = "#not-a-view";
windowListeners.hashchange();
assert.equal(state.activeView, "triage");

navigation.navigateToInsightsChannel("url:@alpha");
assert.equal(windowStub.location.hash, "#insights?channel=url%3A%40alpha");
windowListeners.hashchange();
assert.equal(state.selectedChannelKey, "url:@alpha");

navigation.navigateToTriageFromInsights({
  channelKey: "url:@alpha",
  channelName: "Alpha",
  ageBucket: "6-12m",
});
assert.equal(
  windowStub.location.hash,
  "#triage?channels=Alpha&ageBucket=6-12m&status=maybe",
);
windowListeners.hashchange();
assert.deepEqual(appliedRouteFilters, {
  status: "maybe",
  channels: ["Alpha"],
  ageBucket: "6-12m",
});

navigation.navigateToTriageFromInsights({
  videoIds: ["two", "missing", "one", "two"],
});
assert.equal(windowStub.location.hash, "#triage");
assert.deepEqual([...state.selectedIds], ["two", "one"]);
assert.equal(state.currentId, "two");
assert.deepEqual(JSON.parse(JSON.stringify(appliedRouteFilters)), {});

windowStub.location.hash = "#insights?channel=url%3A%40alpha";
windowListeners.hashchange();
assert.equal(state.activeView, "insights");
assert.equal(state.selectedChannelKey, "url:@alpha", "Back must restore the Insights selection");

loadTriageApp();

console.log("navigation test passed");
