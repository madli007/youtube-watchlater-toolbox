(function registerDomainModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};
    const decisions = app.domain.decisions;
    const importComparison = app.domain.importComparison;
    const { normalizeFilterState, normalizeSavedViews } = app.domain.filters;
    const { normalizeTimeBudgetHours } = app.domain.timeBudget;
    const { normalizeGroupingOverrides } = app.domain.grouping;
    const { getPortableDecisions, normalizeChannelRules, normalizeHistory, normalizeUserRules } = decisions;
    const { normalizeImportComparison, normalizePlainObject } = importComparison;

    function normalizeChannelInsightsExtension(value) {
      const source = value && typeof value === "object" && !Array.isArray(value)
        && (value.schemaVersion === undefined || value.schemaVersion === 1)
        ? value
        : {};
      return {
        schemaVersion: 1,
        groupingOverrides: normalizeGroupingOverrides(source.groupingOverrides),
      };
    }

    function buildWorkspacePayload(workspace, exportedAt = new Date().toISOString()) {
      return {
        schemaVersion: 1,
        exportedAt,
        source: "youtube-watchlater-triage",
        mode: "workspace-snapshot",
        workspace: {
          videos: Array.isArray(workspace.videos) ? workspace.videos : [],
          decisions: getPortableDecisions(workspace.decisions),
          userRules: normalizeUserRules(workspace.userRules),
          channelRules: normalizeChannelRules(workspace.channelRules),
          savedViews: normalizeSavedViews(workspace.savedViews),
          lastImport: normalizePlainObject(workspace.lastImport),
          importComparison: normalizeImportComparison(workspace.importComparison),
          history: normalizeHistory(workspace.history),
          timeBudgetHours: normalizeTimeBudgetHours(workspace.timeBudgetHours),
          previewProgress: normalizePreviewProgress(workspace.previewProgress),
          extensions: {
            channelInsights: normalizeChannelInsightsExtension({
              ...workspace.extensions?.channelInsights,
              groupingOverrides: workspace.groupingOverrides
                ?? workspace.extensions?.channelInsights?.groupingOverrides,
            }),
          },
          ui: normalizeWorkspaceUi(workspace.ui),
        },
      };
    }

    function parseWorkspacePayload(payload) {
      if (!payload || typeof payload !== "object" || payload.mode !== "workspace-snapshot") {
        throw new Error("Expected a workspace snapshot JSON file.");
      }
      if (payload.schemaVersion !== 1) {
        throw new Error(`Unsupported workspace schema version: ${payload.schemaVersion ?? "missing"}.`);
      }

      const workspace = payload.workspace;
      if (!workspace || typeof workspace !== "object" || !Array.isArray(workspace.videos)) {
        throw new Error("Workspace snapshot is missing its video dataset.");
      }
      if (!workspace.decisions || typeof workspace.decisions !== "object" || Array.isArray(workspace.decisions)) {
        throw new Error("Workspace snapshot is missing its decisions map.");
      }

      return {
        videos: workspace.videos.filter(video => video && typeof video === "object"),
        decisions: getPortableDecisions(workspace.decisions),
        userRules: normalizeUserRules(workspace.userRules),
        channelRules: normalizeChannelRules(workspace.channelRules),
        savedViews: normalizeSavedViews(workspace.savedViews),
        lastImport: normalizePlainObject(workspace.lastImport),
        importComparison: normalizeImportComparison(workspace.importComparison),
        history: normalizeHistory(workspace.history),
        timeBudgetHours: normalizeTimeBudgetHours(workspace.timeBudgetHours),
        previewProgress: normalizePreviewProgress(workspace.previewProgress),
        groupingOverrides: normalizeChannelInsightsExtension(
          workspace.extensions?.channelInsights || {
            groupingOverrides: workspace.groupingOverrides,
          },
        ).groupingOverrides,
        ui: normalizeWorkspaceUi(workspace.ui),
      };
    }

    function toWorkspaceVideo(video) {
      const { suggestedTags: _suggestedTags, searchText: _searchText, ...portable } = video;
      return portable;
    }

    function normalizeWorkspaceUi(ui) {
      const source = ui && typeof ui === "object" && !Array.isArray(ui) ? ui : {};
      return {
        ...normalizeFilterState(source),
        savedViewId: typeof source.savedViewId === "string" ? source.savedViewId : "",
        selectedIds: Array.isArray(source.selectedIds) ? source.selectedIds.map(String) : [],
        currentId: typeof source.currentId === "string" ? source.currentId : "",
      };
    }

    function normalizePreviewProgress(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      const normalized = {};
      for (const [videoId, rawSeconds] of Object.entries(value)) {
        const cleanId = String(videoId || "").trim();
        const seconds = Number(rawSeconds);
        if (!cleanId || !Number.isFinite(seconds) || seconds <= 0) continue;
        normalized[cleanId] = Math.min(604800, Math.max(0, Math.floor(seconds)));
      }
      return normalized;
    }

  app.domain.workspace = Object.freeze({
      buildWorkspacePayload,
      parseWorkspacePayload,
      toWorkspaceVideo,
      normalizeWorkspaceUi,
      normalizePreviewProgress,
      normalizeChannelInsightsExtension,
  });
})(globalThis);
