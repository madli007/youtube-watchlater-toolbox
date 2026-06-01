// ==UserScript==
// @name         YouTube Watch Later Toolbox
// @namespace    https://tampermonkey.net/
// @version      0.1.0
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
    toolboxId: "yt-watchlater-toolbox",
    stylesId: "yt-watchlater-toolbox-styles",
  };

  const SELECTORS = {
    video: "ytd-playlist-video-renderer",
    title: "#video-title",
    channel: "ytd-channel-name a",
    duration: "ytd-thumbnail-overlay-time-status-renderer span",
    metadata: "#metadata-line",
  };

  const ICONS = {
    toolbox: "\u25A3",
    load: "\u25B6",
    csv: "\u21E9",
    json: "{}",
    done: "\u2713",
    loading: "\u2026",
    warning: "!",
    collapse: "\u2212",
    expand: "+",
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

  function getLoadedVideos() {
    return Array.from(document.querySelectorAll(SELECTORS.video))
      .map((video, index) => {
        const titleEl = video.querySelector(SELECTORS.title);
        const channelEl = video.querySelector(SELECTORS.channel);
        const durationEl = video.querySelector(SELECTORS.duration);
        const metaEl = video.querySelector(SELECTORS.metadata);
        const href = titleEl?.getAttribute("href") || "";
        const metadataSpans = metaEl ? Array.from(metaEl.querySelectorAll("span")) : [];
        const url = normalizeYouTubeUrl(href);

        if (!titleEl && !url) return null;

        return {
          index: index + 1,
          title: titleEl?.textContent?.trim() || "",
          channel: channelEl?.textContent?.trim() || "",
          url,
          duration: durationEl?.textContent?.trim() || "",
          views: metadataSpans[0]?.textContent?.trim() || "",
          uploaded: metadataSpans[1]?.textContent?.trim() || "",
        };
      })
      .filter(Boolean);
  }

  function buildCsv(videos) {
    const rows = [
      ["Index", "Title", "Channel", "URL", "Duration", "Views", "Uploaded"],
      ...videos.map(video => [
        video.index,
        video.title,
        video.channel,
        video.url,
        video.duration,
        video.views,
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

  function autoScroll(onProgress, onDone) {
    let lastHeight = 0;
    let stableRounds = 0;
    const interval = window.setInterval(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);

      const newHeight = document.documentElement.scrollHeight;
      const loadedCount = getLoadedVideos().length;
      onProgress(loadedCount, stableRounds);

      if (newHeight !== lastHeight) {
        lastHeight = newHeight;
        stableRounds = 0;
        return;
      }

      stableRounds++;
      if (stableRounds >= CONFIG.maxStableRounds) {
        window.clearInterval(interval);
        onDone(getLoadedVideos().length);
      }
    }, CONFIG.scrollDelayMs);
  }

  function setStatus(message) {
    const statusEl = document.querySelector(`#${CONFIG.toolboxId} [data-toolbox-status]`);
    if (statusEl) statusEl.textContent = message;
  }

  function setCount() {
    const countEl = document.querySelector(`#${CONFIG.toolboxId} [data-toolbox-count]`);
    if (countEl) countEl.textContent = String(getLoadedVideos().length);
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
    collapseButton.textContent = ICONS.collapse;
    collapseButton.title = "Collapse toolbox";
    status.textContent = "Ready.";

    const loadButton = createButton(ICONS.load, "Load all", () => {
      loadButton.disabled = true;
      setStatus(`${ICONS.loading} Loading videos...`);

      autoScroll(
        loadedCount => {
          setCount();
          setStatus(`${ICONS.loading} Loading videos... ${loadedCount} found`);
        },
        loadedCount => {
          loadButton.disabled = false;
          setCount();
          setStatus(`${ICONS.done} Done. ${loadedCount} videos loaded.`);
        },
      );
    });

    const csvButton = createButton(ICONS.csv, "Export CSV", exportCsv);
    const jsonButton = createButton(ICONS.json, "Export JSON", exportJson);

    actions.append(loadButton, csvButton, jsonButton);
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
