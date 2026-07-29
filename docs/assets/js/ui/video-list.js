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

    function initializeVideoList() {
      document.addEventListener("click", event => {
        if (!event.target.closest?.(".video-overflow")) closeVideoOverflowMenus();
      });
    }

    function getRenderedVideos() {
      return getFilteredVideos().slice(0, state.renderedCount);
    }

    function maybeRenderMore() {
      if (state.activeView !== "triage" || !state.videos.length) return;
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
      const taggedItems = [
        ...(video.suggestedTags || []).map(tag => ({
          className: "tag",
          label: `Suggested: ${tag}`,
          title: "Suggested by a keyword rule",
        })),
        ...decisionTags.map(tag => ({
          className: "tag manual-tag",
          label: `Manual: ${tag}`,
          title: "Added manually",
        })),
      ];
      taggedItems.slice(0, 3).forEach(item => {
        const chip = document.createElement("span");
        chip.className = item.className;
        chip.textContent = item.label;
        chip.title = item.title;
        tags.appendChild(chip);
      });
      if (taggedItems.length > 3) {
        const moreTags = document.createElement("span");
        moreTags.className = "tag more-tags";
        moreTags.textContent = `+${taggedItems.length - 3}`;
        moreTags.title = taggedItems.slice(3).map(item => item.label).join(", ");
        moreTags.setAttribute("aria-label", `${taggedItems.length - 3} more tags: ${moreTags.title}`);
        tags.appendChild(moreTags);
      }

      content.append(title, meta, tags);
      const note = getDecision(video.videoId).note;
      if (note) {
        const noteElement = document.createElement("p");
        noteElement.className = "video-note";
        noteElement.textContent = note;
        noteElement.title = note;
        content.appendChild(noteElement);
      }

      const actions = document.createElement("div");
      actions.className = "row-actions";

      const decisionControls = document.createElement("div");
      decisionControls.className = "decision-controls";
      decisionControls.setAttribute("role", "group");
      decisionControls.setAttribute("aria-label", `Decision for ${video.title || "untitled video"}`);
      decisionControls.append(
        createStatusButton(video.videoId, "keep", status, "K", `Keep ${video.title || "video"}`),
        createStatusButton(video.videoId, "maybe", status, "M", `Maybe ${video.title || "video"}`),
        createStatusButton(video.videoId, "delete", status, "D", `Delete ${video.title || "video"}`),
      );
      actions.append(decisionControls, createPreviewButton(video), createOverflowMenu(video, status));

      row.addEventListener("click", event => {
        if (event.target.closest("button, a, input, .video-overflow")) return;
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

    function createStatusButton(videoId, status, currentStatus, label, accessibleLabel) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.actionStatus = status;
      button.textContent = label || status[0].toUpperCase() + status.slice(1);
      if (accessibleLabel) button.setAttribute("aria-label", accessibleLabel);
      const isActive = status === currentStatus;
      if (isActive) button.classList.add("is-active");
      if (status !== "unreviewed") button.setAttribute("aria-pressed", String(isActive));
      button.addEventListener("click", () => {
        setStatusAndAdvance(videoId, status);
      });
      return button;
    }

    function createOpenButton(video) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "video-overflow-item";
      button.setAttribute("role", "menuitem");
      button.textContent = "Open on YouTube";
      button.addEventListener("click", () => {
        window.open(video.cleanUrl || video.url, "_blank", "noreferrer");
      });
      return button;
    }

    function createPreviewButton(video) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-button preview-button";
      button.textContent = "▶";
      button.setAttribute("aria-label", `Preview ${video.title || "video"}`);
      button.disabled = Boolean(video.isUnavailable);
      button.title = video.isUnavailable ? "This video is unavailable." : "Preview this video (p)";
      button.addEventListener("click", () => openQuickPreview(video.videoId));
      return button;
    }

    function createEditVideoButton(video) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "video-overflow-item";
      button.setAttribute("role", "menuitem");
      button.textContent = "Edit tags / note";
      button.addEventListener("click", () => openVideoEditor(video.videoId));
      return button;
    }

    function createOverflowMenu(video, status) {
      const root = document.createElement("div");
      root.className = "video-overflow";

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "icon-button video-overflow-trigger";
      trigger.textContent = "⋯";
      trigger.title = "More video actions";
      trigger.setAttribute("aria-label", `More actions for ${video.title || "video"}`);
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");

      const menu = document.createElement("div");
      menu.className = "video-overflow-menu";
      menu.hidden = true;
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", `More actions for ${video.title || "video"}`);

      const reset = createStatusButton(
        video.videoId,
        "unreviewed",
        status,
        "Reset to unreviewed",
        `Reset ${video.title || "video"} to unreviewed`,
      );
      reset.className = "video-overflow-item";
      reset.setAttribute("role", "menuitem");
      menu.append(reset, createEditVideoButton(video), createOpenButton(video));
      root.append(trigger, menu);

      trigger.addEventListener("click", event => {
        event.stopPropagation();
        const shouldOpen = menu.hidden;
        closeVideoOverflowMenus(root);
        setOverflowOpen(root, shouldOpen, shouldOpen);
      });
      trigger.addEventListener("keydown", event => {
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        event.preventDefault();
        closeVideoOverflowMenus(root);
        setOverflowOpen(root, true);
        const items = getEnabledMenuItems(menu);
        const target = event.key === "ArrowUp" ? items.at(-1) : items[0];
        target?.focus();
      });
      menu.addEventListener("click", event => {
        if (event.target.closest('[role="menuitem"]')) setOverflowOpen(root, false);
      });
      menu.addEventListener("keydown", event => {
        const items = getEnabledMenuItems(menu);
        if (event.key === "Escape") {
          event.preventDefault();
          setOverflowOpen(root, false);
          trigger.focus();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !items.length) return;
        event.preventDefault();
        const currentIndex = items.indexOf(document.activeElement);
        let nextIndex;
        if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = items.length - 1;
        else if (event.key === "ArrowDown") nextIndex = (currentIndex + 1 + items.length) % items.length;
        else nextIndex = (currentIndex - 1 + items.length) % items.length;
        items[nextIndex].focus();
      });

      return root;
    }

    function getEnabledMenuItems(menu) {
      return Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(item => !item.disabled);
    }

    function setOverflowOpen(root, isOpen, focusFirst = false) {
      const trigger = root.querySelector(".video-overflow-trigger");
      const menu = root.querySelector(".video-overflow-menu");
      if (!trigger || !menu) return;
      menu.hidden = !isOpen;
      root.classList.toggle("is-open", isOpen);
      trigger.setAttribute("aria-expanded", String(isOpen));
      if (isOpen && focusFirst) getEnabledMenuItems(menu)[0]?.focus();
    }

    function closeVideoOverflowMenus(exceptRoot = null) {
      const roots = els.videoList?.querySelectorAll?.(".video-overflow.is-open") || [];
      roots.forEach(root => {
        if (root !== exceptRoot) setOverflowOpen(root, false);
      });
    }

    return Object.freeze({
      initializeVideoList,
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
      createOverflowMenu,
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.ui ||= {};
  app.ui.videoList = Object.freeze({
    createVideoListUi,
  });
})(globalThis);
