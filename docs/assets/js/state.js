(function registerState(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  const { PAGE_SIZE } = app.config;
  const {
    normalizeUserRules,
    normalizeChannelRules,
  } = app.domain.decisions;
  const { normalizeSavedViews } = app.domain.filters;
  const { createEmptyImportComparison } = app.domain.importComparison;
  const { createEmptyInsightsCache } = app.domain.insights;

  /**
   * Creates the single mutable application state container.
   *
   * Persistent fields: decisions, history, userRules, channelRules, savedViews,
   * datasetBaseline, timeBudgetHours, and previewProgress.
   * Dataset fields: videos, lastImport, importComparison, and insightsCache.
   * Transient UI fields: selections, active filters/editors, rendered limits,
   * grouping cache, current preview state, and preview timers.
   */
  function createInitialState(persistence = app.storage.createStorage()) {
    return {
      videos: [],
      decisions: persistence.loadDecisions(),
      selectedIds: new Set(),
      activeTags: new Set(),
      activeChannels: new Set(),
      activeView: "triage",
      renderedCount: PAGE_SIZE,
      currentId: "",
      history: persistence.loadHistory(),
      userRules: normalizeUserRules(persistence.loadUserRules()),
      channelRules: normalizeChannelRules(persistence.loadChannelRules()),
      savedViews: normalizeSavedViews(persistence.loadSavedViews()),
      activeSavedViewId: "",
      lastImport: null,
      datasetView: "all",
      importComparison: createEmptyImportComparison(),
      insightsCache: createEmptyInsightsCache(),
      datasetBaseline: persistence.loadDatasetBaseline(),
      editingVideoId: "",
      editingRuleName: "",
      editingChannelRuleId: "",
      timeBudgetHours: persistence.loadTimeBudgetHours(),
      groupType: "all",
      renderedGroupCount: 20,
      groupCacheKey: "",
      groupCache: [],
      previewVideoId: "",
      previewCurrentTime: 0,
      previewPlayerState: -1,
      previewPlayerReady: false,
      previewProgress: persistence.loadPreviewProgress(),
      previewLastPersistAt: 0,
      previewCountdownRemaining: 30,
      previewCountdownActive: false,
      previewCountdownLastTick: 0,
      previewPollTimer: null,
    };
  }

  app.state = Object.freeze({
    createInitialState,
  });
})(globalThis);
