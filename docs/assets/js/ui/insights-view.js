(function registerInsightsViewUi(root) {
  "use strict";

  const {
    buildChannelAgeMatrix,
    normalizeInsightsMeasure,
    normalizeInsightsSort,
  } = root.WatchLaterApp.domain.insights;

  const AGE_BUCKET_LABELS = Object.freeze({
    "0-7d": "0 to 7 days",
    "8-30d": "8 to 30 days",
    "1-3m": "1 to 3 months",
    "3-6m": "3 to 6 months",
    "6-12m": "6 to 12 months",
    "1y+": "1 year or older",
    unknown: "unknown age",
  });

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

  function getDurationCoverageLabel(knownCount, totalCount) {
    return `${formatCount(knownCount)} of ${formatCount(totalCount)} durations known`;
  }

  function getMatrixStatus(matrix) {
    if (matrix.search) {
      return `${formatCount(matrix.matchedChannelCount)} matching channels across the full backlog.`;
    }
    if (matrix.isLimited) {
      return `Showing the top ${formatCount(matrix.visibleChannelCount)} of ${formatCount(matrix.channelCount)} channels by backlog size.`;
    }
    return `Showing all ${formatCount(matrix.visibleChannelCount)} channels.`;
  }

  function createInsightsViewUi(context) {
    const {
      state,
      els,
      getInsightsModel,
      formatDuration,
      document: documentRef = root.document,
    } = context;
    let renderedDatasetRevision = -1;
    let renderedDecisionRevision = -1;
    let renderedMatrixSignature = "";
    let showAllChannels = false;
    let initialized = false;

    function setMeasureButtonState() {
      const buttons = els.insightsMeasureGroup.querySelectorAll(
        "[data-insights-measure]",
      );
      for (const button of buttons) {
        const isActive = button.dataset.insightsMeasure === state.insightsMeasure;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      }
    }

    function createValueContent(primaryText, secondaryText = "") {
      const value = documentRef.createElement("span");
      value.className = "insights-cell-value";
      value.textContent = primaryText;
      if (!secondaryText) return [value];
      const hint = documentRef.createElement("small");
      hint.textContent = secondaryText;
      return [value, hint];
    }

    function getHeatOpacity(value, maximum) {
      if (!maximum || !value) return "0";
      const ratio = Math.min(1, Math.max(0, value / maximum));
      return (0.08 + ratio * 0.62).toFixed(3);
    }

    function getMeasuredCellContent(cell) {
      if (state.insightsMeasure === "count") {
        return {
          primary: formatCount(cell.count),
          secondary: "",
          accessible: `${formatCount(cell.count)} videos`,
        };
      }
      if (!cell.count) {
        return {
          primary: "—",
          secondary: "",
          accessible: "no videos",
        };
      }
      if (!cell.knownDurationCount) {
        return {
          primary: "Unknown",
          secondary: `0/${formatCount(cell.count)} known`,
          accessible: `watch time unknown; ${getDurationCoverageLabel(0, cell.count)}`,
        };
      }
      return {
        primary: formatDuration(cell.durationSeconds),
        secondary: `${formatCount(cell.knownDurationCount)}/${formatCount(cell.count)} known`,
        accessible: `${formatDuration(cell.durationSeconds)} known watch time; ${getDurationCoverageLabel(cell.knownDurationCount, cell.count)}`,
      };
    }

    function createHeatCell(cell, maximum) {
      const tableCell = documentRef.createElement("td");
      tableCell.className = "insights-heat-cell";
      tableCell.style.setProperty(
        "--heat",
        getHeatOpacity(cell.scaleValue, maximum),
      );
      const content = getMeasuredCellContent(cell);
      tableCell.append(...createValueContent(content.primary, content.secondary));
      tableCell.setAttribute(
        "aria-label",
        `${AGE_BUCKET_LABELS[cell.key]}: ${content.accessible}`,
      );
      tableCell.title = tableCell.getAttribute("aria-label");
      return tableCell;
    }

    function createTotalCell(row) {
      const tableCell = documentRef.createElement("td");
      tableCell.className = "insights-total-cell";
      if (state.insightsMeasure === "count") {
        tableCell.append(...createValueContent(formatCount(row.totalCount)));
        tableCell.setAttribute(
          "aria-label",
          `Total: ${formatCount(row.totalCount)} videos`,
        );
        return tableCell;
      }

      if (!row.knownDurationCount) {
        tableCell.append(...createValueContent(
          row.totalCount ? "Unknown" : "—",
          row.totalCount ? `0/${formatCount(row.totalCount)} known` : "",
        ));
      } else {
        tableCell.append(...createValueContent(
          formatDuration(row.totalDurationSeconds),
          `${formatCount(row.knownDurationCount)}/${formatCount(row.totalCount)} known`,
        ));
      }
      tableCell.setAttribute(
        "aria-label",
        `Total known watch time: ${row.knownDurationCount ? formatDuration(row.totalDurationSeconds) : "unknown"}; ${getDurationCoverageLabel(row.knownDurationCount, row.totalCount)}`,
      );
      return tableCell;
    }

    function createChannelRow(row, scale) {
      const tableRow = documentRef.createElement("tr");
      if (row.channelKey === state.selectedChannelKey) {
        tableRow.classList.add("is-selected");
      }

      const channelHeader = documentRef.createElement("th");
      channelHeader.scope = "row";
      const channelButton = documentRef.createElement("button");
      channelButton.type = "button";
      channelButton.className = "insights-channel-button";
      channelButton.dataset.channelKey = row.channelKey;
      channelButton.setAttribute(
        "aria-pressed",
        String(row.channelKey === state.selectedChannelKey),
      );
      channelButton.title = `Select ${row.channelName}`;
      const channelName = documentRef.createElement("span");
      channelName.textContent = row.channelName;
      const channelMeta = documentRef.createElement("small");
      channelMeta.textContent = `${formatCount(row.totalCount)} videos`;
      channelButton.append(channelName, channelMeta);
      channelHeader.append(channelButton);
      tableRow.append(channelHeader);

      const maximum = scale === "channel"
        ? row.rowMaximum
        : renderedMatrix.globalMaximum;
      for (const cell of row.cells) {
        tableRow.append(createHeatCell(cell, maximum));
      }
      tableRow.append(createTotalCell(row));

      const undecidedCell = documentRef.createElement("td");
      undecidedCell.className = "insights-undecided-cell";
      undecidedCell.textContent = formatCount(row.undecidedCount);
      undecidedCell.setAttribute(
        "aria-label",
        `${formatCount(row.undecidedCount)} undecided videos`,
      );
      tableRow.append(undecidedCell);
      return tableRow;
    }

    let renderedMatrix = buildChannelAgeMatrix(null);

    function renderSelectedChannel(model) {
      const selected = model.channels.find(
        channel => channel.channelKey === state.selectedChannelKey,
      );
      if (!selected && state.selectedChannelKey) {
        state.selectedChannelKey = "";
      }
      els.insightsSelectedChannel.textContent = selected
        ? `Selected: ${selected.channelName} · ${formatCount(selected.totalCount)} videos · ${formatCount(selected.statusCounts.unreviewed)} undecided`
        : "Select a channel row to keep it in context.";
    }

    function renderMatrix(model) {
      const scale = els.insightsScale.value === "channel" ? "channel" : "global";
      const search = els.insightsSearch.value;
      const signature = [
        state.datasetRevision,
        state.decisionRevision,
        state.insightsMeasure,
        state.insightsSort,
        state.selectedChannelKey,
        search,
        scale,
        showAllChannels,
      ].join("|");
      if (signature === renderedMatrixSignature) return;

      renderedMatrix = buildChannelAgeMatrix(model, {
        measure: state.insightsMeasure,
        sort: state.insightsSort,
        search,
        showAll: showAllChannels,
      });
      const rows = renderedMatrix.rows.map(row => createChannelRow(row, scale));
      els.insightsMatrixBody.replaceChildren(...rows);
      els.insightsMatrixStatus.textContent = getMatrixStatus(renderedMatrix);
      els.insightsMatrixCaption.textContent = state.insightsMeasure === "count"
        ? "Video count by channel and approximate age"
        : "Known watch time by channel and approximate age; each populated cell reports duration coverage";
      els.insightsShowAll.hidden = !renderedMatrix.isLimited;
      els.insightsShowAll.textContent = renderedMatrix.isLimited
        ? `Show all ${formatCount(renderedMatrix.channelCount)} channels`
        : "Show all channels";
      renderSelectedChannel(model);
      setMeasureButtonState();
      renderedMatrixSignature = [
        state.datasetRevision,
        state.decisionRevision,
        state.insightsMeasure,
        state.insightsSort,
        state.selectedChannelKey,
        search,
        scale,
        showAllChannels,
      ].join("|");
    }

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
        els.insightsMatrix.hidden = !hasVideos;

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
      if (hasVideos) renderMatrix(model);
      renderedDatasetRevision = state.datasetRevision;
      renderedDecisionRevision = state.decisionRevision;
    }

    function initializeInsightsView() {
      if (initialized) return;
      initialized = true;
      state.insightsMeasure = normalizeInsightsMeasure(state.insightsMeasure);
      state.insightsSort = normalizeInsightsSort(state.insightsSort);
      els.insightsSort.value = state.insightsSort;
      setMeasureButtonState();

      els.insightsSearch.addEventListener("input", () => {
        showAllChannels = false;
        renderedMatrixSignature = "";
        renderInsights();
      });
      els.insightsMeasureGroup.addEventListener("click", event => {
        const button = event.target.closest("[data-insights-measure]");
        if (!button) return;
        state.insightsMeasure = normalizeInsightsMeasure(
          button.dataset.insightsMeasure,
        );
        renderedMatrixSignature = "";
        renderInsights();
      });
      els.insightsSort.addEventListener("change", () => {
        state.insightsSort = normalizeInsightsSort(els.insightsSort.value);
        renderedMatrixSignature = "";
        renderInsights();
      });
      els.insightsScale.addEventListener("change", () => {
        renderedMatrixSignature = "";
        renderInsights();
      });
      els.insightsShowAll.addEventListener("click", () => {
        showAllChannels = true;
        renderedMatrixSignature = "";
        renderInsights();
      });
      els.insightsMatrixBody.addEventListener("click", event => {
        const button = event.target.closest("[data-channel-key]");
        if (!button) return;
        state.selectedChannelKey = button.dataset.channelKey;
        renderedMatrixSignature = "";
        renderInsights();
      });
    }

    return Object.freeze({
      initializeInsightsView,
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
    getDurationCoverageLabel,
    getMatrixStatus,
    createInsightsViewUi,
  });
})(globalThis);
