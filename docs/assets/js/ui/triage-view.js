(function registerTriageViewUi(root) {
  "use strict";

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
  });
})(globalThis);
