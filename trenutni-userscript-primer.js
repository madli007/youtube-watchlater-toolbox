// Reference snapshot of the two Tampermonkey scripts used before this project
// was moved into a repo. Keep this as source material for the combined toolbox.

// ==UserScript==
// @name         YouTube Watch Later Export (Extended)
// @namespace    https://tampermonkey.net/
// @version      1.1
// @description  Export currently loaded videos from Watch Later playlist to CSV (with extra data)
// @author       You
// @match        https://www.youtube.com/playlist?list=WL*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  function exportVisibleVideos() {
    const rows = [["Index", "Title", "Channel", "URL", "Duration", "Views", "Uploaded"]];

    const videos = document.querySelectorAll("ytd-playlist-video-renderer");

    videos.forEach((video, idx) => {
      const titleEl = video.querySelector("#video-title");
      const channelEl = video.querySelector("ytd-channel-name a");
      const durationEl = video.querySelector("ytd-thumbnail-overlay-time-status-renderer span");
      const metaEl = video.querySelector("#metadata-line"); // usually has [views, uploaded time]

      if (!titleEl) return;

      const title = titleEl?.textContent?.trim() || "";
      const url = titleEl.getAttribute("href")
        ? "https://www.youtube.com" + titleEl.getAttribute("href")
        : "";
      const channel = channelEl?.textContent?.trim() || "";
      const duration = durationEl?.textContent?.trim() || "";

      let views = "";
      let uploaded = "";
      if (metaEl) {
        const spans = metaEl.querySelectorAll("span");
        if (spans.length >= 1) views = spans[0]?.textContent?.trim() || "";
        if (spans.length >= 2) uploaded = spans[1]?.textContent?.trim() || "";
      }

      rows.push([idx + 1, title, channel, url, duration, views, uploaded]);
    });

    // Convert to CSV safely.
    const csvContent = rows.map(r => r.map(field => {
      const safeField = String(field || "");
      return `"${safeField.replace(/"/g, '""')}"`;
    }).join(",")).join("\n");

    // Download.
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "watchlater_export.csv";
    link.click();
  }

  function createButton() {
    const btn = document.createElement("button");
    btn.textContent = "📥 Export CSV";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "60px",
      right: "20px",
      zIndex: "9999",
      padding: "10px 16px",
      fontSize: "14px",
      backgroundColor: "#0073e6",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
      fontWeight: "bold",
    });
    btn.addEventListener("click", exportVisibleVideos);
    document.body.appendChild(btn);
  }

  window.addEventListener("load", createButton);
})();

// ==UserScript==
// @name         YouTube Watch Later Auto Loader (with Button, Fixed)
// @namespace    https://tampermonkey.net/
// @version      1.2
// @description  Adds a button to auto-load all videos in the Watch Later playlist on YouTube
// @author       You
// @match        https://www.youtube.com/playlist?list=WL*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const SCROLL_DELAY = 1200; // time between scrolls
  const MAX_STABLE_ROUNDS = 3; // how many equal-height rounds mean loading is done

  function autoScroll(onDone) {
    let lastHeight = 0;
    let stableRounds = 0;

    const interval = setInterval(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const newHeight = document.documentElement.scrollHeight;

      if (newHeight !== lastHeight) {
        lastHeight = newHeight;
        stableRounds = 0;
      } else {
        stableRounds++;
        if (stableRounds >= MAX_STABLE_ROUNDS) {
          clearInterval(interval);
          if (onDone) onDone();
        }
      }
    }, SCROLL_DELAY);
  }

  function createButton() {
    const btn = document.createElement("button");
    btn.textContent = "▶ Load All Videos";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "9999",
      padding: "10px 16px",
      fontSize: "14px",
      backgroundColor: "#ff0000",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
      fontWeight: "bold",
    });

    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = "⏳ Loading...";
      autoScroll(() => {
        btn.textContent = "✅ Done";
        alert("All videos have been loaded!");
      });
    });

    document.body.appendChild(btn);
  }

  window.addEventListener("load", createButton);
})();
