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
    PREVIEW_PROGRESS_STORAGE_KEY,
  } = app.config;
  const { normalizeHistory } = app.domain.decisions;
  const {
    createVideoSnapshot,
    normalizePlainObject,
  } = app.domain.importComparison;
  const { normalizeTimeBudgetHours } = app.domain.timeBudget;
  const { normalizePreviewProgress } = app.domain.workspace;

  function getDefaultStorage() {
    try {
      return root.localStorage || null;
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
    });
  }

  app.storage = Object.freeze({
    createStorage,
    readJson,
    writeJson,
    writeText,
  });
})(globalThis);
