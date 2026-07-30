(function registerStorage(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  const {
    STORAGE_KEY,
    HISTORY_STORAGE_KEY,
    USER_RULES_STORAGE_KEY,
    CHANNEL_RULES_STORAGE_KEY,
    SAVED_VIEWS_STORAGE_KEY,
    DATASET_BASELINE_STORAGE_KEY,
    TIME_BUDGET_STORAGE_KEY,
    INSIGHTS_SETTINGS_STORAGE_KEY,
    PREVIEW_PROGRESS_STORAGE_KEY,
    GROUPING_OVERRIDES_STORAGE_KEY,
    IMPORT_HISTORY_STORAGE_KEY,
  } = app.config;
  const { normalizeHistory } = app.domain.decisions;
  const {
    createVideoSnapshot,
    normalizeImportComparison,
    normalizePlainObject,
  } = app.domain.importComparison;
  const { normalizeTimeBudgetHours } = app.domain.timeBudget;
  const { normalizeInsightsSettings } = app.domain.insights;
  const { normalizePreviewProgress } = app.domain.workspace;
  const { normalizeGroupingOverrides } = app.domain.grouping;
  const { normalizeImportHistory } = app.domain.importHistory;
  const { toWorkspaceVideo } = app.domain.workspace;

  const DATASET_DATABASE_NAME = "watchlater-triage-datasets";
  const DATASET_DATABASE_VERSION = 1;
  const DATASET_OBJECT_STORE = "snapshots";
  const CURRENT_DATASET_KEY = "current";

  function getDefaultStorage() {
    try {
      return root.localStorage || null;
    } catch (_error) {
      return null;
    }
  }

  function getDefaultIndexedDb() {
    try {
      return root.indexedDB || null;
    } catch (_error) {
      return null;
    }
  }

  function readText(storage, key) {
    if (!storage || typeof storage.getItem !== "function") return null;
    try {
      return storage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function readJson(storage, key, fallback) {
    const raw = readText(storage, key);
    if (raw === null || raw === "") return fallback;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return fallback;
    }
  }

  function writeText(storage, key, value) {
    if (!storage || typeof storage.setItem !== "function") return false;
    try {
      storage.setItem(key, String(value));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function writeJson(storage, key, value) {
    try {
      return writeText(storage, key, JSON.stringify(value));
    } catch (_error) {
      return false;
    }
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeDatasetSnapshot(value) {
    if (!value || typeof value !== "object" || value.schemaVersion !== 1
      || !Array.isArray(value.videos)) {
      return null;
    }
    return {
      schemaVersion: 1,
      savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
      videos: value.videos
        .filter(video => video && typeof video === "object")
        .map(toWorkspaceVideo)
        .filter(video => String(video.videoId || "").trim()),
      lastImport: normalizePlainObject(value.lastImport),
      importComparison: normalizeImportComparison(value.importComparison),
    };
  }

  function createDatasetStorage(indexedDb = getDefaultIndexedDb()) {
    function openDatabase() {
      return new Promise((resolve, reject) => {
        if (!indexedDb || typeof indexedDb.open !== "function") {
          reject(new Error("IndexedDB is unavailable."));
          return;
        }

        let request;
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return false;
          settled = true;
          callback(value);
          return true;
        };
        try {
          request = indexedDb.open(DATASET_DATABASE_NAME, DATASET_DATABASE_VERSION);
        } catch (error) {
          finish(reject, error);
          return;
        }

        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(DATASET_OBJECT_STORE)) {
            database.createObjectStore(DATASET_OBJECT_STORE);
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => database.close();
          if (!finish(resolve, database)) database.close();
        };
        request.onerror = () => finish(
          reject,
          request.error || new Error("IndexedDB could not be opened."),
        );
        request.onblocked = () => finish(
          reject,
          new Error("IndexedDB upgrade is blocked by another tab."),
        );
      });
    }

    async function loadDataset() {
      let database;
      try {
        database = await openDatabase();
        return await new Promise(resolve => {
          let transaction;
          let request;
          try {
            transaction = database.transaction(DATASET_OBJECT_STORE, "readonly");
            request = transaction.objectStore(DATASET_OBJECT_STORE).get(CURRENT_DATASET_KEY);
          } catch (_error) {
            resolve(null);
            return;
          }

          request.onsuccess = () => resolve(normalizeDatasetSnapshot(request.result));
          request.onerror = () => resolve(null);
          transaction.onabort = () => resolve(null);
          transaction.onerror = () => resolve(null);
        });
      } catch (_error) {
        return null;
      } finally {
        database?.close();
      }
    }

    async function saveDataset(value) {
      const snapshot = normalizeDatasetSnapshot(value);
      if (!snapshot) return false;

      let database;
      try {
        database = await openDatabase();
        return await new Promise(resolve => {
          let transaction;
          try {
            transaction = database.transaction(DATASET_OBJECT_STORE, "readwrite");
            transaction.objectStore(DATASET_OBJECT_STORE).put(snapshot, CURRENT_DATASET_KEY);
          } catch (_error) {
            resolve(false);
            return;
          }

          transaction.oncomplete = () => resolve(true);
          transaction.onabort = () => resolve(false);
          transaction.onerror = () => resolve(false);
        });
      } catch (_error) {
        return false;
      } finally {
        database?.close();
      }
    }

    return Object.freeze({
      loadDataset,
      saveDataset,
    });
  }

  function createStorage(storage = getDefaultStorage()) {
    return Object.freeze({
      loadDecisions() {
        return asObject(readJson(storage, STORAGE_KEY, {}));
      },
      saveDecisions(value) {
        return writeJson(storage, STORAGE_KEY, asObject(value));
      },
      loadHistory() {
        return normalizeHistory(asArray(readJson(storage, HISTORY_STORAGE_KEY, [])));
      },
      saveHistory(value) {
        return writeJson(storage, HISTORY_STORAGE_KEY, normalizeHistory(value));
      },
      loadUserRules() {
        return asObject(readJson(storage, USER_RULES_STORAGE_KEY, {}));
      },
      saveUserRules(value) {
        return writeJson(storage, USER_RULES_STORAGE_KEY, asObject(value));
      },
      loadChannelRules() {
        return asArray(readJson(storage, CHANNEL_RULES_STORAGE_KEY, []));
      },
      saveChannelRules(value) {
        return writeJson(storage, CHANNEL_RULES_STORAGE_KEY, asArray(value));
      },
      loadSavedViews() {
        return asArray(readJson(storage, SAVED_VIEWS_STORAGE_KEY, []));
      },
      saveSavedViews(value) {
        return writeJson(storage, SAVED_VIEWS_STORAGE_KEY, asArray(value));
      },
      loadDatasetBaseline() {
        const parsed = readJson(storage, DATASET_BASELINE_STORAGE_KEY, null);
        if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.videos)) return null;
        return {
          schemaVersion: 1,
          savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
          lastImport: normalizePlainObject(parsed.lastImport),
          videos: parsed.videos.map(createVideoSnapshot).filter(video => video.videoId),
        };
      },
      saveDatasetBaseline(value) {
        return writeJson(storage, DATASET_BASELINE_STORAGE_KEY, value);
      },
      loadTimeBudgetHours() {
        return normalizeTimeBudgetHours(readText(storage, TIME_BUDGET_STORAGE_KEY));
      },
      saveTimeBudgetHours(value) {
        return writeText(storage, TIME_BUDGET_STORAGE_KEY, normalizeTimeBudgetHours(value));
      },
      loadInsightsSettings() {
        return normalizeInsightsSettings(asObject(
          readJson(storage, INSIGHTS_SETTINGS_STORAGE_KEY, {}),
        ));
      },
      saveInsightsSettings(value) {
        return writeJson(
          storage,
          INSIGHTS_SETTINGS_STORAGE_KEY,
          normalizeInsightsSettings(value),
        );
      },
      loadPreviewProgress() {
        return normalizePreviewProgress(asObject(
          readJson(storage, PREVIEW_PROGRESS_STORAGE_KEY, {}),
        ));
      },
      savePreviewProgress(value) {
        return writeJson(
          storage,
          PREVIEW_PROGRESS_STORAGE_KEY,
          normalizePreviewProgress(value),
        );
      },
      loadGroupingOverrides() {
        return normalizeGroupingOverrides(asObject(
          readJson(storage, GROUPING_OVERRIDES_STORAGE_KEY, {}),
        ));
      },
      saveGroupingOverrides(value) {
        return writeJson(
          storage,
          GROUPING_OVERRIDES_STORAGE_KEY,
          normalizeGroupingOverrides(value),
        );
      },
      loadImportHistory() {
        return normalizeImportHistory(
          readJson(storage, IMPORT_HISTORY_STORAGE_KEY, []),
        );
      },
      saveImportHistory(value) {
        return writeJson(
          storage,
          IMPORT_HISTORY_STORAGE_KEY,
          normalizeImportHistory(value),
        );
      },
    });
  }

  app.storage = Object.freeze({
    createStorage,
    createDatasetStorage,
  });
})(globalThis);
