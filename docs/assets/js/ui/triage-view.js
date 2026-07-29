(function registerTriageViewUi(root) {
  "use strict";

  function isEditableShortcutTarget(target) {
    const tagName = target?.tagName?.toLowerCase();
    return tagName === "input"
      || tagName === "select"
      || tagName === "textarea"
      || Boolean(target?.isContentEditable);
  }

  function getKeyboardShortcutAction(event, options = {}) {
    if (event.ctrlKey || event.metaKey || event.altKey) return "";

    const {
      hasCurrent = false,
      openDialog = "",
    } = options;
    const key = event.key;

    if (key === "Escape" && openDialog) return "close-dialog";
    if (isEditableShortcutTarget(event.target)) return "";
    if (key === "?" && !openDialog) return "show-shortcuts";
    if (openDialog && openDialog !== "preview") return "";
    if (key === "/" && !openDialog) return "focus-search";
    if (!hasCurrent) return "";

    if (openDialog === "preview") {
      if (key === "p") return "preview-toggle";
      if (key === "k") return "preview-status:keep";
      if (key === "m") return "preview-status:maybe";
      if (key === "d") return "preview-status:delete";
      if (key === "j" || key === "ArrowDown") return "preview-move:next";
      if (key === "J" || key === "ArrowUp") return "preview-move:previous";
      return "";
    }

    const actions = {
      p: "preview-toggle",
      k: "status:keep",
      m: "status:maybe",
      d: "status:delete",
      r: "status:unreviewed",
      x: "toggle-selection",
      e: "edit-video",
      o: "open-video",
      j: "move:next",
      J: "move:previous",
      ArrowDown: "move:next",
      ArrowUp: "move:previous",
    };
    return actions[key] || "";
  }

  function createTriageViewUi(context) {
    const {
      state,
      els,
      normalizeFilterState,
      getAdvancedFilterEntries,
      renderBadgeOptions,
    } = context;

    function initializeTriageView() {
      els.filtersToggle.addEventListener("click", () => {
        setAdvancedFiltersOpen(els.advancedFilters.hidden);
      });
      setAdvancedFiltersOpen(false);
    }

    function setAdvancedFiltersOpen(open) {
      const isOpen = Boolean(open);
      els.advancedFilters.hidden = !isOpen;
      els.filtersToggle.setAttribute("aria-expanded", String(isOpen));
      els.filtersToggle.classList.toggle("is-open", isOpen);
      renderCompactFilters();
    }

    function captureFilterState() {
      return normalizeFilterState({
        search: els.searchInput.value,
        status: els.statusFilter.value,
        channels: Array.from(state.activeChannels),
        tags: Array.from(state.activeTags),
        tagMode: els.tagModeSelect.value,
        sort: els.sortSelect.value,
        datasetView: state.datasetView,
        minDurationMinutes: els.minDurationInput.value,
        maxDurationMinutes: els.maxDurationInput.value,
        ageBucket: state.activeAgeBucket,
        ageAnchorAt: state.activeAgeAnchorAt,
        minAgeDays: els.minAgeInput.value,
        maxAgeDays: els.maxAgeInput.value,
        minViews: els.minViewsInput.value,
        availability: els.availabilityFilter.value,
        badge: els.badgeFilter.value,
        suggestedTag: els.suggestedTagFilter.value,
        note: els.noteFilter.value,
      });
    }

    function applyFilterStateToControls(value) {
      const filters = normalizeFilterState(value);
      els.searchInput.value = filters.search;
      els.statusFilter.value = filters.status;
      state.activeChannels = new Set(filters.channels);
      state.activeTags = new Set(filters.tags);
      els.channelSearch.value = "";
      els.tagModeSelect.value = filters.tagMode;
      els.sortSelect.value = filters.sort;
      state.datasetView = filters.datasetView !== "all" && !state.importComparison.baselineAvailable
        ? "all"
        : filters.datasetView;
      state.activeAgeBucket = filters.ageBucket;
      state.activeAgeAnchorAt = filters.ageAnchorAt;
      els.minDurationInput.value = filters.minDurationMinutes;
      els.maxDurationInput.value = filters.maxDurationMinutes;
      els.minAgeInput.value = filters.minAgeDays;
      els.maxAgeInput.value = filters.maxAgeDays;
      els.minViewsInput.value = filters.minViews;
      els.availabilityFilter.value = filters.availability;
      renderBadgeOptions(filters.badge);
      els.suggestedTagFilter.value = filters.suggestedTag;
      els.noteFilter.value = filters.note;
      renderCompactFilters(filters);
      return filters;
    }

    function renderCompactFilters(value = captureFilterState()) {
      const entries = getAdvancedFilterEntries(value);
      const summary = entries.map(entry => entry.label).join(" \u00b7 ");
      els.advancedFilterCount.textContent = String(entries.length);
      els.advancedFilterCount.hidden = entries.length === 0;
      els.filtersToggle.classList.toggle("has-active-filters", entries.length > 0);
      els.filtersToggle.setAttribute(
        "aria-label",
        entries.length
          ? `Filters, ${entries.length} active: ${summary}`
          : "Filters, none active",
      );
      els.advancedFilterSummary.textContent = entries.length
        ? `Advanced: ${summary}`
        : "";
      els.advancedFilterSummary.hidden = entries.length === 0 || !els.advancedFilters.hidden;
      return entries;
    }

    return Object.freeze({
      initializeTriageView,
      setAdvancedFiltersOpen,
      captureFilterState,
      applyFilterStateToControls,
      renderCompactFilters,
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.ui ||= {};
  app.ui.triageView = Object.freeze({
    createTriageViewUi,
    getKeyboardShortcutAction,
    isEditableShortcutTarget,
  });
})(globalThis);
