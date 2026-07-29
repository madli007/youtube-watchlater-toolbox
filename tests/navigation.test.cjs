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
  parseViewHash,
  createNavigationUi,
} = sandbox.WatchLaterApp.ui.navigation;

assert.deepEqual(Array.from(VIEW_NAMES), ["triage", "insights", "groups"]);
assert.equal(parseViewHash("#triage"), "triage");
assert.equal(parseViewHash("#insights"), "insights");
assert.equal(parseViewHash("#groups?type=series"), "groups");
assert.equal(parseViewHash("#TRIAGE?status=keep"), "triage");
assert.equal(parseViewHash(""), "triage");
assert.equal(parseViewHash("#unknown"), "triage");

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
const state = { activeView: "triage" };
let renderCount = 0;
const navigation = createNavigationUi({
  state,
  els,
  window: windowStub,
  renderActiveView() {
    renderCount++;
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

windowStub.location.hash = "#triage";
windowListeners.hashchange();
assert.equal(state.activeView, "triage");
assert.equal(els.triageView.hidden, false);
assert.equal(els.groupsView.hidden, true);

windowStub.location.hash = "#not-a-view";
windowListeners.hashchange();
assert.equal(state.activeView, "triage");

loadTriageApp();

console.log("navigation test passed");
