(function registerInsightsViewUi(root) {
  "use strict";

  const {
    buildChannelAgeMatrix,
    buildChannelDetail,
    normalizeInsightsMeasure,
    normalizeInsightsSort,
    normalizeInsightsSettings,
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
  const STATUS_LABELS = Object.freeze({
    keep: "Keep",
    maybe: "Maybe",
    delete: "Delete",
    unreviewed: "Unreviewed",
    archive: "Archive",
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
      saveInsightsSettings = () => false,
      navigateToInsightsChannel = channelKey => {
        state.selectedChannelKey = channelKey;
        renderedMatrixSignature = "";
        renderInsights();
      },
      navigateToTriageFromInsights = () => {},
      now = () => Date.now(),
      document: documentRef = root.document,
    } = context;
    const getNow = typeof now === "function" ? now : () => now;
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

    function createDetailBar(label, value, percentValue, hint = "") {
      const row = documentRef.createElement("div");
      row.className = "insights-detail-bar-row";
      const heading = documentRef.createElement("div");
      heading.className = "insights-detail-bar-heading";
      const name = documentRef.createElement("span");
      name.textContent = label;
      const amount = documentRef.createElement("strong");
      amount.textContent = value;
      heading.append(name, amount);

      const track = documentRef.createElement("div");
      track.className = "insights-detail-bar-track";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", label);
      const numericPercent = Number(percentValue);
      const hasPercent = percentValue !== null
        && percentValue !== undefined
        && percentValue !== ""
        && Number.isFinite(numericPercent);
      const boundedPercent = hasPercent
        ? Math.min(100, Math.max(0, numericPercent))
        : 0;
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      if (hasPercent) {
        track.setAttribute("aria-valuenow", String(Math.round(boundedPercent)));
      } else {
        track.setAttribute("aria-valuetext", "Unknown");
      }
      const fill = documentRef.createElement("span");
      fill.style.setProperty("--bar-width", `${boundedPercent}%`);
      track.append(fill);
      row.append(heading, track);
      if (hint) {
        const description = documentRef.createElement("small");
        description.textContent = hint;
        row.append(description);
      }
      return row;
    }

    function createDetailVideoList(items, emptyText) {
      if (!items.length) {
        const empty = documentRef.createElement("p");
        empty.className = "insights-detail-empty";
        empty.textContent = emptyText;
        return [empty];
      }
      const list = documentRef.createElement("ol");
      list.className = "insights-detail-video-list";
      for (const item of items) {
        const listItem = documentRef.createElement("li");
        const title = item.url
          ? documentRef.createElement("a")
          : documentRef.createElement("span");
        title.textContent = item.title;
        if (item.url) {
          title.href = item.url;
          title.target = "_blank";
          title.rel = "noreferrer";
        }
        const meta = documentRef.createElement("small");
        meta.textContent = `${formatApproximateAge(item.ageDays)} · ${STATUS_LABELS[item.status] || item.status}`;
        listItem.append(title, meta);
        list.append(listItem);
      }
      return [list];
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

    function createHeatCell(cell, maximum, row) {
      const tableCell = documentRef.createElement("td");
      tableCell.className = "insights-heat-cell";
      tableCell.style.setProperty(
        "--heat",
        getHeatOpacity(cell.scaleValue, maximum),
      );
      const content = getMeasuredCellContent(cell);
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "insights-heat-button";
      button.dataset.channelKey = row.channelKey;
      button.dataset.channelName = row.channelName;
      button.dataset.ageBucket = cell.key;
      button.append(...createValueContent(content.primary, content.secondary));
      button.setAttribute(
        "aria-label",
        `View ${AGE_BUCKET_LABELS[cell.key]} videos from ${row.channelName} in Triage: ${content.accessible}`,
      );
      button.title = button.getAttribute("aria-label");
      tableCell.append(button);
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
        tableRow.append(createHeatCell(cell, maximum, row));
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
      if (!selected) {
        if (state.selectedChannelKey) state.selectedChannelKey = "";
        els.insightsWorkspace.classList.toggle("has-detail", false);
        els.insightsChannelDetail.hidden = true;
        els.insightsSelectedChannel.textContent = "Select a channel row to keep it in context.";
        return null;
      }

      state.insightsSettings = normalizeInsightsSettings(state.insightsSettings);
      const detail = buildChannelDetail(
        model,
        state.insightsCache?.videoFacts,
        state.selectedChannelKey,
        {
          ...state.insightsSettings,
          now: getNow(),
          hasImportBaseline: state.importComparison?.baselineAvailable === true,
        },
      );
      if (!detail) {
        state.selectedChannelKey = "";
        els.insightsWorkspace.classList.toggle("has-detail", false);
        els.insightsChannelDetail.hidden = true;
        els.insightsSelectedChannel.textContent = "Select a channel row to keep it in context.";
        return null;
      }

      els.insightsWorkspace.classList.toggle("has-detail", true);
      els.insightsChannelDetail.hidden = false;
      els.insightsDetailTitle.textContent = detail.channelName;
      els.insightsViewVideos.title = `View ${detail.channelName} videos in Triage`;
      els.insightsDetailMeta.textContent = `${formatCount(detail.totalCount)} videos · ${detail.knownDurationCount
        ? `${formatDuration(detail.totalDurationSeconds)} known watch time`
        : "watch time unknown"} · average age ${formatApproximateAge(detail.averageAgeDays)}`;
      els.insightsSelectedChannel.textContent = `Selected: ${detail.channelName} · ${formatCount(detail.totalCount)} videos · ${formatCount(detail.decisionHealth.statusMix.find(item => item.status === "unreviewed")?.count)} undecided`;

      els.insightsDetailBacklog.replaceChildren(
        createDetailBar(
          "Videos",
          formatPercent(detail.backlogImpact.videoPercent),
          detail.backlogImpact.videoPercent,
          `${formatCount(detail.totalCount)} of ${formatCount(model.videoCount)} backlog videos`,
        ),
        createDetailBar(
          "Known watch time",
          detail.backlogImpact.knownWatchTimePercent === null
            ? "Unknown"
            : formatPercent(detail.backlogImpact.knownWatchTimePercent),
          detail.backlogImpact.knownWatchTimePercent,
          `${formatCount(detail.knownDurationCount)} of ${formatCount(detail.totalCount)} channel durations known`,
        ),
        createDetailBar(
          "Undecided backlog",
          detail.backlogImpact.undecidedPercent === null
            ? "None in backlog"
            : formatPercent(detail.backlogImpact.undecidedPercent),
          detail.backlogImpact.undecidedPercent,
          "Share of all currently unreviewed videos",
        ),
      );
      els.insightsDetailBacklog.setAttribute(
        "aria-label",
        `${detail.channelName} has ${formatPercent(detail.backlogImpact.videoPercent)} of backlog videos`,
      );

      els.insightsStaleDays.value = String(detail.decisionHealth.staleDays);
      const staleRow = detail.decisionHealth.staleDays === "off"
        ? createDetailBar(
          "Stale decisions",
          "Off",
          null,
          "Age-based decision review is disabled.",
        )
        : createDetailBar(
          "Stale decisions",
          formatCount(detail.decisionHealth.staleCount),
          detail.decisionHealth.stalePercent,
          `${formatCount(detail.decisionHealth.staleEligibleCount)} of ${formatCount(detail.decisionHealth.decidedCount)} decisions have a timestamp; threshold includes the boundary day.`,
        );
      const decisionRows = [
        createDetailBar(
          "Explicitly decided",
          `${formatCount(detail.decisionHealth.decidedCount)} / ${formatCount(detail.decisionHealth.statusMixDenominator)}`,
          detail.decisionHealth.reviewedPercent,
          "Keep, Maybe, Delete, and Archive count as explicit decisions.",
        ),
        createDetailBar(
          "Maybe among decided",
          detail.decisionHealth.decidedCount
            ? formatPercent(detail.decisionHealth.maybePercentOfDecided)
            : "No decisions",
          detail.decisionHealth.decidedCount
            ? detail.decisionHealth.maybePercentOfDecided
            : null,
          "A review proxy, not a measure of decision quality.",
        ),
        staleRow,
      ];
      for (const status of detail.decisionHealth.statusMix) {
        decisionRows.push(createDetailBar(
          STATUS_LABELS[status.status],
          `${formatCount(status.count)} / ${formatCount(detail.decisionHealth.statusMixDenominator)}`,
          status.percent,
        ));
      }
      els.insightsDetailDecision.replaceChildren(...decisionRows);
      els.insightsDetailDecision.setAttribute(
        "aria-label",
        `${formatCount(detail.decisionHealth.decidedCount)} of ${formatCount(detail.decisionHealth.statusMixDenominator)} videos explicitly decided; status percentages use all channel videos as the denominator`,
      );

      els.insightsDetailAge.replaceChildren(
        ...detail.ageDistribution.map(bucket => createDetailBar(
          AGE_BUCKET_LABELS[bucket.key],
          formatCount(bucket.count),
          bucket.percent,
          `${formatPercent(bucket.percent)} of this channel`,
        )),
      );
      els.insightsDetailAge.setAttribute(
        "aria-label",
        `Approximate age distribution for ${formatCount(detail.totalCount)} channel videos`,
      );

      els.insightsDetailOldest.replaceChildren(...createDetailVideoList(
        detail.oldestUntouched,
        "No untouched videos in this channel.",
      ));
      els.insightsDetailOldest.setAttribute(
        "aria-label",
        `${formatCount(detail.oldestUntouchedCount)} untouched videos; ${formatCount(detail.oldestUntouchedUnknownAgeCount)} have unknown age`,
      );

      const newEmptyText = detail.newSinceLastImportAvailable
        ? "No videos from this channel are new since the last import."
        : "A previous import baseline is needed before new videos can be identified.";
      els.insightsDetailNew.replaceChildren(...createDetailVideoList(
        detail.newSinceLastImport,
        newEmptyText,
      ));
      els.insightsDetailNew.setAttribute(
        "aria-label",
        detail.newSinceLastImportAvailable
          ? `${formatCount(detail.newSinceLastImportCount)} videos new since the last import`
          : "New-since-last-import comparison unavailable",
      );
      return detail;
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
      else renderSelectedChannel(model);
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
      els.insightsStaleDays.addEventListener("change", () => {
        state.insightsSettings = normalizeInsightsSettings({
          decisionStaleDays: els.insightsStaleDays.value,
        });
        saveInsightsSettings(state.insightsSettings);
        renderSelectedChannel(getInsightsModel());
      });
      els.insightsViewVideos.addEventListener("click", () => {
        if (!state.selectedChannelKey) return;
        navigateToTriageFromInsights({
          channelKey: state.selectedChannelKey,
        });
      });
      els.insightsMatrixBody.addEventListener("click", event => {
        const button = event.target.closest("[data-channel-key]");
        if (!button) return;
        if (button.dataset.ageBucket) {
          navigateToTriageFromInsights({
            channelKey: button.dataset.channelKey,
            channelName: button.dataset.channelName,
            ageBucket: button.dataset.ageBucket,
          });
          return;
        }
        navigateToInsightsChannel(button.dataset.channelKey);
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
