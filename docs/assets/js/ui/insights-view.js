(function registerInsightsViewUi(root) {
  "use strict";

  function formatCount(value) {
    return Math.max(0, Number(value) || 0).toLocaleString("en-US");
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "Unknown";
    return `${Math.round(number)}%`;
  }

  function formatApproximateAge(ageDays) {
    if (ageDays === null || ageDays === undefined || ageDays === "") return "Unknown";
    const days = Number(ageDays);
    if (!Number.isFinite(days) || days < 0) return "Unknown";
    if (days < 31) return `≈ ${Math.max(1, Math.round(days))}d`;
    if (days < 366) return `≈ ${Math.max(1, Math.round(days / 30.4375))}mo`;
    const years = days / 365.25;
    return `≈ ${years < 10 ? years.toFixed(1) : Math.round(years)}y`;
  }

  function formatImportTimestamp(value) {
    const timestamp = Date.parse(String(value || ""));
    if (!Number.isFinite(timestamp)) return "";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  }

  function getImportContext(lastImport) {
    if (!lastImport || typeof lastImport !== "object") {
      return "Import a Watch Later JSON file to calculate channel insights.";
    }
    const fileName = String(lastImport.fileName || "").trim() || "Watch Later JSON";
    const exportedAt = formatImportTimestamp(lastImport.sourceExportedAt);
    const importedAt = formatImportTimestamp(lastImport.importedAt);
    if (exportedAt) return `${fileName} · exported ${exportedAt}`;
    if (importedAt) return `${fileName} · imported ${importedAt} · age uses import time`;
    return fileName;
  }

  function createInsightsViewUi(context) {
    const {
      state,
      els,
      getInsightsModel,
      formatDuration,
    } = context;
    let renderedDatasetRevision = -1;
    let renderedDecisionRevision = -1;

    function renderInsights() {
      const model = getInsightsModel();
      const hasDatasetContext = Boolean(state.lastImport) || model.videoCount > 0;
      const hasVideos = model.videoCount > 0;
      const hasKnownDuration = model.knownDurationCount > 0;
      const hasKnownAge = model.knownAgeCount > 0;
      const datasetChanged = renderedDatasetRevision !== state.datasetRevision;
      const decisionsChanged = renderedDecisionRevision !== state.decisionRevision;

      if (datasetChanged) {
        els.insightsImportContext.textContent = getImportContext(state.lastImport);
        els.insightsSummary.hidden = !hasDatasetContext;
        els.insightsEmptyState.hidden = hasDatasetContext;
        els.insightsNextStep.hidden = !hasVideos;

        els.insightsChannelCount.textContent = formatCount(model.channelCount);
        els.insightsVideoCount.textContent = formatCount(model.videoCount);
        els.insightsWatchTime.textContent = hasKnownDuration
          ? formatDuration(model.totalDurationSeconds)
          : hasVideos
            ? "Unknown"
            : "—";
        els.insightsOldestAge.textContent = hasKnownAge
          ? formatApproximateAge(model.oldestVideo?.ageDays)
          : hasVideos
            ? "Unknown"
            : "—";
        els.insightsCoverageValue.textContent = hasVideos
          ? `${formatPercent(model.coverage.durationPercent)} time · ${formatPercent(model.coverage.agePercent)} age`
          : "—";

        els.insightsWatchTimeHint.textContent = hasVideos
          ? `${formatCount(model.knownDurationCount)} of ${formatCount(model.videoCount)} durations known`
          : "No videos in this import";
        els.insightsOldestHint.textContent = hasVideos
          ? `${formatCount(model.knownAgeCount)} of ${formatCount(model.videoCount)} ages parseable`
          : "No videos in this import";
        els.insightsCoverageHint.textContent = hasVideos
          ? `${formatPercent(model.coverage.channelIdentityPercent)} canonical channel identity`
          : "Coverage appears after import";
      }

      if (datasetChanged || decisionsChanged) {
        els.insightsUndecidedCount.textContent = formatCount(
          model.statusCounts.unreviewed,
        );
      }
      renderedDatasetRevision = state.datasetRevision;
      renderedDecisionRevision = state.decisionRevision;
    }

    return Object.freeze({
      renderInsights,
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.ui ||= {};
  app.ui.insightsView = Object.freeze({
    formatCount,
    formatPercent,
    formatApproximateAge,
    getImportContext,
    createInsightsViewUi,
  });
})(globalThis);
