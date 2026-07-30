(function registerDomainModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};
    const { normalizeTags } = app.domain.decisions;

    function dedupeVideos(videos) {
      const byId = new Map();
      for (const video of videos) {
        if (!video || !video.videoId) continue;
        byId.set(video.videoId, video);
      }
      return Array.from(byId.values());
    }

    function createEmptyImportComparison() {
      return {
        baselineAvailable: false,
        comparedAt: "",
        previousImport: null,
        currentImport: null,
        newIds: [],
        removedVideos: [],
        decidedIds: [],
        changedIds: [],
        changedFieldsById: {},
        orphanedDecisionIds: [],
      };
    }

    function createVideoSnapshot(video) {
      const rawDurationSeconds = video?.durationSeconds;
      return {
        videoId: String(video?.videoId || ""),
        title: String(video?.title || ""),
        channel: String(video?.channel || ""),
        channelUrl: String(video?.channelUrl || ""),
        duration: String(video?.duration || ""),
        durationSeconds: rawDurationSeconds !== null && rawDurationSeconds !== "" && Number.isFinite(Number(rawDurationSeconds))
          ? Number(rawDurationSeconds)
          : null,
        badges: normalizeTags(video?.badges).sort(),
        isUnavailable: Boolean(video?.isUnavailable),
      };
    }

    function createDatasetBaseline(videos, lastImport) {
      return {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        lastImport: normalizePlainObject(lastImport),
        videos: dedupeVideos(Array.isArray(videos) ? videos : [])
          .map(createVideoSnapshot)
          .filter(video => video.videoId),
      };
    }

    function createStableFingerprint(parts) {
      let first = 0x811c9dc5;
      let second = 0x9e3779b9;
      const text = Array.from(parts || [], value => String(value ?? "")).join("\u001f");
      for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        first ^= code;
        first = Math.imul(first, 0x01000193);
        second ^= code + index;
        second = Math.imul(second, 0x85ebca6b);
      }
      return [first, second]
        .map(value => (value >>> 0).toString(16).padStart(8, "0"))
        .join("");
    }

    function createDatasetFingerprint(videos) {
      const byId = new Map();
      for (const video of Array.isArray(videos) ? videos : []) {
        const snapshot = createVideoSnapshot(video);
        if (!snapshot.videoId) continue;
        const serialized = JSON.stringify(snapshot);
        const previous = byId.get(snapshot.videoId);
        if (!previous || serialized > previous) byId.set(snapshot.videoId, serialized);
      }
      const rows = Array.from(byId.entries())
        .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
        .map(([, serialized]) => serialized);
      return createStableFingerprint(rows);
    }

    function getChangedMetadataFields(previousVideo, currentVideo) {
      const previous = createVideoSnapshot(previousVideo);
      const current = createVideoSnapshot(currentVideo);
      const fields = ["title", "channel", "channelUrl", "duration", "durationSeconds", "badges", "isUnavailable"];
      return fields.filter(field => JSON.stringify(previous[field]) !== JSON.stringify(current[field]));
    }

    function compareVideoDatasets(previousVideos, currentVideos, decisions = {}, previousImport = null, currentImport = null) {
      const comparison = createEmptyImportComparison();
      comparison.currentImport = normalizePlainObject(currentImport);
      comparison.previousImport = normalizePlainObject(previousImport);
      comparison.comparedAt = new Date().toISOString();
      comparison.baselineAvailable = Array.isArray(previousVideos);
      if (!comparison.baselineAvailable) return comparison;

      const previousById = new Map(dedupeVideos(previousVideos).map(video => [String(video.videoId), video]));
      const currentById = new Map(dedupeVideos(Array.isArray(currentVideos) ? currentVideos : []).map(video => [String(video.videoId), video]));
      comparison.newIds = Array.from(currentById.keys()).filter(videoId => !previousById.has(videoId));
      comparison.removedVideos = Array.from(previousById.entries())
        .filter(([videoId]) => !currentById.has(videoId))
        .map(([, video]) => createVideoSnapshot(video));
      comparison.decidedIds = Array.from(currentById.keys())
        .filter(videoId => Object.prototype.hasOwnProperty.call(decisions || {}, videoId));

      for (const [videoId, currentVideo] of currentById) {
        const previousVideo = previousById.get(videoId);
        if (!previousVideo) continue;
        const changedFields = getChangedMetadataFields(previousVideo, currentVideo);
        if (!changedFields.length) continue;
        comparison.changedIds.push(videoId);
        comparison.changedFieldsById[videoId] = changedFields;
      }

      comparison.orphanedDecisionIds = Object.keys(decisions || {}).filter(videoId => !currentById.has(videoId));
      return comparison;
    }

    function normalizeImportComparison(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return createEmptyImportComparison();
      const removedVideos = Array.isArray(value.removedVideos)
        ? value.removedVideos.map(createVideoSnapshot).filter(video => video.videoId)
        : [];
      const changedFieldsById = {};
      if (value.changedFieldsById && typeof value.changedFieldsById === "object" && !Array.isArray(value.changedFieldsById)) {
        for (const [videoId, fields] of Object.entries(value.changedFieldsById)) {
          changedFieldsById[videoId] = normalizeTags(fields);
        }
      }
      return {
        baselineAvailable: Boolean(value.baselineAvailable),
        comparedAt: typeof value.comparedAt === "string" ? value.comparedAt : "",
        previousImport: normalizePlainObject(value.previousImport),
        currentImport: normalizePlainObject(value.currentImport),
        newIds: normalizeTags(value.newIds),
        removedVideos,
        decidedIds: normalizeTags(value.decidedIds),
        changedIds: normalizeTags(value.changedIds),
        changedFieldsById,
        orphanedDecisionIds: normalizeTags(value.orphanedDecisionIds),
      };
    }

    function normalizePlainObject(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : null;
    }

  app.domain.importComparison = Object.freeze({
      dedupeVideos,
      createEmptyImportComparison,
      createVideoSnapshot,
      createDatasetBaseline,
      createStableFingerprint,
      createDatasetFingerprint,
      getChangedMetadataFields,
      compareVideoDatasets,
      normalizeImportComparison,
      normalizePlainObject,
  });
})(globalThis);
