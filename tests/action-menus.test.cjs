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
    path.join(projectRoot, "docs/assets/js/ui/action-menus.js"),
    "utf8",
  ),
  sandbox,
  { filename: "docs/assets/js/ui/action-menus.js" },
);

const {
  createActionMenusUi,
} = sandbox.WatchLaterApp.ui.actionMenus;

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

function createElement(options = {}) {
  const attributes = new Map();
  const listeners = new Map();
  const element = {
    tagName: options.tagName || "BUTTON",
    hidden: options.hidden || false,
    disabled: options.disabled || false,
    focused: false,
    clicked: 0,
    items: [],
    members: new Set(),
    classList: createClassList(),
    addEventListener(type, listener) {
      const typeListeners = listeners.get(type) || [];
      typeListeners.push(listener);
      listeners.set(type, typeListeners);
    },
    dispatch(type, event = {}) {
      const dispatchedEvent = {
        target: event.target || element,
        key: event.key,
        prevented: false,
        preventDefault() {
          this.prevented = true;
        },
      };
      for (const listener of listeners.get(type) || []) listener(dispatchedEvent);
      return dispatchedEvent;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    querySelectorAll(selector) {
      return selector === '[role="menuitem"]' ? this.items : [];
    },
    contains(target) {
      return target === element || this.members.has(target);
    },
    closest(selector) {
      if (selector === '[role="menuitem"]' && options.menuItem) return element;
      if (selector === ".split-main" && options.splitMain) return element;
      return null;
    },
    focus() {
      this.focused = true;
    },
    click() {
      this.clicked++;
      this.dispatch("click");
    },
  };
  return element;
}

function createMenuFixture(itemOptions = [{}, {}]) {
  const root = createElement();
  const trigger = createElement();
  const menu = createElement({ hidden: true });
  menu.items = itemOptions.map(options => createElement({ menuItem: true, ...options }));
  for (const member of [trigger, menu, ...menu.items]) root.members.add(member);
  return { root, trigger, menu };
}

const importFixture = createMenuFixture([
  { tagName: "LABEL" },
  { tagName: "LABEL" },
]);
const exportFixture = createMenuFixture([
  { disabled: true },
  {},
  {},
]);
const workspaceFixture = createMenuFixture();
const decisionsFixture = createMenuFixture([
  {},
  { tagName: "LABEL" },
  {},
]);
const importJsonAction = createElement({ tagName: "LABEL", splitMain: true });
importFixture.root.members.add(importJsonAction);

const documentListeners = new Map();
const documentStub = {
  addEventListener(type, listener) {
    documentListeners.set(type, listener);
  },
};
const els = {
  importJsonAction,
  importMenuRoot: importFixture.root,
  importMenuButton: importFixture.trigger,
  importMenu: importFixture.menu,
  exportMenuRoot: exportFixture.root,
  exportMenuButton: exportFixture.trigger,
  exportMenu: exportFixture.menu,
  workspaceMenuRoot: workspaceFixture.root,
  workspaceMenuButton: workspaceFixture.trigger,
  workspaceMenu: workspaceFixture.menu,
  decisionsMenuRoot: decisionsFixture.root,
  decisionsMenuButton: decisionsFixture.trigger,
  decisionsMenu: decisionsFixture.menu,
};

const actionMenus = createActionMenusUi({
  els,
  document: documentStub,
});
actionMenus.initializeActionMenus();

assert.equal(importFixture.trigger.getAttribute("aria-haspopup"), "menu");
assert.equal(importFixture.trigger.getAttribute("aria-expanded"), "false");

importFixture.trigger.dispatch("click");
assert.equal(importFixture.menu.hidden, false);
assert.equal(importFixture.trigger.getAttribute("aria-expanded"), "true");
assert.equal(importFixture.menu.items[0].focused, true);

documentListeners.get("click")({ target: createElement() });
assert.equal(importFixture.menu.hidden, true, "clicking outside must close the open menu");

exportFixture.trigger.dispatch("click");
assert.equal(
  exportFixture.menu.items[1].focused,
  true,
  "opening a menu must skip disabled items",
);
documentListeners.get("keydown")({
  key: "Escape",
  preventDefault() {},
});
assert.equal(exportFixture.menu.hidden, true);
assert.equal(exportFixture.trigger.focused, true, "Escape must restore trigger focus");

const arrowOpenEvent = workspaceFixture.trigger.dispatch("keydown", { key: "ArrowUp" });
assert.equal(arrowOpenEvent.prevented, true);
assert.equal(workspaceFixture.menu.hidden, false);
assert.equal(workspaceFixture.menu.items[1].focused, true);

workspaceFixture.menu.dispatch("keydown", {
  key: "Home",
  target: workspaceFixture.menu.items[1],
});
assert.equal(workspaceFixture.menu.items[0].focused, true);

const importLabel = decisionsFixture.menu.items[1];
decisionsFixture.trigger.dispatch("click");
decisionsFixture.menu.dispatch("keydown", {
  key: "Enter",
  target: importLabel,
});
assert.equal(importLabel.clicked, 1, "keyboard activation must click file-input labels");
assert.equal(decisionsFixture.menu.hidden, true);

const primaryImportEvent = importJsonAction.dispatch("keydown", { key: " " });
assert.equal(primaryImportEvent.prevented, true);
assert.equal(importJsonAction.clicked, 1, "the primary import label must be keyboard accessible");

const { html } = loadTriageApp();
const actionIds = [
  "fileInput",
  "exportKeepMaybe",
  "exportDeleteCandidates",
  "exportSelected",
  "exportVisible",
  "exportTagged",
  "exportDecisions",
  "decisionsInput",
  "exportWorkspace",
  "workspaceInput",
  "clearDecisions",
];
for (const id of actionIds) {
  assert.match(html, new RegExp(`\\bid=["']${id}["']`), `${id} must remain reachable`);
}
for (const menu of ["import", "export", "workspace", "decisions"]) {
  assert.match(
    html,
    new RegExp(`id=["']${menu}Menu["'][^>]*role=["']menu["'][^>]*hidden`, "i"),
    `${menu} menu must use hidden ARIA menu markup`,
  );
}
assert.match(
  html,
  /id=["']importJsonAction["'][^>]*for=["']fileInput["'][^>]*role=["']button["'][^>]*tabindex=["']0["']/i,
);
assert.match(html, /for=["']decisionsInput["'][^>]*role=["']menuitem["'][^>]*tabindex=["']-1["']/i);
assert.match(html, /for=["']workspaceInput["'][^>]*role=["']menuitem["'][^>]*tabindex=["']-1["']/i);
assert.match(
  html,
  /id=["']clearDecisions["'][^>]*class=["'][^"']*danger-action[^"']*["'][^>]*role=["']menuitem["']/i,
  "Clear decisions must be visually separated as a destructive action",
);

console.log("action menus test passed");
