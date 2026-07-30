const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const modulePaths = [
  "docs/assets/js/config.js",
  "docs/assets/js/domain/decisions.js",
  "docs/assets/js/domain/import-comparison.js",
  "docs/assets/js/domain/filters.js",
  "docs/assets/js/domain/insights.js",
  "docs/assets/js/domain/import-history.js",
  "docs/assets/js/domain/time-budget.js",
  "docs/assets/js/domain/grouping.js",
  "docs/assets/js/domain/workspace.js",
  "docs/assets/js/storage.js",
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

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryIndexedDb(options = {}) {
  const values = new Map();
  let storeCreated = false;

  const database = {
    objectStoreNames: {
      contains(name) {
        return name === "snapshots" && storeCreated;
      },
    },
    createObjectStore(name) {
      assert.equal(name, "snapshots");
      storeCreated = true;
    },
    transaction(name, mode) {
      assert.equal(name, "snapshots");
      assert.ok(mode === "readonly" || mode === "readwrite");
      if (!storeCreated) throw new Error("Missing object store");

      const transaction = {
        objectStore() {
          return {
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = clone(values.get(key));
                request.onsuccess?.();
                transaction.oncomplete?.();
              });
              return request;
            },
            put(value, key) {
              queueMicrotask(() => {
                if (options.failWrites) {
                  transaction.error = { name: "QuotaExceededError" };
                  transaction.onabort?.();
                  return;
                }
                values.set(key, clone(value));
                transaction.oncomplete?.();
              });
            },
          };
        },
      };
      return transaction;
    },
    close() {},
  };

  return {
    open(name, version) {
      assert.equal(name, "watchlater-triage-datasets");
      assert.equal(version, 1);
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        if (!storeCreated) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
    seed(value) {
      storeCreated = true;
      values.set("current", clone(value));
    },
  };
}

async function main() {
  const indexedDb = createMemoryIndexedDb();
  const datasetStorage = sandbox.WatchLaterApp.storage.createDatasetStorage(indexedDb);
  const savedAt = "2026-07-30T20:00:00.000Z";
  const snapshot = {
    schemaVersion: 1,
    savedAt,
    videos: [
      {
        videoId: "one",
        title: "First video",
        views: "1,234 views",
        viewCountApprox: 1234,
        suggestedTags: ["derived"],
        searchText: "derived search text",
      },
      { title: "Missing ID" },
    ],
    lastImport: {
      fileName: "watchlater_export.json",
      importedAt: savedAt,
    },
    importComparison: {
      baselineAvailable: true,
      newIds: ["one"],
      removedVideos: [],
      changedIds: [],
      changedFieldsById: {},
      decidedIds: [],
      orphanedDecisionIds: [],
    },
  };

  assert.equal(await datasetStorage.saveDataset(snapshot), true);
  const restored = await datasetStorage.loadDataset();
  assert.equal(restored.schemaVersion, 1);
  assert.equal(restored.savedAt, savedAt);
  assert.equal(restored.videos.length, 1);
  assert.equal(restored.videos[0].videoId, "one");
  assert.equal(restored.videos[0].viewCountApprox, 1234);
  assert.equal(restored.videos[0].suggestedTags, undefined);
  assert.equal(restored.videos[0].searchText, undefined);
  assert.equal(restored.lastImport.fileName, "watchlater_export.json");
  assert.deepEqual([...restored.importComparison.newIds], ["one"]);

  assert.equal(await datasetStorage.saveDataset({ schemaVersion: 2, videos: [] }), false);

  const corruptIndexedDb = createMemoryIndexedDb();
  corruptIndexedDb.seed({ schemaVersion: 2, videos: [] });
  assert.equal(
    await sandbox.WatchLaterApp.storage
      .createDatasetStorage(corruptIndexedDb)
      .loadDataset(),
    null,
  );

  const unavailable = sandbox.WatchLaterApp.storage.createDatasetStorage(null);
  assert.equal(await unavailable.loadDataset(), null);
  assert.equal(await unavailable.saveDataset(snapshot), false);

  const quotaLimited = sandbox.WatchLaterApp.storage.createDatasetStorage(
    createMemoryIndexedDb({ failWrites: true }),
  );
  assert.equal(await quotaLimited.saveDataset(snapshot), false);

  console.log("dataset storage test passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
