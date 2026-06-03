// ==UserScript==
// @name         YouTube Watch Later Toolbox
// @namespace    https://tampermonkey.net/
// @version      0.6.0
// @description  Load and export YouTube Watch Later videos from a compact toolbox.
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
    if (payload?.mode === "scoped-videos") return parseScopedPayload(payload);
    return parseKeepMaybePayload(payload);
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
    if (previewState.mode === "scoped") return runScopedPreview();
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
      mode: "scoped",
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
    if (summary.mode === "scoped") return formatScopedSummary(summary);
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
      `${ICONS.done} Scoped import preview (${summary.scope})`,
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
    if (previewState.mode === "scoped") return buildScopedReport();

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
      mode: "scoped-preview",
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
    status.className = "ytwlt-status";
    status.setAttribute("data-toolbox-status", "");

    title.textContent = `${ICONS.toolbox} Watch Later Toolbox`;
    count.setAttribute("data-toolbox-count", "");
    count.textContent = "0";
    subtitle.append(count, " loaded videos");
    collapseButton.textContent = ICONS.expand;
    collapseButton.title = "Expand toolbox";
    status.textContent = "Ready.";

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

    actions.append(
      loadButton,
      csvButton,
      jsonButton,
      exportAllCsvButton,
      exportAllJsonButton,
      importPreviewButton,
      exportReportButton,
      clearPreviewButton,
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
