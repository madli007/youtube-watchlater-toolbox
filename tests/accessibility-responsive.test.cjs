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
    path.join(projectRoot, "docs/assets/js/ui/accessibility.js"),
    "utf8",
  ),
  sandbox,
  { filename: "docs/assets/js/ui/accessibility.js" },
);

const {
  RESPONSIVE_DRAWER_QUERY,
  getFocusableElements,
  trapFocusWithin,
  createResponsiveDrawerController,
} = sandbox.WatchLaterApp.ui.accessibility;

function createElement(options = {}) {
  const attributes = new Map();
  const classes = new Set();
  const listeners = new Map();
  const element = {
    hidden: Boolean(options.hidden),
    disabled: Boolean(options.disabled),
    focused: false,
    children: options.children || [],
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
    querySelectorAll() {
      return this.children;
    },
    contains(candidate) {
      return candidate === element || this.children.includes(candidate);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    focus() {
      this.focused = true;
    },
  };
  if (options.ariaHidden) element.setAttribute("aria-hidden", "true");
  if (options.ariaDisabled) element.setAttribute("aria-disabled", "true");
  return element;
}

const first = createElement();
const middle = createElement();
const last = createElement();
const hidden = createElement({ hidden: true });
const disabled = createElement({ ariaDisabled: true });
const container = createElement({ children: [first, hidden, middle, disabled, last] });
const focusable = Array.from(getFocusableElements(container));
assert.equal(focusable.length, 3, "hidden and ARIA-disabled controls must not enter the focus loop");
assert.equal(focusable[0], first);
assert.equal(focusable[1], middle);
assert.equal(focusable[2], last);

const documentStub = { activeElement: last };
let prevented = false;
assert.equal(
  trapFocusWithin({
    key: "Tab",
    shiftKey: false,
    preventDefault() {
      prevented = true;
    },
  }, container, documentStub),
  true,
);
assert.equal(prevented, true);
assert.equal(first.focused, true, "Tab from the last control must wrap to the first");

documentStub.activeElement = first;
prevented = false;
assert.equal(
  trapFocusWithin({
    key: "Tab",
    shiftKey: true,
    preventDefault() {
      prevented = true;
    },
  }, container, documentStub),
  true,
);
assert.equal(last.focused, true, "Shift+Tab from the first control must wrap to the last");

const closeButton = createElement();
const opener = createElement();
const drawer = createElement({ children: [closeButton, middle] });
const mediaListeners = new Map();
const mediaQuery = {
  matches: true,
  addEventListener(type, listener) {
    mediaListeners.set(type, listener);
  },
};
let closeCount = 0;
const controller = createResponsiveDrawerController({
  container: drawer,
  closeButton,
  document: { activeElement: closeButton },
  window: {
    matchMedia(query) {
      assert.equal(query, RESPONSIVE_DRAWER_QUERY);
      return mediaQuery;
    },
    requestAnimationFrame(callback) {
      callback();
    },
  },
  onClose() {
    closeCount++;
  },
});

controller.sync(true, {
  restoreFocus: () => opener,
});
assert.equal(drawer.getAttribute("role"), "dialog");
assert.equal(drawer.getAttribute("aria-modal"), "true");
assert.equal(drawer.classList.contains("is-responsive-drawer"), true);
assert.equal(closeButton.focused, true, "opening a responsive drawer must move focus inside");

let escapePrevented = false;
drawer.dispatch("keydown", {
  key: "Escape",
  preventDefault() {
    escapePrevented = true;
  },
});
assert.equal(escapePrevented, true);
assert.equal(closeCount, 1);
assert.equal(opener.focused, true, "closing a drawer must restore its invoking control");
assert.equal(drawer.getAttribute("aria-modal"), undefined);

mediaQuery.matches = false;
mediaListeners.get("change")();
controller.sync(true);
assert.equal(drawer.getAttribute("role"), undefined, "desktop detail panels are complementary content, not modal dialogs");

const { html } = loadTriageApp();
const css = fs.readFileSync(
  path.join(projectRoot, "docs/assets/css/app.css"),
  "utf8",
);
assert.match(html, /class=["']skip-link["'][^>]*href=["']#mainContent["']/i);
assert.match(html, /<main\b[^>]*id=["']mainContent["'][^>]*tabindex=["']-1["']/i);
assert.match(
  html,
  /id=["']insightsChannelDetail["'][^>]*aria-labelledby=["']insightsDetailTitle["'][^>]*tabindex=["']-1["']/i,
);
assert.match(
  html,
  /id=["']groupsDetail["'][^>]*aria-labelledby=["']groupsDetailTitle["'][^>]*tabindex=["']-1["']/i,
);
assert.match(html, /id=["']closeInsightsDetail["'][^>]*aria-label=["']Close channel detail["']/i);
assert.match(html, /id=["']closeGroupsDetail["'][^>]*aria-label=["']Close group detail["']/i);
assert.match(html, /<table class=["']insights-table["']>[\s\S]*?<th scope=["']col["']/i);
assert.match(html, /id=["']videoEditorDialog["'][^>]*aria-labelledby=["']videoEditorHeading["']/i);
assert.match(html, /id=["']rulesDialog["'][^>]*aria-labelledby=["']rulesDialogTitle["']/i);
assert.match(html, /id=["']toast["'][^>]*aria-atomic=["']true["']/i);
assert.match(css, /@media\s*\(max-width:\s*980px\)/i);
assert.match(css, /@media\s*\(max-width:\s*680px\)/i);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
assert.match(css, /\.responsive-detail-drawer\.is-responsive-drawer/i);

console.log("accessibility and responsive test passed");
