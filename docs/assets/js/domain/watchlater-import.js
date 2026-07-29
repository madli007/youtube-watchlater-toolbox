(function registerWatchLaterImportModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};

  function isValidUtcTimestamp(value) {
    if (typeof value !== "string") return false;
    const match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/,
    );
    if (!match) return false;

    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return false;
    const milliseconds = Number((match[7] || "").padEnd(3, "0"));
    return parsed.getUTCFullYear() === Number(match[1])
      && parsed.getUTCMonth() + 1 === Number(match[2])
      && parsed.getUTCDate() === Number(match[3])
      && parsed.getUTCHours() === Number(match[4])
      && parsed.getUTCMinutes() === Number(match[5])
      && parsed.getUTCSeconds() === Number(match[6])
      && parsed.getUTCMilliseconds() === milliseconds;
  }

  function normalizeWatchLaterPayload(payload, importedAt = new Date().toISOString()) {
    if (!isValidUtcTimestamp(importedAt)) {
      throw new Error("The import time must be a valid ISO 8601 UTC timestamp.");
    }

    if (Array.isArray(payload)) {
      return {
        videos: payload,
        schemaVersion: null,
        exportedAt: "",
        ageAnchorAt: importedAt,
        ageAnchorSource: "import",
      };
    }

    if (!payload || typeof payload !== "object") {
      throw new Error("Expected a Watch Later JSON array or versioned export object.");
    }
    if (payload.schemaVersion !== 1) {
      throw new Error(
        `Unsupported Watch Later export schema version: ${payload.schemaVersion ?? "missing"}. Expected version 1.`,
      );
    }
    if (!isValidUtcTimestamp(payload.exportedAt)) {
      throw new Error("Watch Later export has an invalid exportedAt value; expected an ISO 8601 UTC timestamp.");
    }
    if (!Array.isArray(payload.videos)) {
      throw new Error("Watch Later export must contain a videos array.");
    }

    return {
      videos: payload.videos,
      schemaVersion: 1,
      exportedAt: payload.exportedAt,
      ageAnchorAt: payload.exportedAt,
      ageAnchorSource: "export",
    };
  }

  app.domain.watchLaterImport = Object.freeze({
    isValidUtcTimestamp,
    normalizeWatchLaterPayload,
  });
})(globalThis);
