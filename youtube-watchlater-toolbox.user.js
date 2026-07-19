// ==UserScript==
// @name         YouTube Watch Later Toolbox
// @namespace    https://tampermonkey.net/
// @version      0.7.0
// @description  Export, preview, and safely execute Watch Later cleanup plans.
// @author       You
// @include      https://www.youtube.com/playlist?list=WL*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
  "use strict";

  const CONFIG = {
    scrollDelayMs: 1200,
    maxStableRounds: 3,
    maxLoadMs: 10 * 60 * 1000,
    settleDelayMs: 900,
    toolboxId: "yt-watchlater-toolbox",
    stylesId: "yt-watchlater-toolbox-styles",
    executionStorageKey: "ytwlt-delete-execution-v1",
    defaultDeleteDelayMs: 2500,
    deleteActionTimeoutMs: 10000,
    menuOpenTimeoutMs: 5000,
  };

  const SELECTORS = {
    video: "ytd-playlist-video-renderer",
    title: "#video-title",
    channel: "ytd-channel-name a, #channel-name a",
    duration: "ytd-thumbnail-overlay-time-status-renderer span",
    metadata: "#metadata-line, ytd-video-meta-block #metadata-line",
    metadataBlock: "ytd-video-meta-block, #meta, #metadata",
    thumbnail: "ytd-thumbnail img",
    badge: "ytd-badge-supported-renderer",
    loading: "ytd-continuation-item-renderer, tp-yt-paper-spinner, ytd-playlist-video-list-renderer #spinner",
  };

  const ICONS = {
    toolbox: "\u25A3",
    load: "\u25B6",
    csv: "\u21E9",
    json: "{}",
    all: "\u21F2",
    import: "\u21E7",
    report: "\u2637",
    delete: "\u232B",
    pause: "\u2016",
    resume: "\u25B6",
    stop: "\u25A0",
    clear: "\u00D7",
    done: "\u2713",
    loading: "\u2026",
    warning: "!",
    collapse: "\u2212",
    expand: "+",
  };

  const previewState = {
    mode: "",
    scope: "",
    keepIds: new Set(),
    maybeIds: new Set(),
    scopedIds: new Set(),
    scopedStatuses: new Map(),
    importedAt: "",
    lastSummary: null,
  };

  const executionState = {
    run: loadStoredExecutionRun(),
    workerActive: false,
    pauseRequested: false,
    stopRequested: false,
  };

  function isWatchLaterPage() {
    return window.location.pathname === "/playlist" && window.location.search.includes("list=WL");
  }

  function normalizeYouTubeUrl(href) {
    if (!href) return "";
    try {
      return new URL(href, window.location.origin).toString();
    } catch (_error) {
      return "";
    }
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function metadataSeparatorPattern() {
    return new RegExp(`\\s*[${String.fromCharCode(0x2022)}${String.fromCharCode(0x00B7)}]\\s*`);
  }

  function getTextLines(element) {
    return String(element?.innerText || element?.textContent || "")
      .split(/\r?\n/)
      .map(line => cleanText(line))
      .filter(Boolean);
  }

  function splitMetadataText(value) {
    return cleanText(value)
      .split(metadataSeparatorPattern())
      .map(part => cleanText(part))
      .filter(Boolean);
  }

  function looksLikeViews(value) {
    return /\b(view|views|ogled|ogledov|ogledi)\b/i.test(value);
  }

  function looksLikeUploaded(value) {
    return /\b(ago|pred|hour|hours|day|days|week|weeks|month|months|year|years|uro|urami|dnev|tedn|mesec|let)\b/i.test(value);
  }

  function parseLocalizedNumber(value) {
    const numberText = cleanText(value).match(/[\d.,]+/)?.[0];
    if (!numberText) return null;

    const normalized = numberText.includes(",") && numberText.includes(".")
      ? numberText.replace(/\./g, "").replace(",", ".")
      : numberText.replace(",", ".");
    const number = Number(normalized);

    return Number.isFinite(number) ? number : null;
  }

  function parseViewCountApprox(value) {
    const text = cleanText(value).toLowerCase();
    const number = parseLocalizedNumber(text);
    if (number === null) return null;

    if (/\b(tis|k)\b/.test(text)) return Math.round(number * 1000);
    if (/\b(mio|m|million|millions)\b/.test(text)) return Math.round(number * 1000000);
    if (/\b(billion|billions|b)\b/.test(text)) return Math.round(number * 1000000000);

    return Math.round(number);
  }

  function buildSearchText(parts) {
    return parts
      .map(part => cleanText(part).toLowerCase())
      .filter(Boolean)
      .join(" ");
  }

  function getMetadataParts(video, metaEl, channel) {
    const spanParts = metaEl
      ? Array.from(metaEl.querySelectorAll("span")).map(span => cleanText(span.textContent)).filter(Boolean)
      : [];

    if (spanParts.length >= 2) return spanParts;

    const candidates = [];
    if (metaEl) candidates.push(...getTextLines(metaEl));

    const metadataBlock = video.querySelector(SELECTORS.metadataBlock);
    if (metadataBlock) candidates.push(...getTextLines(metadataBlock));

    candidates.push(...getTextLines(video));

    for (const candidate of candidates) {
      if (!metadataSeparatorPattern().test(candidate)) continue;

      const parts = splitMetadataText(candidate);
      const withoutChannel = parts[0] === channel ? parts.slice(1) : parts;
      const viewIndex = withoutChannel.findIndex(looksLikeViews);
      const uploadedIndex = withoutChannel.findIndex(looksLikeUploaded);

      if (viewIndex !== -1 || uploadedIndex !== -1) {
        return withoutChannel;
      }
    }

    return spanParts;
  }

  function parseDurationSeconds(duration) {
    const parts = cleanText(duration).split(":").map(part => Number(part));
    if (!parts.length || parts.some(part => Number.isNaN(part))) return null;

    return parts.reduce((total, part) => (total * 60) + part, 0);
  }

  function parseTimeSeconds(value) {
    const time = cleanText(value);
    if (!time) return null;

    if (/^\d+$/.test(time)) return Number(time);

    const match = time.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (!match) return null;

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  function parseWatchUrl(url) {
    if (!url) {
      return {
        videoId: "",
        playlistId: "",
        playlistIndex: null,
        startTimeSeconds: null,
        cleanUrl: "",
      };
    }

    try {
      const parsed = new URL(url);
      const videoId = parsed.searchParams.get("v") || "";
      const playlistId = parsed.searchParams.get("list") || "";
      const playlistIndex = parsed.searchParams.has("index")
        ? Number(parsed.searchParams.get("index"))
        : null;
      const startTimeSeconds = parseTimeSeconds(parsed.searchParams.get("t") || "");
      const cleanUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;

      return {
        videoId,
        playlistId,
        playlistIndex: Number.isFinite(playlistIndex) ? playlistIndex : null,
        startTimeSeconds,
        cleanUrl,
      };
    } catch (_error) {
      return {
        videoId: "",
        playlistId: "",
        playlistIndex: null,
        startTimeSeconds: null,
        cleanUrl: url,
      };
    }
  }

  function getImageUrl(imageEl) {
    if (!imageEl) return "";
    return imageEl.currentSrc || imageEl.src || imageEl.getAttribute("data-thumb") || "";
  }

  function getThumbnailUrl(imageEl, videoId) {
    return getImageUrl(imageEl) || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");
  }

  function getLoadedVideos() {
    return Array.from(document.querySelectorAll(SELECTORS.video))
      .map((video, index) => extractVideoData(video, index))
      .filter(Boolean);
  }

  function getLoadedVideoItems() {
    return Array.from(document.querySelectorAll(SELECTORS.video))
      .map((element, index) => ({
        element,
        data: extractVideoData(element, index),
      }))
      .filter(item => item.data);
  }

  function extractVideoData(video, index) {
    const titleEl = video.querySelector(SELECTORS.title);
    const channelEl = video.querySelector(SELECTORS.channel);
    const durationEl = video.querySelector(SELECTORS.duration);
    const metaEl = video.querySelector(SELECTORS.metadata);
    const thumbnailEl = video.querySelector(SELECTORS.thumbnail);
    const href = titleEl?.getAttribute("href") || "";
    const channelHref = channelEl?.getAttribute("href") || "";
    const channel = cleanText(channelEl?.textContent);
    const metadataParts = getMetadataParts(video, metaEl, channel);
    const views = metadataParts.find(looksLikeViews) || metadataParts[0] || "";
    const uploaded = metadataParts.find(looksLikeUploaded) || metadataParts[1] || "";
    const badges = Array.from(video.querySelectorAll(SELECTORS.badge))
      .map(badge => cleanText(badge.textContent))
      .filter(Boolean);
    const url = normalizeYouTubeUrl(href);
    const watchUrl = parseWatchUrl(url);
    const duration = cleanText(durationEl?.textContent);
    const title = cleanText(titleEl?.textContent);
    const thumbnailUrl = getThumbnailUrl(thumbnailEl, watchUrl.videoId);

    if (!titleEl && !url) return null;

    return {
      index: index + 1,
      playlistIndex: watchUrl.playlistIndex || index + 1,
      videoId: watchUrl.videoId,
      title,
      channel,
      channelUrl: normalizeYouTubeUrl(channelHref),
      url,
      cleanUrl: watchUrl.cleanUrl,
      embedUrl: watchUrl.videoId ? `https://www.youtube.com/embed/${watchUrl.videoId}` : "",
      playlistId: watchUrl.playlistId,
      startTimeSeconds: watchUrl.startTimeSeconds,
      duration,
      durationSeconds: parseDurationSeconds(duration),
      thumbnailUrl,
      views,
      viewCountApprox: parseViewCountApprox(views),
      uploaded,
      metadataText: metadataParts.join(` ${String.fromCharCode(0x2022)} `),
      metadata: metadataParts,
      badges,
      searchText: buildSearchText([title, channel, views, uploaded, duration]),
      isUnavailable: !cleanText(titleEl?.textContent) || /private|deleted|unavailable/i.test(cleanText(video.textContent)),
    };
  }

  function buildCsv(videos) {
    const rows = [
      ["Index", "Video ID", "Title", "Channel", "URL", "Duration", "Duration Seconds", "Views", "View Count Approx", "Uploaded"],
      ...videos.map(video => [
        video.index,
        video.videoId,
        video.title,
        video.channel,
        video.cleanUrl || video.url,
        video.duration,
        video.durationSeconds ?? "",
        video.views,
        video.viewCountApprox ?? "",
        video.uploaded,
      ]),
    ];

    return rows
      .map(row => row
        .map(field => `"${String(field ?? "").replace(/"/g, '""')}"`)
        .join(","))
      .join("\n");
  }

  function getDateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    const videos = getLoadedVideos();
    setCount();
    if (!videos.length) {
      setStatus(`${ICONS.warning} No loaded videos found.`);
      return;
    }

    downloadText(
      `watchlater_export_${getDateStamp()}.csv`,
      `\uFEFF${buildCsv(videos)}`,
      "text/csv;charset=utf-8",
    );
    setStatus(`${ICONS.done} Exported ${videos.length} videos to CSV.`);
  }

  function exportJson() {
    const videos = getLoadedVideos();
    setCount();
    if (!videos.length) {
      setStatus(`${ICONS.warning} No loaded videos found.`);
      return;
    }

    downloadText(
      `watchlater_export_${getDateStamp()}.json`,
      JSON.stringify(videos, null, 2),
      "application/json;charset=utf-8",
    );
    setStatus(`${ICONS.done} Exported ${videos.length} videos to JSON.`);
  }

  function isYouTubeLoadingMore() {
    return Array.from(document.querySelectorAll(SELECTORS.loading))
      .some(element => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function loadAllVideos(onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let lastHeight = 0;
      let lastCount = 0;
      let stableRounds = 0;

      const interval = window.setInterval(() => {
        if (Date.now() - startedAt > CONFIG.maxLoadMs) {
          window.clearInterval(interval);
          reject(new Error("Timed out while loading videos."));
          return;
        }

        const videos = getLoadedVideos();
        const loadedCount = videos.length;
        const newHeight = document.documentElement.scrollHeight;
        const isLoading = isYouTubeLoadingMore();

        onProgress({
          loadedCount,
          stableRounds,
          isLoading,
        });

        if (newHeight !== lastHeight || loadedCount !== lastCount || isLoading) {
          lastHeight = newHeight;
          lastCount = loadedCount;
          stableRounds = 0;
          window.scrollTo(0, document.documentElement.scrollHeight);
          return;
        }

        stableRounds++;
        window.scrollTo(0, document.documentElement.scrollHeight);

        if (stableRounds >= CONFIG.maxStableRounds) {
          window.clearInterval(interval);
          wait(CONFIG.settleDelayMs).then(() => resolve(getLoadedVideos()));
        }
      }, CONFIG.scrollDelayMs);

      window.scrollTo(0, document.documentElement.scrollHeight);
    });
  }

  async function exportAll(format) {
    const label = format.toUpperCase();
    setBusy(true);
    setStatus(`${ICONS.loading} Loading all videos before ${label} export...`);

    try {
      const videos = await loadAllVideos(({ loadedCount, isLoading }) => {
        setCount();
        setStatus(`${ICONS.loading} Loading all videos... ${loadedCount} found${isLoading ? ", still fetching" : ""}`);
      });

      setCount();

      if (!videos.length) {
        setStatus(`${ICONS.warning} No loaded videos found.`);
        return;
      }

      if (format === "csv") {
        downloadText(
          `watchlater_export_all_${getDateStamp()}.csv`,
          `\uFEFF${buildCsv(videos)}`,
          "text/csv;charset=utf-8",
        );
      } else {
        downloadText(
          `watchlater_export_all_${getDateStamp()}.json`,
          JSON.stringify(videos, null, 2),
          "application/json;charset=utf-8",
        );
      }

      setStatus(`${ICONS.done} Exported all ${videos.length} videos to ${label}.`);
    } catch (error) {
      setStatus(`${ICONS.warning} ${error.message || "Export all failed."}`);
    } finally {
      setBusy(false);
    }
  }

  function importPreviewJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;

      setBusy(true);
      setStatus(`${ICONS.loading} Importing triage JSON...`);

      try {
        const payload = JSON.parse(await file.text());
        const parsed = parsePreviewPayload(payload);

        previewState.mode = parsed.mode;
        previewState.scope = parsed.scope || "";
        previewState.keepIds = parsed.keepIds;
        previewState.maybeIds = parsed.maybeIds;
        previewState.scopedIds = parsed.scopedIds;
        previewState.scopedStatuses = parsed.scopedStatuses;
        previewState.importedAt = new Date().toISOString();

        const summary = runImportedPreview();
        setCount(summary.loaded);
        setStatus(formatPreviewSummary(summary));
      } catch (error) {
        clearPreview();
        setStatus(`${ICONS.warning} ${error.message || "Import failed."}`);
      } finally {
        setBusy(false);
      }
    }, { once: true });

    input.click();
  }

  function parsePreviewPayload(payload) {
    if (payload?.mode === "delete-execution-report") return parseExecutionReportPayload(payload);
    if (payload?.mode === "scoped-videos") return parseScopedPayload(payload);
    return parseKeepMaybePayload(payload);
  }

  function parseExecutionReportPayload(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.failures)) {
      throw new Error("Invalid delete execution report.");
    }

    const scopedIds = new Set(payload.failures.map(readVideoId).filter(Boolean));
    if (!scopedIds.size) {
      throw new Error("The execution report has no failed video IDs to retry.");
    }

    return {
      mode: "retry-failures",
      scope: `retry ${cleanText(payload.runId || "failures")}`,
      keepIds: new Set(),
      maybeIds: new Set(),
      scopedIds,
      scopedStatuses: new Map([...scopedIds].map(videoId => [videoId, "delete"])),
    };
  }

  function parseKeepMaybePayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid keep/maybe JSON.");
    }

    const keep = Array.isArray(payload.keep) ? payload.keep : [];
    const maybe = Array.isArray(payload.maybe) ? payload.maybe : [];
    const keepIds = new Set(keep.map(readVideoId).filter(Boolean));
    const maybeIds = new Set(maybe.map(readVideoId).filter(Boolean));

    if (!keepIds.size && !maybeIds.size) {
      throw new Error("No keep/maybe video IDs found.");
    }

    return {
      mode: "keep-maybe",
      scope: "",
      keepIds,
      maybeIds,
      scopedIds: new Set(),
      scopedStatuses: new Map(),
    };
  }

  function parseScopedPayload(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.videos)) {
      throw new Error("Invalid scoped JSON.");
    }

    const scopedIds = new Set();
    const scopedStatuses = new Map();

    for (const video of payload.videos) {
      const videoId = readVideoId(video);
      if (!videoId) continue;
      scopedIds.add(videoId);
      scopedStatuses.set(videoId, cleanText(video.status || "unreviewed") || "unreviewed");
    }

    if (!scopedIds.size) {
      throw new Error("No scoped video IDs found.");
    }

    return {
      mode: "scoped",
      scope: cleanText(payload.scope || "videos"),
      keepIds: new Set(),
      maybeIds: new Set(),
      scopedIds,
      scopedStatuses,
    };
  }

  function readVideoId(item) {
    if (typeof item === "string") return cleanText(item);
    return cleanText(item?.videoId);
  }

  function runImportedPreview() {
    if (previewState.mode === "scoped" || previewState.mode === "retry-failures") return runScopedPreview();
    return runKeepMaybeDryRun();
  }

  function runKeepMaybeDryRun() {
    clearPreviewClasses();

    const items = getLoadedVideoItems();
    const keepIds = previewState.keepIds;
    const maybeIds = previewState.maybeIds;
    const protectedIds = new Set([...keepIds, ...maybeIds]);
    const loadedIds = new Set();
    const summary = {
      mode: "keep-maybe",
      loaded: items.length,
      importedKeep: keepIds.size,
      importedMaybe: maybeIds.size,
      protectedLoaded: 0,
      keepLoaded: 0,
      maybeLoaded: 0,
      deleteCandidates: 0,
      unknown: 0,
      missingProtected: 0,
    };

    for (const item of items) {
      const { element, data } = item;
      const id = data.videoId;

      if (!id) {
        summary.unknown++;
        element.classList.add("ytwlt-preview-unknown");
        continue;
      }

      loadedIds.add(id);

      if (keepIds.has(id)) {
        summary.keepLoaded++;
        summary.protectedLoaded++;
        element.classList.add("ytwlt-preview-protected", "ytwlt-preview-keep");
      } else if (maybeIds.has(id)) {
        summary.maybeLoaded++;
        summary.protectedLoaded++;
        element.classList.add("ytwlt-preview-protected", "ytwlt-preview-maybe");
      } else {
        summary.deleteCandidates++;
        element.classList.add("ytwlt-preview-delete-candidate");
      }
    }

    summary.missingProtected = [...protectedIds].filter(id => !loadedIds.has(id)).length;
    previewState.lastSummary = summary;
    return summary;
  }

  function runScopedPreview() {
    clearPreviewClasses();

    const items = getLoadedVideoItems();
    const scopedIds = previewState.scopedIds;
    const scopedStatuses = previewState.scopedStatuses;
    const loadedIds = new Set();
    const summary = {
      mode: previewState.mode,
      scope: previewState.scope || "videos",
      loaded: items.length,
      imported: scopedIds.size,
      matched: 0,
      missingImported: 0,
      loadedNotInImport: 0,
      unknown: 0,
      matchedByStatus: {
        keep: 0,
        maybe: 0,
        delete: 0,
        unreviewed: 0,
      },
    };

    for (const item of items) {
      const { element, data } = item;
      const id = data.videoId;

      if (!id) {
        summary.unknown++;
        element.classList.add("ytwlt-preview-unknown");
        continue;
      }

      loadedIds.add(id);

      if (!scopedIds.has(id)) {
        summary.loadedNotInImport++;
        continue;
      }

      summary.matched++;
      element.classList.add("ytwlt-preview-scoped");

      const status = scopedStatuses.get(id) || "unreviewed";
      if (status === "keep") {
        summary.matchedByStatus.keep++;
        element.classList.add("ytwlt-preview-keep");
      } else if (status === "maybe") {
        summary.matchedByStatus.maybe++;
        element.classList.add("ytwlt-preview-maybe");
      } else if (status === "delete") {
        summary.matchedByStatus.delete++;
        element.classList.add("ytwlt-preview-delete-candidate");
      } else {
        summary.matchedByStatus.unreviewed++;
      }
    }

    summary.missingImported = [...scopedIds].filter(id => !loadedIds.has(id)).length;
    previewState.lastSummary = summary;
    return summary;
  }

  function formatPreviewSummary(summary) {
    if (summary.mode === "scoped" || summary.mode === "retry-failures") return formatScopedSummary(summary);
    return formatKeepMaybeSummary(summary);
  }

  function formatKeepMaybeSummary(summary) {
    return [
      `${ICONS.done} Keep/maybe dry run`,
      `Loaded: ${summary.loaded}`,
      `Protected loaded: ${summary.protectedLoaded} (${summary.keepLoaded} keep, ${summary.maybeLoaded} maybe)`,
      `Delete candidates: ${summary.deleteCandidates}`,
      `Unknown/no ID: ${summary.unknown}`,
      `Missing protected IDs: ${summary.missingProtected}`,
    ].join("\n");
  }

  function formatScopedSummary(summary) {
    return [
      `${ICONS.done} ${summary.mode === "retry-failures" ? "Retry failures" : "Scoped import"} preview (${summary.scope})`,
      `Loaded: ${summary.loaded}`,
      `Imported scoped videos: ${summary.imported}`,
      `Matched loaded: ${summary.matched}`,
      `Matched statuses: ${summary.matchedByStatus.keep} keep, ${summary.matchedByStatus.maybe} maybe, ${summary.matchedByStatus.delete} delete, ${summary.matchedByStatus.unreviewed} unreviewed`,
      `Missing imported IDs: ${summary.missingImported}`,
      `Loaded not in import: ${summary.loadedNotInImport}`,
      `Unknown/no ID: ${summary.unknown}`,
    ].join("\n");
  }

  function clearPreview() {
    previewState.mode = "";
    previewState.scope = "";
    previewState.keepIds = new Set();
    previewState.maybeIds = new Set();
    previewState.scopedIds = new Set();
    previewState.scopedStatuses = new Map();
    previewState.importedAt = "";
    previewState.lastSummary = null;
    clearPreviewClasses();
    setCount();
    setStatus("Preview cleared.");
  }

  function exportDryRunReport() {
    if (!previewState.lastSummary) {
      setStatus(`${ICONS.warning} No active preview to export.`);
      return;
    }

    const report = buildDryRunReport();
    downloadText(
      `watchlater_preview_report_${getDateStamp()}.json`,
      JSON.stringify(report, null, 2),
      "application/json;charset=utf-8",
    );
    setStatus(`${ICONS.done} Exported preview report.`);
  }

  function buildDryRunReport() {
    if (previewState.mode === "scoped" || previewState.mode === "retry-failures") return buildScopedReport();

    const items = getLoadedVideoItems();
    const keepIds = previewState.keepIds;
    const maybeIds = previewState.maybeIds;
    const protectedIds = new Set([...keepIds, ...maybeIds]);
    const loadedIds = new Set();
    const keep = [];
    const maybe = [];
    const deleteCandidates = [];
    const unknown = [];

    for (const item of items) {
      const video = item.data;
      if (!video.videoId) {
        unknown.push(video);
        continue;
      }

      loadedIds.add(video.videoId);

      if (keepIds.has(video.videoId)) {
        keep.push(video);
      } else if (maybeIds.has(video.videoId)) {
        maybe.push(video);
      } else {
        deleteCandidates.push(video);
      }
    }

    const missingProtectedIds = [...protectedIds].filter(id => !loadedIds.has(id));

    return {
      schemaVersion: 1,
      source: "youtube-watchlater-toolbox",
      mode: "keep-maybe-dry-run",
      exportedAt: new Date().toISOString(),
      importedAt: previewState.importedAt,
      summary: {
        ...previewState.lastSummary,
        missingProtectedIds: missingProtectedIds.length,
      },
      imported: {
        keepIds: [...keepIds],
        maybeIds: [...maybeIds],
      },
      loaded: {
        keep,
        maybe,
        deleteCandidates,
        unknown,
      },
      missingProtectedIds,
    };
  }

  function buildScopedReport() {
    const items = getLoadedVideoItems();
    const scopedIds = previewState.scopedIds;
    const scopedStatuses = previewState.scopedStatuses;
    const loadedIds = new Set();
    const matched = [];
    const loadedNotInImport = [];
    const unknown = [];

    for (const item of items) {
      const video = item.data;
      if (!video.videoId) {
        unknown.push(video);
        continue;
      }

      loadedIds.add(video.videoId);

      if (scopedIds.has(video.videoId)) {
        matched.push({
          ...video,
          importedStatus: scopedStatuses.get(video.videoId) || "unreviewed",
        });
      } else {
        loadedNotInImport.push(video);
      }
    }

    const missingImportedIds = [...scopedIds].filter(id => !loadedIds.has(id));

    return {
      schemaVersion: 1,
      source: "youtube-watchlater-toolbox",
      mode: previewState.mode === "retry-failures" ? "retry-failures-preview" : "scoped-preview",
      scope: previewState.scope || "videos",
      exportedAt: new Date().toISOString(),
      importedAt: previewState.importedAt,
      summary: {
        ...previewState.lastSummary,
        missingImportedIds: missingImportedIds.length,
      },
      imported: {
        videoIds: [...scopedIds],
        statuses: Object.fromEntries(scopedStatuses),
      },
      loaded: {
        matched,
        loadedNotInImport,
        unknown,
      },
      missingImportedIds,
    };
  }

  function loadStoredExecutionRun() {
    try {
      const raw = window.localStorage.getItem(CONFIG.executionStorageKey);
      if (!raw) return null;
      const run = JSON.parse(raw);
      if (!run || !Array.isArray(run.targetVideoIds) || !run.runId) return null;
      return run;
    } catch (_error) {
      return null;
    }
  }

  function saveExecutionRun() {
    if (!executionState.run) return;
    executionState.run.updatedAt = new Date().toISOString();
    try {
      window.localStorage.setItem(CONFIG.executionStorageKey, JSON.stringify(executionState.run));
    } catch (error) {
      throw new Error(`Could not save delete progress: ${error.message || "localStorage failed"}`);
    }
  }

  function clearStoredExecutionRun() {
    if (executionState.workerActive) {
      setStatus(`${ICONS.warning} Stop the active delete run before clearing it.`);
      return;
    }
    if (executionState.run && !window.confirm("Clear the saved delete run and its local progress log?")) return;
    executionState.run = null;
    window.localStorage.removeItem(CONFIG.executionStorageKey);
    updateExecutionControls();
    setStatus("Saved delete run cleared.");
  }

  function getExecutionMode() {
    if (previewState.mode === "scoped") return "delete-explicit";
    if (previewState.mode === "keep-maybe") return "delete-not-protected";
    if (previewState.mode === "retry-failures") return "retry-failures-only";
    return "";
  }

  function isExplicitDeleteTarget(videoId) {
    if (previewState.mode === "keep-maybe") {
      return !previewState.keepIds.has(videoId) && !previewState.maybeIds.has(videoId);
    }
    return previewState.scopedIds.has(videoId) && previewState.scopedStatuses.get(videoId) === "delete";
  }

  function toExecutionVideo(video) {
    return {
      videoId: video.videoId,
      title: video.title,
      channel: video.channel,
      url: video.cleanUrl || video.url,
      playlistIndex: video.playlistIndex,
      isUnavailable: video.isUnavailable,
    };
  }

  function buildExecutionPreparation() {
    const mode = getExecutionMode();
    if (!mode) throw new Error("Import and review a triage JSON before deleting.");

    const items = getLoadedVideoItems();
    const loadedIds = new Set(items.map(item => item.data.videoId).filter(Boolean));
    const targets = [];
    const excluded = [];
    const seenIds = new Set();

    for (let index = items.length - 1; index >= 0; index--) {
      const video = items[index].data;
      if (!video.videoId) {
        if (mode === "delete-not-protected") excluded.push({ reason: "unknown-video-id", video: toExecutionVideo(video) });
        continue;
      }
      if (!isExplicitDeleteTarget(video.videoId) || seenIds.has(video.videoId)) continue;
      seenIds.add(video.videoId);

      if (video.isUnavailable) {
        excluded.push({ videoId: video.videoId, reason: "unavailable-video", video: toExecutionVideo(video) });
        continue;
      }
      targets.push(toExecutionVideo(video));
    }

    if (mode !== "delete-not-protected") {
      for (const videoId of previewState.scopedIds) {
        if (previewState.scopedStatuses.get(videoId) === "delete" && !loadedIds.has(videoId)) {
          excluded.push({ videoId, reason: "not-found-after-load" });
        }
      }
    }

    return {
      mode,
      loadedVideos: items.map(item => item.data),
      targets,
      excluded,
    };
  }

  function getTimestampForFilename() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  function readExecutionSettings() {
    const delayInput = document.querySelector(`#${CONFIG.toolboxId} [data-delete-delay]`);
    const pauseEveryInput = document.querySelector(`#${CONFIG.toolboxId} [data-pause-every]`);
    const delaySeconds = Number(delayInput?.value);
    const pauseEvery = Number.parseInt(pauseEveryInput?.value || "0", 10);

    return {
      delayMs: Number.isFinite(delaySeconds)
        ? Math.max(1000, Math.round(delaySeconds * 1000))
        : CONFIG.defaultDeleteDelayMs,
      pauseEvery: Number.isFinite(pauseEvery) ? Math.max(0, pauseEvery) : 0,
    };
  }

  function exportBackupAndPlan(preparation, settings) {
    const timestamp = getTimestampForFilename();
    const exportedAt = new Date().toISOString();
    const backup = {
      schemaVersion: 1,
      source: "youtube-watchlater-toolbox",
      mode: "pre-delete-backup",
      exportedAt,
      videos: preparation.loadedVideos,
    };
    const plan = {
      schemaVersion: 1,
      source: "youtube-watchlater-toolbox",
      mode: "delete-execution-plan",
      executionMode: preparation.mode,
      exportedAt,
      importedAt: previewState.importedAt,
      scope: previewState.scope,
      settings,
      counts: {
        loaded: preparation.loadedVideos.length,
        targets: preparation.targets.length,
        excluded: preparation.excluded.length,
      },
      targets: preparation.targets,
      excluded: preparation.excluded,
    };

    downloadText(
      `watchlater_pre_delete_backup_${timestamp}.json`,
      JSON.stringify(backup, null, 2),
      "application/json;charset=utf-8",
    );
    downloadText(
      `watchlater_execution_plan_${timestamp}.json`,
      JSON.stringify(plan, null, 2),
      "application/json;charset=utf-8",
    );
    return plan;
  }

  async function prepareAndStartDeleteExecution() {
    if (executionState.workerActive) return;
    if (!previewState.lastSummary) {
      setStatus(`${ICONS.warning} Import and review a triage JSON first.`);
      return;
    }
    if (executionState.run) {
      setStatus(`${ICONS.warning} Export if needed, then clear the saved delete run before starting a new one.`);
      return;
    }

    setBusy(true);
    setStatus(`${ICONS.loading} Loading the full playlist before preparing deletion...`);

    try {
      await loadAllVideos(({ loadedCount, isLoading }) => {
        setCount();
        setStatus(`${ICONS.loading} Loading all videos... ${loadedCount} found${isLoading ? ", still fetching" : ""}`);
      });
      const summary = runImportedPreview();
      setCount(summary.loaded);

      const preparation = buildExecutionPreparation();
      const settings = readExecutionSettings();
      if (!preparation.targets.length) {
        setStatus(`${ICONS.warning} No safe, loaded delete targets were found. ${preparation.excluded.length} item(s) were excluded.`);
        return;
      }

      const plan = exportBackupAndPlan(preparation, settings);
      const expected = `DELETE ${preparation.targets.length}`;
      const typed = window.prompt([
        `Backup and execution plan downloads were started.`,
        `Mode: ${preparation.mode}`,
        `Loaded videos: ${preparation.loadedVideos.length}`,
        `Delete targets: ${preparation.targets.length}`,
        `Safely excluded: ${preparation.excluded.length}`,
        `Type ${expected} to begin.`,
      ].join("\n"));

      if (typed !== expected) {
        setStatus(`${ICONS.warning} Delete cancelled. The required text did not match exactly.`);
        return;
      }

      const now = new Date().toISOString();
      executionState.run = {
        schemaVersion: 1,
        source: "youtube-watchlater-toolbox",
        mode: preparation.mode,
        runId: now,
        status: "running",
        targetVideoIds: preparation.targets.map(video => video.videoId),
        targets: preparation.targets,
        successes: [],
        failures: [],
        skipped: preparation.excluded,
        settings,
        importedAt: previewState.importedAt,
        scope: previewState.scope,
        planExportedAt: plan.exportedAt,
        startedAt: now,
        updatedAt: now,
        finishedAt: "",
      };
      saveExecutionRun();
      executionState.pauseRequested = false;
      executionState.stopRequested = false;
    } catch (error) {
      setStatus(`${ICONS.warning} ${error.message || "Could not prepare delete execution."}`);
      return;
    } finally {
      setBusy(false);
      updateExecutionControls();
    }

    await runDeleteWorker();
  }

  function getProcessedVideoIds(run) {
    return new Set([
      ...run.successes.map(readVideoId),
      ...run.failures.map(readVideoId),
      ...run.skipped.map(readVideoId),
    ].filter(Boolean));
  }

  function findLoadedVideoItem(videoId) {
    return getLoadedVideoItems().find(item => item.data.videoId === videoId) || null;
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  async function waitForValue(readValue, timeoutMs, errorMessage) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const value = readValue();
      if (value) return value;
      await wait(100);
    }
    throw new Error(errorMessage);
  }

  function findVideoMenuButton(videoElement) {
    const selectors = [
      "#menu ytd-menu-renderer yt-icon-button button",
      "#menu yt-icon-button button",
      "ytd-menu-renderer yt-icon-button button",
      "button[aria-label='Action menu']",
      "button[aria-label='Meni z dejanji']",
    ];
    for (const selector of selectors) {
      const button = Array.from(videoElement.querySelectorAll(selector)).find(isVisible);
      if (button) return button;
    }
    return null;
  }

  function getMenuItemLabel(item) {
    const labelElement = item.querySelector("yt-formatted-string, .yt-core-attributed-string, #label");
    return cleanText(labelElement?.textContent || item.textContent).toLowerCase();
  }

  function isRemoveFromWatchLaterLabel(label) {
    return [
      /^remove from watch later$/,
      /^remove from playlist$/,
      /^odstrani iz (?:[»„\"]?poznejši ogled[«“\"]?|[»„\"]?poznejšega ogleda[«“\"]?)$/,
      /^odstrani (?:iz|s) seznama (?:za )?[»„\"]?poznejš(?:i ogled|ega ogleda)[«“\"]?$/,
      /^odstrani (?:iz|s) seznama predvajanja$/,
    ].some(pattern => pattern.test(label));
  }

  function findExplicitRemoveMenuItem() {
    const selectors = [
      "ytd-menu-popup-renderer ytd-menu-service-item-renderer",
      "tp-yt-iron-dropdown ytd-menu-service-item-renderer",
      "ytd-menu-popup-renderer yt-list-item-view-model",
    ];
    const items = Array.from(document.querySelectorAll(selectors.join(","))).filter(isVisible);
    return items.find(item => isRemoveFromWatchLaterLabel(getMenuItemLabel(item))) || null;
  }

  function findVisibleYouTubeMenuPopup() {
    return Array.from(document.querySelectorAll("ytd-menu-popup-renderer, tp-yt-iron-dropdown"))
      .find(isVisible) || null;
  }

  async function closeOpenYouTubeMenu() {
    if (!findVisibleYouTubeMenuPopup()) return;
    const escapeEvent = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true });
    document.dispatchEvent(escapeEvent);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await waitForValue(
      () => !findVisibleYouTubeMenuPopup(),
      1500,
      "A previously open YouTube menu could not be closed safely.",
    );
  }

  async function removeVideoThroughYouTubeMenu(item, expectedVideoId) {
    const { element } = item;
    element.scrollIntoView({ block: "center", behavior: "auto" });
    await wait(250);

    const freshId = extractVideoData(element, 0)?.videoId;
    if (freshId !== expectedVideoId) {
      throw new Error("The playlist row changed before the action could be verified.");
    }

    await closeOpenYouTubeMenu();
    const menuButton = findVideoMenuButton(element);
    if (!menuButton) throw new Error("Could not find this video's YouTube action menu.");
    menuButton.click();

    let removeItem;
    try {
      removeItem = await waitForValue(
        findExplicitRemoveMenuItem,
        CONFIG.menuOpenTimeoutMs,
        "No explicitly recognized 'Remove from Watch later' menu action was found.",
      );
    } catch (error) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      throw error;
    }

    const verifiedId = extractVideoData(element, 0)?.videoId;
    if (verifiedId !== expectedVideoId) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      throw new Error("The playlist row changed while its action menu was open.");
    }

    removeItem.click();
    await waitForValue(
      () => !element.isConnected || extractVideoData(element, 0)?.videoId !== expectedVideoId,
      CONFIG.deleteActionTimeoutMs,
      "YouTube did not confirm removal by updating the playlist row in time.",
    );
  }

  function getRunProgress(run) {
    const processedIds = getProcessedVideoIds(run);
    const processedTargetIds = run.targetVideoIds.filter(videoId => processedIds.has(videoId));
    return {
      processed: processedTargetIds.length,
      total: run.targetVideoIds.length,
      remaining: run.targetVideoIds.filter(videoId => !processedIds.has(videoId)).length,
    };
  }

  function formatExecutionProgress(run, prefix = `${ICONS.loading} Deleting`) {
    const progress = getRunProgress(run);
    return [
      `${prefix}: ${progress.processed}/${progress.total} processed, ${progress.remaining} remaining`,
      `${run.successes.length} removed, ${run.failures.length} failed, ${run.skipped.length} skipped`,
    ].join("\n");
  }

  async function waitForExecutionDelay(delayMs) {
    const endsAt = Date.now() + delayMs;
    while (Date.now() < endsAt && !executionState.pauseRequested && !executionState.stopRequested) {
      await wait(Math.min(250, endsAt - Date.now()));
    }
  }

  async function runDeleteWorker() {
    const run = executionState.run;
    if (!run || executionState.workerActive) return;

    executionState.workerActive = true;
    run.status = "running";
    saveExecutionRun();
    updateExecutionControls();
    let processedThisSession = 0;

    try {
      for (const videoId of run.targetVideoIds) {
        if (getProcessedVideoIds(run).has(videoId)) continue;

        if (!isWatchLaterPage()) {
          pauseExecutionRun("Delete run paused because the Watch Later page is no longer open.");
          return;
        }

        if (executionState.stopRequested) {
          finalizeExecution("stopped");
          return;
        }
        if (executionState.pauseRequested) {
          pauseExecutionRun("Delete run paused.");
          return;
        }

        setStatus(formatExecutionProgress(run, `${ICONS.loading} Removing ${videoId}`));
        const attemptedAt = new Date().toISOString();
        const item = findLoadedVideoItem(videoId);

        if (!item) {
          run.skipped.push({ videoId, reason: "not-found-during-execution", attemptedAt });
        } else if (item.data.isUnavailable) {
          run.skipped.push({ videoId, reason: "unavailable-video", attemptedAt });
        } else {
          try {
            await removeVideoThroughYouTubeMenu(item, videoId);
            run.successes.push({ videoId, removedAt: new Date().toISOString() });
          } catch (error) {
            item.element.classList.add("ytwlt-execution-failed");
            run.failures.push({
              videoId,
              error: error.message || "Delete action failed.",
              attemptedAt,
            });
          }
        }

        processedThisSession++;
        saveExecutionRun();
        setStatus(formatExecutionProgress(run));

        if (run.settings.pauseEvery > 0 && processedThisSession % run.settings.pauseEvery === 0 && getRunProgress(run).remaining > 0) {
          pauseExecutionRun(`Automatic pause after ${processedThisSession} item(s).`);
          return;
        }

        if (executionState.stopRequested) {
          finalizeExecution("stopped");
          return;
        }
        if (executionState.pauseRequested) {
          pauseExecutionRun("Delete run paused.");
          return;
        }
        if (getRunProgress(run).remaining > 0) await waitForExecutionDelay(run.settings.delayMs);
      }

      finalizeExecution("completed");
    } catch (error) {
      run.status = "paused";
      saveExecutionRun();
      setStatus(`${ICONS.warning} Execution paused: ${error.message || "unexpected error"}`);
    } finally {
      executionState.workerActive = false;
      executionState.pauseRequested = false;
      executionState.stopRequested = false;
      updateExecutionControls();
    }
  }

  function pauseExecutionRun(message) {
    if (!executionState.run) return;
    executionState.run.status = "paused";
    saveExecutionRun();
    setStatus(`${ICONS.pause} ${message}\n${formatExecutionProgress(executionState.run, "Progress")}`);
  }

  function requestPauseExecution() {
    if (!executionState.workerActive) return;
    executionState.pauseRequested = true;
    setStatus(`${ICONS.pause} Pause requested; the current YouTube action will finish first.`);
    updateExecutionControls();
  }

  function requestStopExecution() {
    if (!executionState.run || ["completed", "stopped"].includes(executionState.run.status)) return;
    if (!window.confirm("Stop this delete run after the current YouTube action? Remaining targets will not be processed.")) return;
    executionState.stopRequested = true;
    if (!executionState.workerActive) finalizeExecution("stopped");
    else setStatus(`${ICONS.stop} Stop requested; the current YouTube action will finish first.`);
    updateExecutionControls();
  }

  async function resumeDeleteExecution() {
    if (!executionState.run || executionState.workerActive) return;
    if (!["paused", "running"].includes(executionState.run.status)) {
      setStatus(`${ICONS.warning} There is no paused delete run to resume.`);
      return;
    }

    setBusy(true);
    setStatus(`${ICONS.loading} Reloading the full playlist before resuming...`);
    try {
      await loadAllVideos(({ loadedCount, isLoading }) => {
        setCount();
        setStatus(`${ICONS.loading} Loading all videos... ${loadedCount} found${isLoading ? ", still fetching" : ""}`);
      });
      executionState.pauseRequested = false;
      executionState.stopRequested = false;
    } catch (error) {
      executionState.run.status = "paused";
      saveExecutionRun();
      setStatus(`${ICONS.warning} Could not resume: ${error.message || "loading failed"}`);
      return;
    } finally {
      setBusy(false);
      updateExecutionControls();
    }
    await runDeleteWorker();
  }

  function buildExecutionReport(run) {
    const progress = getRunProgress(run);
    return {
      schemaVersion: 1,
      source: "youtube-watchlater-toolbox",
      mode: "delete-execution-report",
      executionMode: run.mode,
      runId: run.runId,
      status: run.status,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      finishedAt: run.finishedAt,
      importedAt: run.importedAt,
      scope: run.scope,
      settings: run.settings,
      summary: {
        targets: run.targetVideoIds.length,
        processed: progress.processed,
        remaining: progress.remaining,
        removed: run.successes.length,
        failed: run.failures.length,
        skipped: run.skipped.length,
      },
      targetVideoIds: run.targetVideoIds,
      targets: run.targets,
      successes: run.successes,
      failures: run.failures,
      skipped: run.skipped,
      remainingVideoIds: run.targetVideoIds.filter(videoId => !getProcessedVideoIds(run).has(videoId)),
    };
  }

  function exportExecutionReport({ automatic = false } = {}) {
    const run = executionState.run;
    if (!run) {
      setStatus(`${ICONS.warning} No saved delete run to export.`);
      return;
    }
    downloadText(
      `watchlater_execution_report_${getTimestampForFilename()}.json`,
      JSON.stringify(buildExecutionReport(run), null, 2),
      "application/json;charset=utf-8",
    );
    if (!automatic) setStatus(`${ICONS.done} Exported delete execution report.`);
  }

  function finalizeExecution(status) {
    const run = executionState.run;
    if (!run) return;
    run.status = status;
    run.finishedAt = new Date().toISOString();
    saveExecutionRun();
    exportExecutionReport({ automatic: true });
    const label = status === "completed" ? `${ICONS.done} Delete run completed` : `${ICONS.stop} Delete run stopped`;
    setStatus(`${formatExecutionProgress(run, label)}\nExecution report download started.`);
    updateExecutionControls();
  }

  function updateExecutionControls() {
    const toolbox = document.getElementById(CONFIG.toolboxId);
    if (!toolbox) return;
    const run = executionState.run;
    const active = executionState.workerActive;
    const resumable = run && ["paused", "running"].includes(run.status) && !active;
    const unfinished = run && !["completed", "stopped"].includes(run.status);

    const executeButton = toolbox.querySelector("[data-execution-action='execute']");
    const pauseButton = toolbox.querySelector("[data-execution-action='pause']");
    const resumeButton = toolbox.querySelector("[data-execution-action='resume']");
    const stopButton = toolbox.querySelector("[data-execution-action='stop']");
    const reportButton = toolbox.querySelector("[data-execution-action='report']");
    const clearButton = toolbox.querySelector("[data-execution-action='clear']");

    toolbox.querySelectorAll(".ytwlt-button:not([data-execution-action])").forEach(button => {
      button.disabled = active;
    });
    toolbox.querySelectorAll(".ytwlt-execution-settings input").forEach(input => {
      input.disabled = active;
    });

    if (executeButton) executeButton.disabled = active || Boolean(run);
    if (pauseButton) pauseButton.disabled = !active || executionState.pauseRequested;
    if (resumeButton) resumeButton.disabled = !resumable;
    if (stopButton) stopButton.disabled = !unfinished;
    if (reportButton) reportButton.disabled = !run;
    if (clearButton) clearButton.disabled = active || !run;
  }

  function clearPreviewClasses() {
    document.querySelectorAll(SELECTORS.video).forEach(element => {
      element.classList.remove(
        "ytwlt-preview-protected",
        "ytwlt-preview-keep",
        "ytwlt-preview-maybe",
        "ytwlt-preview-scoped",
        "ytwlt-preview-delete-candidate",
        "ytwlt-preview-unknown",
      );
    });
  }

  function setStatus(message) {
    const statusEl = document.querySelector(`#${CONFIG.toolboxId} [data-toolbox-status]`);
    if (statusEl) statusEl.textContent = message;
  }

  function setCount(count) {
    const countEl = document.querySelector(`#${CONFIG.toolboxId} [data-toolbox-count]`);
    if (countEl) countEl.textContent = String(typeof count === "number" ? count : getLoadedVideos().length);
  }

  function setBusy(isBusy) {
    document
      .querySelectorAll(`#${CONFIG.toolboxId} .ytwlt-button`)
      .forEach(button => {
        button.disabled = isBusy;
      });
    if (!isBusy) updateExecutionControls();
  }

  function createButton(icon, label, onClick) {
    const button = document.createElement("button");
    const iconEl = document.createElement("span");
    const labelEl = document.createElement("span");

    button.type = "button";
    button.className = "ytwlt-button";
    iconEl.className = "ytwlt-button-icon";
    iconEl.textContent = icon;
    labelEl.textContent = label;

    button.append(iconEl, labelEl);
    button.addEventListener("click", onClick);

    return button;
  }

  function createToolbox() {
    if (document.getElementById(CONFIG.toolboxId)) return;

    const toolbox = document.createElement("section");
    const header = document.createElement("div");
    const titleWrap = document.createElement("div");
    const title = document.createElement("div");
    const subtitle = document.createElement("div");
    const count = document.createElement("span");
    const collapseButton = document.createElement("button");
    const body = document.createElement("div");
    const actions = document.createElement("div");
    const executionSettings = document.createElement("div");
    const status = document.createElement("div");

    toolbox.id = CONFIG.toolboxId;
    toolbox.classList.add("is-collapsed");
    toolbox.setAttribute("aria-label", "YouTube Watch Later Toolbox");
    header.className = "ytwlt-header";
    titleWrap.className = "ytwlt-title-wrap";
    title.className = "ytwlt-title";
    subtitle.className = "ytwlt-subtitle";
    collapseButton.type = "button";
    collapseButton.className = "ytwlt-collapse";
    body.className = "ytwlt-body";
    actions.className = "ytwlt-actions";
    executionSettings.className = "ytwlt-execution-settings";
    status.className = "ytwlt-status";
    status.setAttribute("data-toolbox-status", "");

    title.textContent = `${ICONS.toolbox} Watch Later Toolbox`;
    count.setAttribute("data-toolbox-count", "");
    count.textContent = "0";
    subtitle.append(count, " loaded videos");
    collapseButton.textContent = ICONS.expand;
    collapseButton.title = "Expand toolbox";
    status.textContent = executionState.run
      ? `Saved delete run: ${executionState.run.status}.`
      : "Ready.";

    const loadButton = createButton(ICONS.load, "Load all", async () => {
      setBusy(true);
      setStatus(`${ICONS.loading} Loading videos...`);

      try {
        const videos = await loadAllVideos(({ loadedCount, isLoading }) => {
          setCount();
          setStatus(`${ICONS.loading} Loading videos... ${loadedCount} found${isLoading ? ", still fetching" : ""}`);
        });

        setCount();
        setStatus(`${ICONS.done} Done. ${videos.length} videos loaded.`);
      } catch (error) {
        setStatus(`${ICONS.warning} ${error.message || "Loading failed."}`);
      } finally {
        setBusy(false);
      }
    });

    const csvButton = createButton(ICONS.csv, "Export CSV", exportCsv);
    const jsonButton = createButton(ICONS.json, "Export JSON", exportJson);
    const exportAllCsvButton = createButton(ICONS.all, "Load + CSV", () => exportAll("csv"));
    const exportAllJsonButton = createButton(ICONS.all, "Load + JSON", () => exportAll("json"));
    const importPreviewButton = createButton(ICONS.import, "Import triage JSON", importPreviewJson);
    const exportReportButton = createButton(ICONS.report, "Export preview report", exportDryRunReport);
    const clearPreviewButton = createButton(ICONS.clear, "Clear preview", clearPreview);
    const executeDeleteButton = createButton(ICONS.delete, "Execute delete candidates", prepareAndStartDeleteExecution);
    const pauseDeleteButton = createButton(ICONS.pause, "Pause deletion", requestPauseExecution);
    const resumeDeleteButton = createButton(ICONS.resume, "Resume saved run", resumeDeleteExecution);
    const stopDeleteButton = createButton(ICONS.stop, "Stop deletion", requestStopExecution);
    const executionReportButton = createButton(ICONS.report, "Export execution report", exportExecutionReport);
    const clearExecutionButton = createButton(ICONS.clear, "Clear saved run", clearStoredExecutionRun);
    const delayLabel = document.createElement("label");
    const delayText = document.createElement("span");
    const delayInput = document.createElement("input");
    const pauseEveryLabel = document.createElement("label");
    const pauseEveryText = document.createElement("span");
    const pauseEveryInput = document.createElement("input");

    executeDeleteButton.setAttribute("data-execution-action", "execute");
    pauseDeleteButton.setAttribute("data-execution-action", "pause");
    resumeDeleteButton.setAttribute("data-execution-action", "resume");
    stopDeleteButton.setAttribute("data-execution-action", "stop");
    executionReportButton.setAttribute("data-execution-action", "report");
    clearExecutionButton.setAttribute("data-execution-action", "clear");

    delayText.textContent = "Delay (seconds)";
    delayInput.type = "number";
    delayInput.min = "1";
    delayInput.step = "0.5";
    delayInput.value = String(CONFIG.defaultDeleteDelayMs / 1000);
    delayInput.setAttribute("data-delete-delay", "");
    delayLabel.append(delayText, delayInput);

    pauseEveryText.textContent = "Pause every N (0 = off)";
    pauseEveryInput.type = "number";
    pauseEveryInput.min = "0";
    pauseEveryInput.step = "1";
    pauseEveryInput.value = "0";
    pauseEveryInput.setAttribute("data-pause-every", "");
    pauseEveryLabel.append(pauseEveryText, pauseEveryInput);
    executionSettings.append(delayLabel, pauseEveryLabel);

    actions.append(
      loadButton,
      csvButton,
      jsonButton,
      exportAllCsvButton,
      exportAllJsonButton,
      importPreviewButton,
      exportReportButton,
      clearPreviewButton,
      executionSettings,
      executeDeleteButton,
      pauseDeleteButton,
      resumeDeleteButton,
      stopDeleteButton,
      executionReportButton,
      clearExecutionButton,
    );
    titleWrap.append(title, subtitle);
    header.append(titleWrap, collapseButton);
    body.append(actions, status);
    toolbox.append(header, body);

    collapseButton.addEventListener("click", () => {
      const collapsed = toolbox.classList.toggle("is-collapsed");
      collapseButton.textContent = collapsed ? ICONS.expand : ICONS.collapse;
      collapseButton.title = collapsed ? "Expand toolbox" : "Collapse toolbox";
    });

    document.body.appendChild(toolbox);
    setCount();
    updateExecutionControls();
  }

  function injectStyles() {
    if (document.getElementById(CONFIG.stylesId)) return;

    const style = document.createElement("style");
    style.id = CONFIG.stylesId;
    style.textContent = `
      #${CONFIG.toolboxId} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 9999;
        width: min(320px, calc(100vw - 40px));
        color: #f8fafc;
        background: linear-gradient(145deg, rgba(21, 25, 34, 0.96), rgba(38, 42, 55, 0.96));
        border: 1px solid rgba(255, 255, 255, 0.13);
        border-radius: 12px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.38);
        font-family: Roboto, Arial, sans-serif;
        overflow: hidden;
        backdrop-filter: blur(12px);
      }

      #${CONFIG.toolboxId} * {
        box-sizing: border-box;
      }

      #${CONFIG.toolboxId} .ytwlt-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 13px 14px 11px;
        background: rgba(255, 255, 255, 0.06);
      }

      #${CONFIG.toolboxId} .ytwlt-title {
        font-size: 14px;
        line-height: 18px;
        font-weight: 700;
        letter-spacing: 0;
      }

      #${CONFIG.toolboxId} .ytwlt-subtitle {
        margin-top: 2px;
        color: rgba(248, 250, 252, 0.68);
        font-size: 12px;
        line-height: 16px;
      }

      #${CONFIG.toolboxId} .ytwlt-collapse {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.09);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }

      #${CONFIG.toolboxId} .ytwlt-body {
        padding: 12px;
        max-height: min(76vh, 720px);
        overflow-y: auto;
      }

      #${CONFIG.toolboxId}.is-collapsed .ytwlt-body {
        display: none;
      }

      #${CONFIG.toolboxId} .ytwlt-actions {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
      }

      #${CONFIG.toolboxId} .ytwlt-button {
        min-height: 38px;
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        padding: 8px 11px;
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.09);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        line-height: 18px;
        font-weight: 650;
        text-align: left;
      }

      #${CONFIG.toolboxId} .ytwlt-button:hover {
        background: rgba(255, 255, 255, 0.15);
      }

      #${CONFIG.toolboxId} .ytwlt-button:disabled {
        cursor: wait;
        opacity: 0.62;
      }

      #${CONFIG.toolboxId} .ytwlt-button-icon {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        color: #0f172a;
        background: #f8fafc;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 800;
      }

      #${CONFIG.toolboxId} .ytwlt-execution-settings {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 4px;
        padding-top: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
      }

      #${CONFIG.toolboxId} .ytwlt-execution-settings label {
        display: grid;
        gap: 4px;
        color: rgba(248, 250, 252, 0.72);
        font-size: 11px;
        line-height: 15px;
      }

      #${CONFIG.toolboxId} .ytwlt-execution-settings input {
        width: 100%;
        min-height: 34px;
        padding: 6px 8px;
        color: #f8fafc;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 7px;
      }

      #${CONFIG.toolboxId} .ytwlt-status {
        min-height: 18px;
        margin-top: 10px;
        color: rgba(248, 250, 252, 0.74);
        font-size: 12px;
        line-height: 18px;
        white-space: pre-line;
      }

      ytd-playlist-video-renderer.ytwlt-preview-protected {
        outline: 2px solid rgba(51, 196, 122, 0.95);
        outline-offset: 2px;
        background: rgba(51, 196, 122, 0.10);
      }

      ytd-playlist-video-renderer.ytwlt-preview-keep {
        outline-color: rgba(51, 196, 122, 0.95);
        background: rgba(51, 196, 122, 0.10);
      }

      ytd-playlist-video-renderer.ytwlt-preview-maybe {
        outline-color: rgba(240, 184, 79, 0.95);
        background: rgba(240, 184, 79, 0.10);
      }

      ytd-playlist-video-renderer.ytwlt-preview-scoped {
        outline: 2px solid rgba(110, 198, 255, 0.9);
        outline-offset: 2px;
        background: rgba(110, 198, 255, 0.08);
      }

      ytd-playlist-video-renderer.ytwlt-preview-delete-candidate {
        outline: 2px solid rgba(239, 107, 115, 0.85);
        outline-offset: 2px;
        background: rgba(239, 107, 115, 0.09);
      }

      ytd-playlist-video-renderer.ytwlt-preview-unknown {
        outline: 2px solid rgba(110, 198, 255, 0.85);
        outline-offset: 2px;
        background: rgba(110, 198, 255, 0.09);
      }

      ytd-playlist-video-renderer.ytwlt-execution-failed {
        outline: 3px dashed rgba(239, 107, 115, 0.95);
        outline-offset: 2px;
      }
    `;

    document.head.appendChild(style);
  }

  function removeToolbox() {
    document.getElementById(CONFIG.toolboxId)?.remove();
  }

  function syncToolboxVisibility() {
    if (!isWatchLaterPage()) {
      removeToolbox();
      return;
    }

    injectStyles();
    createToolbox();
  }

  function watchYouTubeNavigation() {
    window.addEventListener("yt-navigate-finish", syncToolboxVisibility);
    window.addEventListener("popstate", syncToolboxVisibility);
    window.setInterval(syncToolboxVisibility, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncToolboxVisibility, { once: true });
  } else {
    syncToolboxVisibility();
  }

  watchYouTubeNavigation();
})();
