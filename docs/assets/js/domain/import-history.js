(function registerImportHistoryDomainModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};

  const {
    DEFAULT_IMPORT_HISTORY_LIMIT,
    MAX_IMPORT_HISTORY_LIMIT,
  } = app.config;
  const {
    createDatasetFingerprint,
    createStableFingerprint,
    dedupeVideos,
  } = app.domain.importComparison;
  const { getChannelKey } = app.domain.insights;

  function normalizeLimit(value, fallback = DEFAULT_IMPORT_HISTORY_LIMIT) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(MAX_IMPORT_HISTORY_LIMIT, Math.max(1, Math.floor(parsed)));
  }

  function finiteDurationOrNull(value) {
    if (value === null || value === "" || value === undefined) return null;
    const duration = Number(value);
    return Number.isFinite(duration) && duration >= 0 ? duration : null;
  }

  function createCompactImportVideo(video) {
    const videoId = String(video?.videoId || "").trim();
    const channelName = String(video?.channelName ?? video?.channel ?? "").trim() || "(unknown)";
    const channelUrl = String(video?.channelUrl || "").trim();
    return {
      videoId,
      channelKey: String(video?.channelKey || getChannelKey(channelUrl, channelName)),
      channelName,
      durationSeconds: finiteDurationOrNull(video?.durationSeconds),
    };
  }

  function compactVideos(videos) {
    return dedupeVideos(Array.isArray(videos) ? videos : [])
      .map(createCompactImportVideo)
      .filter(video => video.videoId)
      .sort((left, right) => left.videoId.localeCompare(right.videoId));
  }

  function normalizeSource(importContext) {
    const source = importContext && typeof importContext === "object"
      ? importContext
      : {};
    const rawSchemaVersion = source.sourceSchemaVersion;
    const schemaVersion = rawSchemaVersion === null
      || rawSchemaVersion === undefined
      || rawSchemaVersion === ""
      ? null
      : Number(rawSchemaVersion);
    return {
      fileName: typeof source.fileName === "string" ? source.fileName : "",
      schemaVersion: Number.isFinite(schemaVersion) ? schemaVersion : null,
      exportedAt: typeof source.sourceExportedAt === "string" ? source.sourceExportedAt : "",
      mode: typeof source.sourceMode === "string" ? source.sourceMode : "",
      ageAnchorAt: typeof source.ageAnchorAt === "string" ? source.ageAnchorAt : "",
    };
  }

  function createSnapshotId(source, datasetFingerprint) {
    return `import-${createStableFingerprint([
      source.fileName,
      source.schemaVersion,
      source.exportedAt,
      source.mode,
      datasetFingerprint,
    ])}`;
  }

  function createImportSnapshot(videos, importContext = {}) {
    const compact = compactVideos(videos);
    const source = normalizeSource(importContext);
    const datasetFingerprint = createDatasetFingerprint(videos);
    const importedAt = typeof importContext.importedAt === "string"
      ? importContext.importedAt
      : "";
    const knownDurations = compact
      .map(video => video.durationSeconds)
      .filter(duration => duration !== null);

    return {
      schemaVersion: 1,
      id: createSnapshotId(source, datasetFingerprint),
      importedAt,
      source,
      datasetFingerprint,
      videoCount: compact.length,
      knownDurationCount: knownDurations.length,
      totalDurationSeconds: knownDurations.reduce((total, duration) => total + duration, 0),
      videos: compact,
    };
  }

  function normalizeImportSnapshot(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || value.schemaVersion !== 1 || typeof value.id !== "string" || !value.id.trim()
      || !Array.isArray(value.videos)) {
      return null;
    }

    const videos = compactVideos(value.videos);
    const knownDurations = videos
      .map(video => video.durationSeconds)
      .filter(duration => duration !== null);
    const source = normalizeSource({
      fileName: value.source?.fileName,
      sourceSchemaVersion: value.source?.schemaVersion,
      sourceExportedAt: value.source?.exportedAt,
      sourceMode: value.source?.mode,
      ageAnchorAt: value.source?.ageAnchorAt,
    });
    return {
      schemaVersion: 1,
      id: value.id.trim(),
      importedAt: typeof value.importedAt === "string" ? value.importedAt : "",
      source,
      datasetFingerprint: typeof value.datasetFingerprint === "string"
        ? value.datasetFingerprint
        : createDatasetFingerprint(videos),
      videoCount: videos.length,
      knownDurationCount: knownDurations.length,
      totalDurationSeconds: knownDurations.reduce((total, duration) => total + duration, 0),
      videos,
    };
  }

  function normalizeImportHistory(value, limit = DEFAULT_IMPORT_HISTORY_LIMIT) {
    if (!Array.isArray(value)) return [];
    const normalizedLimit = normalizeLimit(limit);
    const byId = new Map();
    for (const candidate of value) {
      const snapshot = normalizeImportSnapshot(candidate);
      if (!snapshot) continue;
      if (byId.has(snapshot.id)) byId.delete(snapshot.id);
      byId.set(snapshot.id, snapshot);
    }
    return Array.from(byId.values()).slice(-normalizedLimit);
  }

  function appendImportSnapshot(history, videos, importContext, limit = DEFAULT_IMPORT_HISTORY_LIMIT) {
    const normalized = normalizeImportHistory(history, limit);
    const snapshot = createImportSnapshot(videos, importContext);
    const duplicate = normalized.find(candidate => candidate.id === snapshot.id) || null;
    if (duplicate) {
      return {
        history: normalized,
        snapshot: duplicate,
        added: false,
        duplicate: true,
      };
    }
    return {
      history: [...normalized, snapshot].slice(-normalizeLimit(limit)),
      snapshot,
      added: true,
      duplicate: false,
    };
  }

  app.domain.importHistory = Object.freeze({
    createCompactImportVideo,
    createImportSnapshot,
    normalizeImportSnapshot,
    normalizeImportHistory,
    appendImportSnapshot,
  });
})(globalThis);
