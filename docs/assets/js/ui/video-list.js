(function registerVideoListUi(root) {
  "use strict";

  function createVideoListUi(context) {

    const { state, els, PAGE_SIZE, normalizeTags } = context;
    const getFilteredVideos = (...args) => context.getFilteredVideos(...args);
    const getStatus = (...args) => context.getStatus(...args);
    const getDecision = (...args) => context.getDecision(...args);
    const getVideoTags = (...args) => context.getVideoTags(...args);
    const setStatus = (...args) => context.setStatus(...args);
    const setStatusAndAdvance = (...args) => context.setStatusAndAdvance(...args);
    const render = (...args) => context.render(...args);
    const openQuickPreview = (...args) => context.openQuickPreview(...args);
    const openVideoEditor = (...args) => context.openVideoEditor(...args);
    const renderStats = (...args) => context.renderStats(...args);
    const updateBulkLabels = (...args) => context.updateBulkLabels(...args);

    function getRenderedVideos() {
      return getFilteredVideos().slice(0, state.renderedCount);
    }

    function maybeRenderMore() {
      if (!state.videos.length) return;
      const nearBottom = window.innerHeight + window.scrollY > document.body.offsetHeight - 900;
      if (!nearBottom) return;

      const total = getFilteredVideos().length;
      if (state.renderedCount < total) {
        state.renderedCount += PAGE_SIZE;
        renderVideoList();
        renderStats();
      }
    }

    function scrollCurrentIntoView() {
      if (!state.currentId) return;
      window.requestAnimationFrame(() => {
        const row = document.querySelector(`.video-row[data-video-id="${CSS.escape(state.currentId)}"]`);
        row?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    }

    function ensureCurrentVisible() {
      const videos = getFilteredVideos();
      if (!videos.length) {
        state.currentId = "";
        return;
      }

      if (!videos.some(video => video.videoId === state.currentId)) {
        state.currentId = videos[0].videoId;
      }
    }

    function renderVideoList() {
      const videos = getRenderedVideos();
      const total = getFilteredVideos().length;

      if (!state.videos.length) {
        els.videoList.innerHTML = '<div class="empty">No JSON imported yet.</div>';
        return;
      }

      if (!videos.length) {
        els.videoList.innerHTML = '<div class="empty">No videos match the current filters.</div>';
        return;
      }

      els.videoList.replaceChildren(...videos.map(video => createVideoRow(video)));

      if (videos.length < total) {
        const more = document.createElement("button");
        more.type = "button";
        more.textContent = `Show more (${videos.length} / ${total})`;
        more.addEventListener("click", () => {
          state.renderedCount += PAGE_SIZE;
          renderVideoList();
          renderStats();
        });
        els.videoList.appendChild(more);
      }
    }

    function createVideoRow(video) {
      const status = getStatus(video.videoId);
      const row = document.createElement("article");
      row.className = "video-row";
      if (state.currentId === video.videoId) row.classList.add("is-current");
      row.dataset.status = status;
      row.dataset.videoId = video.videoId;

      const checkbox = document.createElement("input");
      checkbox.className = "row-check";
      checkbox.type = "checkbox";
      checkbox.checked = state.selectedIds.has(video.videoId);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.selectedIds.add(video.videoId);
        else state.selectedIds.delete(video.videoId);
        state.currentId = video.videoId;
        render();
      });

      const thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.loading = "lazy";
      thumb.alt = "";
      thumb.src = video.thumbnailUrl || "";

      const content = document.createElement("div");
      const title = document.createElement("h2");
      title.className = "video-title";
      const link = document.createElement("a");
      link.href = video.cleanUrl || video.url || "#";
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = video.title || "(untitled)";
      title.appendChild(link);

      const meta = document.createElement("div");
      meta.className = "meta";
      [`#${video.index || video.playlistIndex || "?"}`, video.channel, video.views, video.uploaded, video.duration].filter(Boolean).forEach((part, index) => {
        const span = document.createElement("span");
        if (index === 0) span.className = "playlist-index";
        span.textContent = part;
        meta.appendChild(span);
      });

      const tags = document.createElement("div");
      tags.className = "tags";
      if (state.importComparison.newIds.includes(video.videoId)) {
        const badge = document.createElement("span");
        badge.className = "import-badge";
        badge.textContent = "New since last import";
        tags.appendChild(badge);
      }
      if (state.importComparison.changedIds.includes(video.videoId)) {
        const badge = document.createElement("span");
        badge.className = "import-badge changed";
        const fields = state.importComparison.changedFieldsById[video.videoId] || [];
        badge.textContent = "Metadata changed";
        badge.title = fields.length ? `Changed: ${fields.join(", ")}` : "Metadata changed since the previous import";
        tags.appendChild(badge);
      }
      if (video.isUnavailable) {
        const badge = document.createElement("span");
        badge.className = "import-badge changed";
        badge.textContent = "Unavailable";
        tags.appendChild(badge);
      }
      normalizeTags(video.badges).forEach(value => {
        const badge = document.createElement("span");
        badge.className = "import-badge";
        badge.textContent = value;
        badge.title = "YouTube badge";
        tags.appendChild(badge);
      });
      const decisionTags = getDecision(video.videoId).tags || [];
      video.suggestedTags.forEach(tag => {
        const chip = document.createElement("span");
        chip.className = "tag";
        chip.textContent = `Suggested: ${tag}`;
        chip.title = "Suggested by a keyword rule";
        tags.appendChild(chip);
      });
      decisionTags.forEach(tag => {
        const chip = document.createElement("span");
        chip.className = "tag manual-tag";
        chip.textContent = `Manual: ${tag}`;
        chip.title = "Added manually";
        tags.appendChild(chip);
      });

      content.append(title, meta, tags);
      const note = getDecision(video.videoId).note;
      if (note) {
        const noteElement = document.createElement("p");
        noteElement.className = "video-note";
        noteElement.textContent = note;
        content.appendChild(noteElement);
      }

      const actions = document.createElement("div");
      actions.className = "status-actions";
      actions.append(
        createStatusButton(video.videoId, "keep", status),
        createStatusButton(video.videoId, "maybe", status),
        createStatusButton(video.videoId, "delete", status),
        createStatusButton(video.videoId, "unreviewed", status, "Reset"),
        createEditVideoButton(video),
        createPreviewButton(video),
        createOpenButton(video),
      );

      row.addEventListener("click", event => {
        if (event.target.closest("button, a, input")) return;
        state.currentId = video.videoId;
        render();
      });

      const checkWrap = document.createElement("div");
      checkWrap.appendChild(checkbox);
      if (state.currentId === video.videoId) {
        const marker = document.createElement("span");
        marker.className = "current-marker";
        marker.textContent = "Now";
        checkWrap.appendChild(marker);
      }

      row.append(checkWrap, thumb, content, actions);
      return row;
    }

    function createStatusButton(videoId, status, currentStatus, label) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.actionStatus = status;
      button.textContent = label || status[0].toUpperCase() + status.slice(1);
      if (status === currentStatus) button.classList.add("is-active");
      button.addEventListener("click", () => {
        setStatusAndAdvance(videoId, status);
      });
      return button;
    }

    function createOpenButton(video) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Open";
      button.addEventListener("click", () => {
        window.open(video.cleanUrl || video.url, "_blank", "noreferrer");
      });
      return button;
    }

    function createPreviewButton(video) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Preview";
      button.disabled = Boolean(video.isUnavailable);
      button.title = video.isUnavailable ? "This video is unavailable." : "Preview this video (p)";
      button.addEventListener("click", () => openQuickPreview(video.videoId));
      return button;
    }

    function createEditVideoButton(video) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Tags / note";
      button.addEventListener("click", () => openVideoEditor(video.videoId));
      return button;
    }

    return Object.freeze({
      getRenderedVideos,
      maybeRenderMore,
      scrollCurrentIntoView,
      ensureCurrentVisible,
      renderVideoList,
      createVideoRow,
      createStatusButton,
      createOpenButton,
      createPreviewButton,
      createEditVideoButton,
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.ui ||= {};
  app.ui.videoList = Object.freeze({
    createVideoListUi,
  });
})(globalThis);
