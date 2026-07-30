"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const sandbox = {};
const plain = value => JSON.parse(JSON.stringify(value));
vm.createContext(sandbox);
for (const relativePath of [
  "docs/assets/js/config.js",
  "docs/assets/js/ui/video-list.js",
]) {
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, relativePath), "utf8"),
    sandbox,
    { filename: relativePath },
  );
}

function createElement(tagName = "div") {
  const attributes = new Map();
  const classes = new Set();
  const element = {
    tagName: tagName.toUpperCase(),
    children: [],
    dataset: {},
    listeners: {},
    parentElement: null,
    textContent: "",
    hidden: false,
    disabled: false,
    checked: false,
    className: "",
    classList: {
      add(...names) {
        names.forEach(name => classes.add(name));
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
      children.forEach(child => {
        child.parentElement = element;
        element.children.push(child);
      });
    },
    appendChild(child) {
      this.append(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    },
    replaceWith(replacement) {
      const siblings = this.parentElement?.children;
      const index = siblings?.indexOf(this) ?? -1;
      if (index < 0) return;
      replacement.parentElement = this.parentElement;
      siblings.splice(index, 1, replacement);
      this.parentElement = null;
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  Object.defineProperty(element, "innerHTML", {
    set() {
      element.children = [];
    },
  });
  return element;
}

const videos = Array.from({ length: 3 }, (_, index) => ({
  videoId: `video-${index + 1}`,
  index: index + 1,
  title: `Video ${index + 1}`,
  channel: "Performance",
  url: `https://youtu.be/video-${index + 1}`,
  suggestedTags: [],
  badges: [],
}));
const decisions = {};
const state = {
  activeView: "triage",
  videos,
  renderedCount: 220,
  currentId: "video-1",
  selectedIds: new Set(),
  importComparison: {
    newIds: [],
    changedIds: [],
    changedFieldsById: {},
  },
};
const videoList = createElement("section");
const documentStub = {
  createElement,
  addEventListener() {},
  querySelector() {
    return null;
  },
};
const windowStub = {
  innerHeight: 900,
  scrollY: 0,
  requestAnimationFrame(callback) {
    callback();
  },
  open() {},
};
sandbox.document = documentStub;
sandbox.window = windowStub;
const view = sandbox.WatchLaterApp.ui.videoList.createVideoListUi({
  state,
  els: { videoList },
  PAGE_SIZE: 220,
  normalizeTags: values => Array.isArray(values) ? values : [],
  getFilteredVideos: () => videos,
  getStatus: videoId => decisions[videoId]?.status || "unreviewed",
  getDecision: videoId => decisions[videoId] || {
    status: "unreviewed",
    tags: [],
    note: "",
  },
  getVideoTags: () => [],
  setStatus() {},
  setStatusAndAdvance() {},
  render() {},
  openQuickPreview() {},
  openVideoEditor() {},
  navigateToGroupsVideo() {},
  renderStats() {},
  updateBulkLabels() {},
  document: documentStub,
  window: windowStub,
});

view.renderVideoList(videos);
const untouchedThirdRow = videoList.children[2];
assert.deepEqual(plain(view.getRenderDiagnostics()), {
  fullRenderCount: 1,
  patchRenderCount: 0,
  renderedVideoCount: 3,
});

decisions["video-1"] = { status: "keep", tags: [], note: "" };
state.currentId = "video-2";
view.renderVideoList(videos, { changedVideoIds: ["video-1"] });
assert.equal(
  videoList.children[2],
  untouchedThirdRow,
  "a quick decision should retain unrelated keyed rows",
);
assert.equal(videoList.children[0].dataset.status, "keep");
assert.equal(videoList.children[1].getAttribute("aria-current"), "true");
assert.deepEqual(plain(view.getRenderDiagnostics()), {
  fullRenderCount: 1,
  patchRenderCount: 1,
  renderedVideoCount: 3,
});

view.renderVideoList(videos);
assert.equal(view.getRenderDiagnostics().fullRenderCount, 2);

console.log("video list performance test passed");
