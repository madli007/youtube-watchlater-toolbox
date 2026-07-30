const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  getLinkedAssets,
  loadTriageApp,
} = require("./helpers/load-triage-app.cjs");

const projectRoot = path.resolve(__dirname, "..");
const {
  entryPath,
  html,
} = loadTriageApp();

const scriptOrder = getLinkedAssets(html, entryPath)
  .filter(asset => asset.type === "JavaScript")
  .map(asset => path.relative(projectRoot, asset.path).replaceAll("\\", "/"));
const dependencyGraph = {
  "docs/assets/js/config.js": [],
  "docs/assets/js/domain/decisions.js": [
    "docs/assets/js/config.js",
  ],
  "docs/assets/js/domain/watchlater-import.js": [],
  "docs/assets/js/domain/import-comparison.js": [
    "docs/assets/js/domain/decisions.js",
  ],
  "docs/assets/js/domain/filters.js": [
    "docs/assets/js/domain/decisions.js",
  ],
  "docs/assets/js/domain/insights.js": [
    "docs/assets/js/domain/decisions.js",
    "docs/assets/js/domain/filters.js",
  ],
  "docs/assets/js/domain/time-budget.js": [
    "docs/assets/js/domain/decisions.js",
    "docs/assets/js/domain/filters.js",
  ],
  "docs/assets/js/domain/grouping.js": [
    "docs/assets/js/config.js",
    "docs/assets/js/domain/import-comparison.js",
    "docs/assets/js/domain/filters.js",
    "docs/assets/js/domain/insights.js",
  ],
  "docs/assets/js/domain/workspace.js": [
    "docs/assets/js/domain/decisions.js",
    "docs/assets/js/domain/import-comparison.js",
    "docs/assets/js/domain/filters.js",
    "docs/assets/js/domain/time-budget.js",
  ],
  "docs/assets/js/storage.js": [
    "docs/assets/js/config.js",
    "docs/assets/js/domain/decisions.js",
    "docs/assets/js/domain/import-comparison.js",
    "docs/assets/js/domain/insights.js",
    "docs/assets/js/domain/time-budget.js",
    "docs/assets/js/domain/workspace.js",
  ],
  "docs/assets/js/browser-io.js": [],
  "docs/assets/js/state.js": [
    "docs/assets/js/config.js",
    "docs/assets/js/domain/decisions.js",
    "docs/assets/js/domain/import-comparison.js",
    "docs/assets/js/domain/filters.js",
    "docs/assets/js/domain/insights.js",
    "docs/assets/js/storage.js",
  ],
  "docs/assets/js/ui/dom.js": [],
  "docs/assets/js/ui/triage-view.js": [
    "docs/assets/js/domain/filters.js",
  ],
  "docs/assets/js/ui/dialogs.js": [],
  "docs/assets/js/ui/video-list.js": [],
  "docs/assets/js/ui/dashboards.js": [],
  "docs/assets/js/ui/action-menus.js": [],
  "docs/assets/js/ui/insights-view.js": [],
  "docs/assets/js/ui/navigation.js": [],
  "docs/assets/js/triage-controller.js": [
    "docs/assets/js/config.js",
    "docs/assets/js/domain/decisions.js",
    "docs/assets/js/domain/watchlater-import.js",
    "docs/assets/js/domain/import-comparison.js",
    "docs/assets/js/domain/filters.js",
    "docs/assets/js/domain/insights.js",
    "docs/assets/js/domain/time-budget.js",
    "docs/assets/js/domain/grouping.js",
    "docs/assets/js/domain/workspace.js",
    "docs/assets/js/browser-io.js",
    "docs/assets/js/ui/triage-view.js",
    "docs/assets/js/ui/dialogs.js",
    "docs/assets/js/ui/video-list.js",
    "docs/assets/js/ui/dashboards.js",
    "docs/assets/js/ui/action-menus.js",
    "docs/assets/js/ui/insights-view.js",
    "docs/assets/js/ui/navigation.js",
  ],
  "docs/assets/js/app.js": [
    "docs/assets/js/config.js",
    "docs/assets/js/storage.js",
    "docs/assets/js/browser-io.js",
    "docs/assets/js/state.js",
    "docs/assets/js/ui/dom.js",
    "docs/assets/js/ui/triage-view.js",
    "docs/assets/js/ui/action-menus.js",
    "docs/assets/js/ui/insights-view.js",
    "docs/assets/js/ui/navigation.js",
    "docs/assets/js/triage-controller.js",
  ],
};

assert.deepEqual(
  scriptOrder,
  Object.keys(dependencyGraph),
  "the documented classic-script order must match the architecture manifest",
);

const visiting = new Set();
const visited = new Set();
function visit(modulePath) {
  assert.equal(visiting.has(modulePath), false, `circular dependency detected at ${modulePath}`);
  if (visited.has(modulePath)) return;
  visiting.add(modulePath);
  for (const dependency of dependencyGraph[modulePath]) {
    assert.ok(dependencyGraph[dependency], `unknown dependency ${dependency}`);
    assert.ok(
      scriptOrder.indexOf(dependency) < scriptOrder.indexOf(modulePath),
      `${dependency} must load before ${modulePath}`,
    );
    visit(dependency);
  }
  visiting.delete(modulePath);
  visited.add(modulePath);
}
Object.keys(dependencyGraph).forEach(visit);

const appSource = fs.readFileSync(
  path.join(projectRoot, "docs/assets/js/app.js"),
  "utf8",
);
assert.ok(
  appSource.split(/\r?\n/).length <= 50,
  "app.js must remain a minimal dependency-composition and bootstrap entrypoint",
);
assert.doesNotMatch(
  appSource,
  /^\s*(?:async\s+)?function\s+(?!bootstrapWatchLaterApp\b)/m,
  "application workflows belong in the controller, not app.js",
);

const storagePath = "docs/assets/js/storage.js";
for (const modulePath of Object.keys(dependencyGraph)) {
  const source = fs.readFileSync(path.join(projectRoot, modulePath), "utf8");
  if (modulePath.startsWith("docs/assets/js/domain/")
    || modulePath.startsWith("docs/assets/js/ui/")) {
    assert.doesNotMatch(
      source,
      /\b(?:localStorage|sessionStorage|createStorage)\b|\bpersistence\./,
      `${modulePath} must use injected data/callbacks instead of storage`,
    );
  }
  if (modulePath !== storagePath) {
    assert.doesNotMatch(
      source,
      /\b(?:localStorage|sessionStorage)\b/,
      `${modulePath} must not access browser storage directly`,
    );
  }
}

const storageSource = fs.readFileSync(path.join(projectRoot, storagePath), "utf8");
assert.match(
  storageSource,
  /app\.storage = Object\.freeze\(\{\s*createStorage,\s*\}\);/m,
  "storage must expose only its replaceable factory, not internal compatibility helpers",
);

console.log("bootstrap architecture test passed");
