(function registerTriageController(root) {
  "use strict";

  function createTriageController(dependencies) {
    const {
      config,
      decisions,
      watchLaterImport,
      importComparison,
      filters,
      insights,
      timeBudget,
      grouping,
      workspace,
      persistence,
      browserIo,
      state,
      els,
      createDialogsUi,
      createTriageViewUi,
      createVideoListUi,
      createDashboardsUi,
      createActionMenusUi,
      createInsightsViewUi,
      createGroupsViewUi,
      createNavigationUi,
      getKeyboardShortcutAction,
      document,
      window,
      crypto,
    } = dependencies;
    const {
      PAGE_SIZE,
      BULK_CONFIRM_THRESHOLD,
      MAX_HISTORY_ENTRIES,
      RULES,
    } = config;
    const {
      ruleMatchesVideo,
      updateDecisionDetails,
      normalizeRule,
      normalizeChannelRules,
      normalizeChannelRule,
      getChannelRuleDecision,
      getChannelRuleImpact,
      getCombinedChannelRuleImpact,
      getProtectedChannelMatches,
      splitInputValues,
      parseDecisionsPayload,
      previewDecisionsMerge,
      getPortableDecisions,
      normalizeDecision,
      normalizeTags,
      areDecisionsEqual,
      createGroupDecisionPlan,
      applyDecisionPlan,
      isUndoableBulkHistoryEntry,
      createHistoryEntry,
      createSnapshotId,
      mergeHistoryEntries,
      applyHistoryEntry,
    } = decisions;
    const {
      normalizeWatchLaterPayload,
    } = watchLaterImport;
    const {
      dedupeVideos,
      createDatasetBaseline,
      compareVideoDatasets,
    } = importComparison;
    const {
      videoMatchesFilters,
      normalizeFilterState,
      getAdvancedFilterEntries,
      buildInsightsTriageFilters,
      filterChannelOptions,
      getChannelOptionPage,
    } = filters;
    const {
      getMemoizedInsightsModel,
    } = insights;
    const {
      buildTimeBudgetSummary,
      formatDuration,
    } = timeBudget;
    const {
      getMemoizedVideoGroups,
      chooseGroupWinner,
      parseSeriesTitle,
    } = grouping;
    const {
      buildWorkspacePayload,
      parseWorkspacePayload,
      toWorkspaceVideo,
      normalizeWorkspaceUi,
    } = workspace;
    const {
      parseJsonText,
      serializeJson,
      readFileText,
      downloadTextFile,
    } = browserIo;
    const uiContext = {
      state,
      els,
      document,
      window,
      PAGE_SIZE,
      RULES,
      updateDecisionDetails,
      normalizeRule,
      normalizeChannelRules,
      normalizeChannelRule,
      getChannelRuleDecision,
      getChannelRuleImpact,
      getCombinedChannelRuleImpact,
      getProtectedChannelMatches,
      splitInputValues,
      normalizeTags,
      areDecisionsEqual,
      createGroupDecisionPlan,
      applyDecisionPlan,
      normalizeFilterState,
      getAdvancedFilterEntries,
      buildInsightsTriageFilters,
      createSnapshotId,
      getMemoizedVideoGroups,
      chooseGroupWinner,
      parseSeriesTitle,
      buildTimeBudgetSummary,
      formatDuration,
      filterChannelOptions,
      getChannelOptionPage,
      getFilteredVideos,
      getStatus,
      getDecision,
      getVideoTags,
      setStatus,
      setStatusAndAdvance,
      moveCurrent,
      render,
      renderActiveView,
      applyFilterState,
      getInsightsModel,
      showToast,
      saveDecisions,
      savePreviewProgress,
      saveUserRules,
      saveChannelRules,
      saveTimeBudgetHours,
      saveInsightsSettings,
      renderTagFilters,
      getEffectiveRules,
      refreshEnrichedVideos,
      getAllChannelNames,
      getAllTagNames,
      groupCounts,
      createCount,
      handleFilterChange,
      getTagCounts,
      addHistoryEntry,
      syncUndoAvailability,
      getActiveFilterSummary,
      getInboxIds,
      createChannelName,
      restoreHistoryEntry,
      renderBadgeOptions,
    };
    const triageViewUi = createTriageViewUi(uiContext);
    Object.assign(uiContext, triageViewUi);
    const dialogUi = createDialogsUi(uiContext);
    Object.assign(uiContext, dialogUi);
    const videoListUi = createVideoListUi(uiContext);
    Object.assign(uiContext, videoListUi);
    const dashboardUi = createDashboardsUi(uiContext);
    Object.assign(uiContext, dashboardUi);
    const actionMenusUi = createActionMenusUi(uiContext);
    const navigationUi = createNavigationUi(uiContext);
    Object.assign(uiContext, navigationUi);
    const insightsViewUi = createInsightsViewUi(uiContext);
    Object.assign(uiContext, insightsViewUi);
    const groupsViewUi = createGroupsViewUi(uiContext);
    Object.assign(uiContext, groupsViewUi);
    const {
      initializeTriageView,
      setAdvancedFiltersOpen,
      captureFilterState,
      applyFilterStateToControls,
      renderCompactFilters,
    } = triageViewUi;
    const {
      buildYouTubeEmbedUrl,
      formatPreviewTime,
      openQuickPreview,
      closeQuickPreview,
      initializePreviewPlayer,
      handlePreviewPlayerMessage,
      flushPreviewProgress,
      startPreviewDecisionTimer,
      setPreviewStatusAndAdvance,
      moveQuickPreview,
      openShortcutHelp,
      openVideoEditor,
      saveVideoEditor,
      openRulesDialog,
      resetRuleEditor,
      saveRuleEditor,
      openChannelRulesDialog,
      getChannelRuleChannelOptions,
      openChannelRuleChannelMenu,
      closeChannelRuleChannelMenu,
      selectChannelRuleChannel,
      renderChannelRulePreview,
      resetChannelRuleEditor,
      saveChannelRuleEditor,
      applyCurrentChannelRule,
      applyAllPendingChannelRules,
    } = dialogUi;
    const {
      initializeVideoList,
      getRenderedVideos,
      maybeRenderMore,
      scrollCurrentIntoView,
      ensureCurrentVisible,
      renderVideoList,
    } = videoListUi;
    const {
      renderStats,
      countStatuses,
      updateBulkLabels,
      renderImportComparison,
      renderSidebar,
      renderHistory,
    } = dashboardUi;
    const {
      initializeActionMenus,
    } = actionMenusUi;
    const {
      initializeInsightsView,
      renderInsights,
    } = insightsViewUi;
    const {
      initializeGroupsView,
      renderGroups,
    } = groupsViewUi;
    const {
      initializeNavigation,
    } = navigationUi;

    function init() {
      renderBadgeOptions();
      renderTagFilters();
      renderSavedViews();
      bindEvents();
      initializeTriageView();
      initializeVideoList();
      initializeActionMenus();
      initializeInsightsView();
      initializeGroupsView();
      initializeNavigation();
    }

    function bindEvents() {
      els.fileInput.addEventListener("change", importFile);
      els.insightsImportJsonAction.addEventListener("click", () => {
        els.fileInput.click();
      });
      els.searchInput.addEventListener("input", () => {
        handleFilterChange();
      });
      els.statusFilter.addEventListener("change", () => {
        handleFilterChange();
      });
      els.channelSearch.addEventListener("focus", () => {
        openChannelMenu();
      });
      els.channelSearch.addEventListener("input", () => {
        openChannelMenu();
      });
      els.channelSearch.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          closeChannelMenu();
          els.channelSearch.blur();
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          const first = getChannelOptions()[0];
          if (first) toggleChannel(first.name);
        }
      });
      document.addEventListener("click", event => {
        if (!event.target.closest("#channelCombo")) closeChannelMenu();
        if (!event.target.closest("#channelRuleChannelCombo")) closeChannelRuleChannelMenu();
      });
      els.sortSelect.addEventListener("change", handleFilterChange);
      [
        els.minDurationInput,
        els.maxDurationInput,
        els.minViewsInput,
      ].forEach(input => input.addEventListener("input", handleFilterChange));
      [
        els.minAgeInput,
        els.maxAgeInput,
      ].forEach(input => input.addEventListener("input", () => {
        state.activeAgeBucket = "";
        state.activeAgeAnchorAt = "";
        handleFilterChange();
      }));
      [
        els.availabilityFilter,
        els.badgeFilter,
        els.suggestedTagFilter,
        els.noteFilter,
        els.tagModeSelect,
      ].forEach(select => select.addEventListener("change", handleFilterChange));
      els.savedViewSelect.addEventListener("change", applySelectedSavedView);
      els.saveView.addEventListener("click", saveCurrentView);
      els.deleteView.addEventListener("click", deleteCurrentView);
      els.clearFilters.addEventListener("click", clearFilters);
      els.datasetViews.addEventListener("click", event => {
        const button = event.target.closest("[data-dataset-view]");
        if (!button || button.disabled) return;
        state.datasetView = button.dataset.datasetView;
        state.selectedIds.clear();
        handleFilterChange();
      });
      els.keepBulk.addEventListener("click", () => applyBulkStatus("keep"));
      els.maybeBulk.addEventListener("click", () => applyBulkStatus("maybe"));
      els.deleteBulk.addEventListener("click", () => applyBulkStatus("delete"));
      els.resetBulk.addEventListener("click", () => applyBulkStatus("unreviewed"));
      els.selectVisible.addEventListener("click", selectVisible);
      els.invertSelection.addEventListener("click", invertVisibleSelection);
      els.clearSelection.addEventListener("click", clearSelection);
      els.shortcutHelpButton.addEventListener("click", openShortcutHelp);
      els.exportKeepMaybe.addEventListener("click", exportKeepMaybe);
      els.exportDeleteCandidates.addEventListener("click", exportDeleteCandidates);
      els.exportSelected.addEventListener("click", exportSelectedVideos);
      els.exportVisible.addEventListener("click", exportVisibleVideos);
      els.exportTagged.addEventListener("click", exportTaggedAll);
      els.exportDecisions.addEventListener("click", exportDecisions);
      els.decisionsInput.addEventListener("change", importDecisionsFile);
      els.exportWorkspace.addEventListener("click", exportWorkspace);
      els.workspaceInput.addEventListener("change", importWorkspaceFile);
      els.clearDecisions.addEventListener("click", clearDecisions);
      els.undoBulk.addEventListener("click", undoLastBulkChange);
      els.closeQuickPreview.addEventListener("click", () => els.quickPreviewDialog.close());
      els.quickPreviewDialog.addEventListener("close", closeQuickPreview);
      els.closeShortcutHelp.addEventListener("click", () => els.shortcutHelpDialog.close());
      els.quickPreviewPlayer.addEventListener("load", initializePreviewPlayer);
      els.startPreviewTimer.addEventListener("click", startPreviewDecisionTimer);
      els.quickPreviewStatusActions.addEventListener("click", event => {
        const button = event.target.closest("[data-preview-status]");
        if (button) setPreviewStatusAndAdvance(button.dataset.previewStatus);
      });
      els.manageRules.addEventListener("click", openRulesDialog);
      els.videoEditorForm.addEventListener("submit", saveVideoEditor);
      els.cancelVideoEditor.addEventListener("click", () => els.videoEditorDialog.close());
      els.ruleEditorForm.addEventListener("submit", saveRuleEditor);
      els.newRule.addEventListener("click", resetRuleEditor);
      els.closeRules.addEventListener("click", () => els.rulesDialog.close());
      els.manageChannelRules.addEventListener("click", openChannelRulesDialog);
      els.channelRuleEditorForm.addEventListener("submit", saveChannelRuleEditor);
      els.channelRuleChannelInput.addEventListener("focus", openChannelRuleChannelMenu);
      els.channelRuleChannelInput.addEventListener("input", () => {
        renderChannelRulePreview();
        openChannelRuleChannelMenu();
      });
      els.channelRuleChannelInput.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          closeChannelRuleChannelMenu();
          return;
        }
        if (event.key === "Enter") {
          const first = getChannelRuleChannelOptions()[0];
          if (!first) return;
          event.preventDefault();
          selectChannelRuleChannel(first.name);
        }
      });
      [els.channelRuleModeSelect, els.channelRuleTagInput, els.channelRuleProtectedInput]
        .forEach(input => input.addEventListener("input", renderChannelRulePreview));
      els.newChannelRule.addEventListener("click", resetChannelRuleEditor);
      els.applyChannelRule.addEventListener("click", applyCurrentChannelRule);
      els.applyAllChannelRules.addEventListener("click", applyAllPendingChannelRules);
      els.closeChannelRules.addEventListener("click", () => els.channelRulesDialog.close());
      document.addEventListener("keydown", handleShortcuts);
      window.addEventListener("message", handlePreviewPlayerMessage);
      window.addEventListener("beforeunload", flushPreviewProgress);
      window.addEventListener("scroll", maybeRenderMore);
    }

    async function importFile(event) {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const raw = await readFileText(file);
        const parsed = parseJsonText(raw);
        const importedAt = new Date().toISOString();
        const normalizedImport = normalizeWatchLaterPayload(parsed, importedAt);

        const deduped = dedupeVideos(normalizedImport.videos)
          .map(video => enrichVideo(video))
          .filter(video => video.videoId);

        const currentImport = {
          fileName: file.name,
          importedAt,
          videoCount: deduped.length,
          sourceSchemaVersion: normalizedImport.schemaVersion,
          sourceExportedAt: normalizedImport.exportedAt,
          sourceMode: typeof parsed?.mode === "string" ? parsed.mode : "",
          ageAnchorAt: normalizedImport.ageAnchorAt,
          ageAnchorSource: normalizedImport.ageAnchorSource,
        };
        const inMemoryBaselineAvailable = state.videos.length > 0 || state.lastImport !== null;
        const previousVideos = inMemoryBaselineAvailable
          ? state.videos.map(toWorkspaceVideo)
          : state.datasetBaseline?.videos;
        const previousImport = inMemoryBaselineAvailable
          ? state.lastImport
          : state.datasetBaseline?.lastImport;
        const comparison = compareVideoDatasets(
          Array.isArray(previousVideos) ? previousVideos : null,
          deduped,
          state.decisions,
          previousImport,
          currentImport,
        );

        state.videos = deduped;
        state.datasetRevision++;
        state.selectedIds.clear();
        state.activeTags.clear();
        state.activeChannels.clear();
        state.activeSavedViewId = "";
        state.importComparison = comparison;
        state.datasetView = comparison.baselineAvailable && getInboxIds(comparison).length ? "inbox" : "all";
        state.renderedCount = PAGE_SIZE;
        state.currentId = deduped[0]?.videoId || "";
        state.lastImport = currentImport;
        state.datasetBaseline = createDatasetBaseline(deduped, currentImport);
        const baselineSaved = saveDatasetBaseline(state.datasetBaseline);
        applyFilterState({ datasetView: state.datasetView });
        populateChannels();
        renderBadgeOptions();
        renderTagFilters();
        renderSavedViews();
        render();
        const comparisonText = comparison.baselineAvailable
          ? ` ${comparison.newIds.length} new, ${comparison.removedVideos.length} no longer present.`
          : " This import is now the comparison baseline.";
        const storageText = baselineSaved ? "" : " The comparison baseline could not be saved locally.";
        showToast(`Imported ${deduped.length} videos from ${file.name}.${comparisonText}${storageText}`);
      } catch (error) {
        showToast(error.message || "Import failed.");
      } finally {
        event.target.value = "";
      }
    }

    function enrichVideo(video) {
      const suggestedTags = getSuggestedTags(video);
      return {
        ...video,
        suggestedTags,
        searchText: buildSearchText(video, suggestedTags),
      };
    }

    function buildSearchText(video, tags) {
      return [
        video.searchText,
        video.title,
        video.channel,
        video.views,
        video.uploaded,
        video.duration,
        tags.join(" "),
      ].filter(Boolean).join(" ").toLowerCase();
    }

    function getSuggestedTags(video) {
      return Object.entries(getEffectiveRules())
        .filter(([, rule]) => ruleMatchesVideo(video, rule))
        .map(([tag]) => tag);
    }

    function getEffectiveRules() {
      const builtInRules = Object.fromEntries(
        Object.entries(RULES).map(([name, keywords]) => [name, normalizeRule({ positive: keywords })]),
      );
      return { ...builtInRules, ...state.userRules };
    }

    function refreshEnrichedVideos() {
      state.videos = state.videos.map(video => enrichVideo(toWorkspaceVideo(video)));
    }

    function getDecision(videoId) {
      return state.decisions[videoId] ? normalizeDecision(state.decisions[videoId]) : {
        status: "unreviewed",
        tags: [],
        note: "",
        updatedAt: "",
      };
    }

    function getStatus(videoId) {
      return getDecision(videoId).status || "unreviewed";
    }

    function setStatus(videoId, status, shouldSave = true) {
      const current = getDecision(videoId);
      if (status === "unreviewed") {
        const reset = {
          ...current,
          status,
          updatedAt: new Date().toISOString(),
        };
        if (reset.tags.length || reset.note.trim()) state.decisions[videoId] = reset;
        else delete state.decisions[videoId];
        state.currentId = videoId;
        if (shouldSave) saveDecisions();
        return;
      }

      state.decisions[videoId] = {
        ...current,
        status,
        updatedAt: new Date().toISOString(),
      };
      state.currentId = videoId;
      if (shouldSave) saveDecisions();
    }

    function setStatusAndAdvance(videoId, status, options = {}) {
      setStatus(videoId, status);
      moveCurrent(1);
      render({
        scrollToCurrent: true,
        focusCurrent: Boolean(options.focusCurrent),
      });
    }

    function moveCurrent(direction) {
      const videos = getFilteredVideos();
      if (!videos.length) {
        state.currentId = "";
        return;
      }

      const currentIndex = videos.findIndex(video => video.videoId === state.currentId);
      const nextIndex = currentIndex === -1
        ? 0
        : Math.min(Math.max(currentIndex + direction, 0), videos.length - 1);
      state.currentId = videos[nextIndex].videoId;

      if (nextIndex >= state.renderedCount - 4) {
        state.renderedCount = Math.min(videos.length, state.renderedCount + PAGE_SIZE);
      }
    }

    function applyBulkStatus(status) {
      const ids = getScopeIds();
      if (!ids.length) return;
      const scopeName = state.selectedIds.size ? "selected" : "visible";
      const protectedMatches = status === "delete"
        ? getProtectedChannelMatches(state.videos, ids, state.channelRules)
        : [];
      if (protectedMatches.length || ids.length > BULK_CONFIRM_THRESHOLD) {
        const label = status === "unreviewed" ? "reset" : status;
        const protectedChannels = Array.from(new Set(protectedMatches.map(match => match.channel)));
        const warning = protectedMatches.length
          ? `\n\nWarning: ${protectedMatches.length} videos belong to protected channels: ${protectedChannels.join(", ")}.`
          : "";
        const ok = confirm(`Apply "${label}" to ${ids.length} ${scopeName} videos?${warning}`);
        if (!ok) return;
      }
      const label = status === "unreviewed" ? "unreviewed" : status;
      if (!addHistoryEntry(`${ids.length} ${scopeName} → ${label}`, "bulk-status", ids)) {
        showToast("Bulk change cancelled because the local safety snapshot could not be saved.");
        return;
      }
      ids.forEach(videoId => setStatus(videoId, status, false));
      saveDecisions();
      state.selectedIds.clear();
      render();
      showToast(status === "unreviewed"
        ? `Reset ${ids.length} videos to unreviewed.`
        : `Marked ${ids.length} videos as ${status}.`);
    }

    function getScopeIds() {
      if (state.selectedIds.size) return Array.from(state.selectedIds);
      return getFilteredVideos().map(video => video.videoId);
    }

    function selectVisible() {
      getRenderedVideos().forEach(video => state.selectedIds.add(video.videoId));
      render();
    }

    function invertVisibleSelection() {
      for (const video of getRenderedVideos()) {
        if (state.selectedIds.has(video.videoId)) state.selectedIds.delete(video.videoId);
        else state.selectedIds.add(video.videoId);
      }
      render();
    }

    function clearSelection() {
      if (!state.selectedIds.size) {
        showToast("No selected videos to clear.");
        return;
      }
      state.selectedIds.clear();
      render();
      showToast("Cleared selected videos.");
    }

    function clearFilters() {
      applyFilterState({});
      setAdvancedFiltersOpen(false);
      showToast("Cleared filters.");
    }

    function handleFilterChange() {
      state.activeSavedViewId = "";
      state.renderedCount = PAGE_SIZE;
      state.renderedGroupCount = 100;
      renderSavedViews();
      renderTagFilters();
      renderChannelMenu();
      render();
    }

    function getFilteredVideos() {
      const filters = captureFilterState();
      const datasetIds = getDatasetViewIds(state.datasetView);

      return getSortedVideos(state.videos.filter(video => {
        if (datasetIds && !datasetIds.has(video.videoId)) return false;
        if (state.datasetView === "inbox" && getStatus(video.videoId) !== "unreviewed") return false;
        return videoMatchesFilters(video, getDecision(video.videoId), filters);
      }));
    }

    function getVideoTags(video) {
      return Array.from(new Set([
        ...(video.suggestedTags || []),
        ...(getDecision(video.videoId).tags || []),
      ]));
    }

    function getVideoSearchText(video) {
      const decision = getDecision(video.videoId);
      return [video.searchText, ...(decision.tags || []), decision.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    }

    function getSortedVideos(videos) {
      const sort = els.sortSelect.value;
      const copy = [...videos];

      if (sort === "channel") {
        copy.sort((a, b) => `${a.channel} ${a.index}`.localeCompare(`${b.channel} ${b.index}`));
      } else if (sort === "duration-desc") {
        copy.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));
      } else if (sort === "views-desc") {
        copy.sort((a, b) => (b.viewCountApprox || 0) - (a.viewCountApprox || 0));
      } else if (sort === "title") {
        copy.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      } else if (sort === "index-desc") {
        copy.sort((a, b) => (b.index || 0) - (a.index || 0));
      } else {
        copy.sort((a, b) => (a.index || 0) - (b.index || 0));
      }

      return copy;
    }

    function render(options = {}) {
      renderActiveView(options);
    }

    function renderActiveView(options = {}) {
      syncUndoAvailability();
      if (state.activeView === "insights") {
        renderInsights();
        return;
      }
      if (state.activeView === "groups") {
        renderGroups();
        return;
      }
      if (state.activeView !== "triage") return;
      ensureCurrentVisible();
      renderStats();
      renderVideoList();
      renderSidebar();
      renderHistory();
      renderImportComparison();
      updateBulkLabels();
      renderCompactFilters();
      if (options.scrollToCurrent) {
        scrollCurrentIntoView({ focus: Boolean(options.focusCurrent) });
      }
    }

    function getInsightsModel() {
      return getMemoizedInsightsModel(state.insightsCache, {
        videos: state.videos,
        decisions: state.decisions,
        importContext: {
          ...(state.lastImport || {}),
          importComparison: state.importComparison,
        },
        datasetRevision: state.datasetRevision,
        decisionRevision: state.decisionRevision,
      });
    }

    function getDatasetViewIds(view) {
      const comparison = state.importComparison;
      if (!comparison.baselineAvailable || view === "all") return null;
      if (view === "inbox" || view === "new") return new Set(comparison.newIds);
      if (view === "changed") return new Set(comparison.changedIds);
      if (view === "decided") return new Set(comparison.decidedIds);
      return null;
    }

    function getInboxIds(comparison = state.importComparison) {
      return comparison.newIds.filter(videoId => getStatus(videoId) === "unreviewed");
    }

    function applyFilterState(value, options = {}) {
      applyFilterStateToControls(value);
      state.activeSavedViewId = options.savedViewId || "";
      state.selectedIds.clear();
      state.renderedCount = PAGE_SIZE;
      state.renderedGroupCount = 100;
      renderTagFilters();
      renderChannelMenu();
      renderSavedViews();
      if (options.render !== false) render();
    }

    function renderBadgeOptions(selectedValue = els.badgeFilter.value || "all") {
      const specialOptions = [
        ["all", "Any badge state"],
        ["any", "Has a badge"],
        ["none", "Has no badge"],
      ];
      const badgeNames = Array.from(new Set(state.videos.flatMap(video => normalizeTags(video.badges))))
        .sort((a, b) => a.localeCompare(b));
      if (selectedValue.startsWith("badge:") && !badgeNames.includes(selectedValue.slice(6))) {
        badgeNames.push(selectedValue.slice(6));
      }
      const options = [
        ...specialOptions.map(([value, label]) => createOption(value, label)),
        ...badgeNames.map(badge => createOption(`badge:${badge}`, badge)),
      ];
      els.badgeFilter.replaceChildren(...options);
      els.badgeFilter.value = hasOption(els.badgeFilter, selectedValue) ? selectedValue : "all";
    }

    function createOption(value, label) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }

    function renderSavedViews() {
      const placeholder = createOption("", state.savedViews.length ? "Choose a saved view" : "No saved views yet");
      const options = state.savedViews.map(view => createOption(view.id, view.name));
      els.savedViewSelect.replaceChildren(placeholder, ...options);
      els.savedViewSelect.value = state.savedViews.some(view => view.id === state.activeSavedViewId)
        ? state.activeSavedViewId
        : "";
      els.deleteView.disabled = !els.savedViewSelect.value;
    }

    function applySelectedSavedView() {
      const view = state.savedViews.find(candidate => candidate.id === els.savedViewSelect.value);
      if (!view) {
        state.activeSavedViewId = "";
        els.deleteView.disabled = true;
        return;
      }
      applyFilterState(view.filters, { savedViewId: view.id });
      showToast(`Applied saved view "${view.name}".`);
    }

    function saveCurrentView() {
      const current = state.savedViews.find(view => view.id === state.activeSavedViewId);
      const name = prompt("Name this saved view:", current?.name || "")?.trim();
      if (!name) return;
      const existing = state.savedViews.find(view => view.name.toLowerCase() === name.toLowerCase());
      if (existing && existing.id !== current?.id && !confirm(`Replace the saved view "${existing.name}"?`)) return;
      const now = new Date().toISOString();
      const target = existing || current;
      const view = {
        id: target?.id || createSavedViewId(),
        name,
        filters: captureFilterState(),
        createdAt: target?.createdAt || now,
        updatedAt: now,
      };
      state.savedViews = [
        ...state.savedViews.filter(candidate => candidate.id !== view.id),
        view,
      ].sort((a, b) => a.name.localeCompare(b.name));
      state.activeSavedViewId = view.id;
      persistence.saveSavedViews(state.savedViews);
      renderSavedViews();
      showToast(`Saved view "${name}".`);
    }

    function createSavedViewId() {
      if (crypto?.randomUUID) return crypto.randomUUID();
      return `view-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function deleteCurrentView() {
      const view = state.savedViews.find(candidate => candidate.id === els.savedViewSelect.value);
      if (!view || !confirm(`Delete the saved view "${view.name}"?`)) return;
      state.savedViews = state.savedViews.filter(candidate => candidate.id !== view.id);
      state.activeSavedViewId = "";
      persistence.saveSavedViews(state.savedViews);
      renderSavedViews();
      showToast(`Deleted saved view "${view.name}".`);
    }

    function getActiveFilterSummary() {
      const current = captureFilterState();
      const filters = [];
      const query = current.search.trim();
      if (query) filters.push(`search="${query}"`);
      if (current.status !== "all") filters.push(`status=${current.status}`);
      if (current.channels.length) filters.push(`channels=${current.channels.join(" OR ")}`);
      if (current.tags.length) filters.push(`tags=${current.tags.join(current.tagMode === "and" ? " AND " : " OR ")}`);
      if (current.minDurationMinutes !== "") filters.push(`duration>=${current.minDurationMinutes}m`);
      if (current.maxDurationMinutes !== "") filters.push(`duration<=${current.maxDurationMinutes}m`);
      if (current.minAgeDays !== "") filters.push(`age>=${current.minAgeDays}d`);
      if (current.maxAgeDays !== "") filters.push(`age<=${current.maxAgeDays}d`);
      if (current.minViews !== "") filters.push(`views>=${Number(current.minViews).toLocaleString()}`);
      if (current.availability !== "all") filters.push(current.availability);
      if (current.badge !== "all") filters.push(current.badge.startsWith("badge:") ? `badge=${current.badge.slice(6)}` : `badge=${current.badge}`);
      if (current.suggestedTag !== "all") filters.push(`suggested tag=${current.suggestedTag}`);
      if (current.note !== "all") filters.push(`note=${current.note}`);
      if (current.datasetView !== "all") filters.push(`import view=${current.datasetView}`);
      if (current.sort !== "index") {
        const label = els.sortSelect.options[els.sortSelect.selectedIndex]?.textContent || els.sortSelect.value;
        filters.push(`sort=${label}`);
      }
      return filters;
    }

    function groupCounts(items, getName) {
      const counts = new Map();
      for (const item of items) {
        const name = getName(item);
        counts.set(name, (counts.get(name) || 0) + 1);
      }
      return Array.from(counts, ([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }

    function populateChannels() {
      const channels = getAllChannelNames();
      state.activeChannels = new Set(Array.from(state.activeChannels).filter(channel => channels.includes(channel)));
      renderChannelMenu();
    }

    function getAllChannelNames() {
      return groupCounts(state.videos, video => video.channel || "(unknown)")
        .map(item => item.name);
    }

    function getChannelOptions() {
      const channels = groupCounts(state.videos, video => video.channel || "(unknown)");
      return filterChannelOptions(channels, els.channelSearch.value);
    }

    function openChannelMenu() {
      renderChannelMenu();
      els.channelCombo.classList.add("is-open");
    }

    function closeChannelMenu() {
      els.channelCombo.classList.remove("is-open");
    }

    function toggleChannel(channel) {
      if (state.activeChannels.has(channel)) state.activeChannels.delete(channel);
      else state.activeChannels.add(channel);
      els.channelSearch.value = "";
      handleFilterChange();
      openChannelMenu();
    }

    function clearChannelFilter() {
      state.activeChannels.clear();
      els.channelSearch.value = "";
      handleFilterChange();
      openChannelMenu();
    }

    function renderChannelMenu() {
      els.channelSearch.placeholder = state.activeChannels.size
        ? `${state.activeChannels.size} channels selected`
        : "Search channels...";
      const options = getChannelOptions().slice(0, 80);
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "channel-option";
      clearButton.append(createChannelName(state.activeChannels.size ? "Clear selected channels" : "All channels"), createCount(state.activeChannels.size || ""));
      clearButton.addEventListener("click", clearChannelFilter);

      const optionButtons = options.map(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "channel-option";
        button.title = item.name;
        if (state.activeChannels.has(item.name)) button.classList.add("is-selected");
        button.append(createChannelName(item.name), createCount(state.activeChannels.has(item.name) ? `\u2713 ${item.count}` : item.count));
        button.addEventListener("click", () => toggleChannel(item.name));
        return button;
      });

      if (!optionButtons.length) {
        const empty = document.createElement("div");
        empty.className = "scope-text";
        empty.textContent = "No matching channels.";
        els.channelMenu.replaceChildren(clearButton, empty);
        return;
      }

      els.channelMenu.replaceChildren(clearButton, ...optionButtons);
    }

    function createChannelName(name) {
      const wrap = document.createElement("span");
      const avatar = document.createElement("span");
      const label = document.createElement("span");

      wrap.className = "channel-name-wrap";
      avatar.className = "channel-avatar";
      avatar.style.background = getChannelColor(name);
      avatar.textContent = getInitials(name);
      label.className = "channel-label";
      label.textContent = name;

      wrap.append(avatar, label);
      return wrap;
    }

    function createCount(count) {
      const strong = document.createElement("strong");
      strong.textContent = String(count);
      return strong;
    }

    function getInitials(name) {
      const words = String(name || "")
        .replace(/[#@]/g, "")
        .split(/\s+/)
        .filter(Boolean);
      if (!words.length) return "?";
      if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
      return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }

    function getChannelColor(name) {
      const palette = ["#6ec6ff", "#33c47a", "#f0b84f", "#ef6b73", "#b893ff", "#7dd3c7", "#f59ac2", "#c9d46a"];
      let hash = 0;
      for (const char of String(name || "")) {
        hash = ((hash << 5) - hash) + char.charCodeAt(0);
        hash |= 0;
      }
      return palette[Math.abs(hash) % palette.length];
    }

    function renderTagFilters() {
      const tagCounts = getTagCounts();
      const chips = [
        createTagChip("all", `All tags ${state.videos.length}`, state.videos.length),
        ...getAllTagNames().map(tag => createTagChip(tag, `${tag} ${tagCounts[tag] || 0}`, tagCounts[tag] || 0)),
      ];
      els.tagFilter.replaceChildren(...chips);
    }

    function createTagChip(value, label, count) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip";
      chip.textContent = label;
      if ((value === "all" && !state.activeTags.size) || state.activeTags.has(value)) chip.classList.add("is-active");
      if (value !== "all" && count === 0) chip.classList.add("is-empty");
      chip.addEventListener("click", () => {
        if (value === "all") state.activeTags.clear();
        else if (state.activeTags.has(value)) state.activeTags.delete(value);
        else state.activeTags.add(value);
        handleFilterChange();
      });
      return chip;
    }

    function getTagCounts() {
      const counts = {};
      for (const tag of getAllTagNames()) counts[tag] = 0;
      for (const video of state.videos) {
        for (const tag of getVideoTags(video)) {
          counts[tag] = (counts[tag] || 0) + 1;
        }
      }
      return counts;
    }

    function getAllTagNames() {
      const names = new Set(Object.keys(getEffectiveRules()));
      for (const decision of Object.values(state.decisions)) {
        for (const tag of decision?.tags || []) names.add(tag);
      }
      return Array.from(names).sort((a, b) => a.localeCompare(b));
    }

    function exportKeepMaybe() {
      const keep = [];
      const maybe = [];
      for (const video of state.videos) {
        const decision = getDecision(video.videoId);
        if (decision.status === "keep") keep.push(toExportVideo(video, decision));
        if (decision.status === "maybe") maybe.push(toExportVideo(video, decision));
      }

      downloadJson(`watchlater_keep_maybe_${getDateStamp()}.json`, {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        source: "youtube-watchlater-triage",
        mode: "keep-list",
        keep,
        maybe,
      });
    }

    function exportTaggedAll() {
      const videos = state.videos.map(video => {
        const decision = getDecision(video.videoId);
        return toExportVideo(video, decision);
      });

      downloadJson(`watchlater_tagged_all_${getDateStamp()}.json`, {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        source: "youtube-watchlater-triage",
        mode: "tagged-all",
        videos,
      });
    }

    function exportDeleteCandidates() {
      const deleteCandidates = [];
      const protectedVideos = [];

      for (const video of state.videos) {
        const decision = getDecision(video.videoId);
        const exported = toExportVideo(video, decision);

        if (decision.status === "keep" || decision.status === "maybe") {
          protectedVideos.push(exported);
        } else {
          deleteCandidates.push(exported);
        }
      }

      downloadJson(`watchlater_delete_candidates_${getDateStamp()}.json`, {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        source: "youtube-watchlater-triage",
        mode: "delete-candidates",
        counts: {
          total: state.videos.length,
          protected: protectedVideos.length,
          deleteCandidates: deleteCandidates.length,
        },
        deleteCandidates,
        protected: protectedVideos,
      });
    }

    function exportSelectedVideos() {
      const videos = getSelectedVideos();
      if (!videos.length) {
        showToast("No selected videos to export.");
        return;
      }
      exportScopedVideos("selected", videos);
    }

    function exportVisibleVideos() {
      const videos = getFilteredVideos();
      if (!videos.length) {
        showToast("No visible videos to export.");
        return;
      }
      exportScopedVideos("visible", videos);
    }

    function getSelectedVideos() {
      const byId = new Map(state.videos.map(video => [video.videoId, video]));
      return Array.from(state.selectedIds)
        .map(videoId => byId.get(videoId))
        .filter(Boolean);
    }

    function exportScopedVideos(scope, videos) {
      const exportedVideos = videos.map(video => toExportVideo(video, getDecision(video.videoId)));
      const counts = countStatuses(videos);

      downloadJson(`watchlater_${scope}_${getDateStamp()}.json`, {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        source: "youtube-watchlater-triage",
        mode: "scoped-videos",
        scope,
        counts: {
          total: exportedVideos.length,
          keep: counts.keep,
          maybe: counts.maybe,
          delete: counts.delete,
          unreviewed: counts.unreviewed,
        },
        filters: scope === "visible" ? getActiveFilterSummary() : [],
        videos: exportedVideos,
      });
    }

    function exportDecisions() {
      const decisions = getPortableDecisions(state.decisions);
      const count = Object.keys(decisions).length;
      if (!count) {
        showToast("No saved decisions to export.");
        return;
      }

      downloadJson(`watchlater_decisions_${getDateStamp()}.json`, {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        source: "youtube-watchlater-triage",
        mode: "decisions-export",
        decisions,
      });
    }

    function exportWorkspace() {
      if (!state.videos.length && !Object.keys(state.decisions).length && !state.channelRules.length) {
        showToast("Nothing to export yet.");
        return;
      }

      const payload = buildWorkspacePayload({
        videos: state.videos.map(toWorkspaceVideo),
        decisions: state.decisions,
        userRules: state.userRules,
        channelRules: state.channelRules,
        savedViews: state.savedViews,
        lastImport: state.lastImport,
        importComparison: state.importComparison,
        history: state.history,
        timeBudgetHours: state.timeBudgetHours,
        previewProgress: state.previewProgress,
        ui: getWorkspaceUiState(),
      });
      downloadJson(`watchlater_workspace_${getDateStamp()}.json`, payload);
    }

    async function importWorkspaceFile(event) {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const raw = await readFileText(file);
        const incoming = parseWorkspacePayload(parseJsonText(raw));
        const incomingIds = new Set(incoming.videos.map(video => String(video.videoId || "")).filter(Boolean));
        const decisionCount = Object.keys(incoming.decisions).length;
        const ok = confirm([
          `Import workspace from ${file.name}?`,
          "",
          `Videos: ${incomingIds.size}`,
          `Decisions: ${decisionCount}`,
          `Channel rules: ${incoming.channelRules.length}`,
          `History entries: ${incoming.history.length}`,
          "",
          "This replaces the current dataset, decisions, rules, saved views, and filters.",
        ].join("\n"));
        if (!ok) return;

        const allDecisionIds = Array.from(new Set([
          ...Object.keys(state.decisions),
          ...Object.keys(incoming.decisions),
        ]));
        if (allDecisionIds.length && !addHistoryEntry(
          `Before workspace import: ${file.name}`,
          "workspace-import",
          allDecisionIds,
        )) {
          showToast("Workspace import cancelled because the local safety snapshot could not be saved.");
          return;
        }
        const importBackup = state.history[0]?.action === "workspace-import" ? state.history[0] : null;

        state.userRules = incoming.userRules;
        state.channelRules = incoming.channelRules;
        state.savedViews = incoming.savedViews;
        state.lastImport = incoming.lastImport;
        state.importComparison = incoming.importComparison;
        state.timeBudgetHours = incoming.timeBudgetHours;
        state.previewProgress = incoming.previewProgress;
        state.decisions = incoming.decisions;
        state.videos = dedupeVideos(incoming.videos)
          .map(video => enrichVideo(video))
          .filter(video => video.videoId);
        state.datasetRevision++;
        state.datasetBaseline = createDatasetBaseline(state.videos, state.lastImport);
        saveDatasetBaseline(state.datasetBaseline);
        state.history = mergeHistoryEntries([
          ...(importBackup ? [importBackup] : []),
          ...incoming.history,
          ...state.history.filter(entry => entry !== importBackup),
        ]);

        saveDecisions();
        persistence.saveUserRules(state.userRules);
        persistence.saveChannelRules(state.channelRules);
        persistence.saveSavedViews(state.savedViews);
        persistence.saveTimeBudgetHours(state.timeBudgetHours);
        flushPreviewProgress();
        saveHistory();
        applyWorkspaceUi(incoming.ui);
        populateChannels();
        renderBadgeOptions();
        renderTagFilters();
        renderSavedViews();
        render();
        showToast(`Imported workspace with ${state.videos.length} videos and ${decisionCount} decisions.`);
      } catch (error) {
        showToast(error.message || "Workspace import failed.");
      } finally {
        event.target.value = "";
      }
    }

    function getWorkspaceUiState() {
      return {
        ...captureFilterState(),
        savedViewId: state.activeSavedViewId,
        selectedIds: Array.from(state.selectedIds),
        currentId: state.currentId,
      };
    }

    function applyWorkspaceUi(ui) {
      const normalized = normalizeWorkspaceUi(ui);
      applyFilterState(normalized, { savedViewId: normalized.savedViewId });
      const videoIds = new Set(state.videos.map(video => video.videoId));
      state.selectedIds = new Set(normalized.selectedIds.filter(id => videoIds.has(id)));
      state.currentId = videoIds.has(normalized.currentId) ? normalized.currentId : (state.videos[0]?.videoId || "");
      state.renderedCount = PAGE_SIZE;
    }

    function hasOption(select, value) {
      return Array.from(select.options).some(option => option.value === value);
    }

    async function importDecisionsFile(event) {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const raw = await readFileText(file);
        const parsed = parseJsonText(raw);
        const incoming = parseDecisionsPayload(parsed);
        const preview = previewDecisionsMerge(incoming, state.decisions);
        const totalIncoming = Object.keys(incoming).length;

        if (!totalIncoming) {
          showToast("No decisions found in that file.");
          return;
        }

        const ok = confirm([
          `Import ${totalIncoming} decisions from ${file.name}?`,
          "",
          `New: ${preview.newCount}`,
          `Updated: ${preview.updatedCount}`,
          `Skipped: ${preview.skippedCount}`,
          `Conflicts: ${preview.conflictCount}`,
          "",
          "For matching video IDs, the newer updatedAt wins.",
        ].join("\n"));
        if (!ok) return;

        const changedIds = Object.keys(preview.merged).filter(videoId =>
          !state.decisions[videoId] || !areDecisionsEqual(state.decisions[videoId], preview.merged[videoId])
        );
        if (changedIds.length && !addHistoryEntry(
          `Imported ${changedIds.length} decisions from ${file.name}`,
          "decisions-import",
          changedIds,
        )) {
          showToast("Decision import cancelled because the local safety snapshot could not be saved.");
          return;
        }
        state.decisions = preview.merged;
        saveDecisions();
        render();
        showToast(`Imported decisions: ${preview.newCount} new, ${preview.updatedCount} updated, ${preview.skippedCount} skipped.`);
      } catch (error) {
        showToast(error.message || "Decision import failed.");
      } finally {
        event.target.value = "";
      }
    }

    function toExportVideo(video, decision) {
      const suggestedTags = normalizeTags(video.suggestedTags);
      const manualTags = normalizeTags(decision.tags);
      return {
        videoId: video.videoId,
        status: decision.status || "unreviewed",
        tags: Array.from(new Set([...suggestedTags, ...manualTags])),
        suggestedTags,
        manualTags,
        note: decision.note || "",
        title: video.title || "",
        channel: video.channel || "",
        cleanUrl: video.cleanUrl || video.url || "",
        durationSeconds: video.durationSeconds ?? null,
        views: video.views || "",
        viewCountApprox: video.viewCountApprox ?? null,
        uploaded: video.uploaded || "",
        thumbnailUrl: video.thumbnailUrl || "",
      };
    }

    function downloadJson(filename, payload) {
      downloadTextFile(filename, serializeJson(payload));
      showToast(`Exported ${filename}.`);
    }

    function getDateStamp() {
      return new Date().toISOString().slice(0, 10);
    }

    function clearDecisions() {
      const count = Object.keys(state.decisions).length;
      if (!count) return;
      const answer = prompt(`Type CLEAR ${count} to remove ${count} saved decisions from this browser.`);
      if (answer !== `CLEAR ${count}`) return;
      if (!addHistoryEntry(`Cleared ${count} decisions`, "clear-decisions", Object.keys(state.decisions))) {
        showToast("Clear cancelled because the local safety snapshot could not be saved.");
        return;
      }
      state.decisions = {};
      state.selectedIds.clear();
      saveDecisions();
      render();
      showToast("Cleared saved decisions.");
    }

    function addHistoryEntry(description, action, videoIds) {
      const beforeDecisions = {};
      for (const videoId of Array.from(new Set(videoIds || []))) {
        if (!videoId) continue;
        beforeDecisions[videoId] = Object.prototype.hasOwnProperty.call(state.decisions, videoId)
          ? normalizeDecision(state.decisions[videoId])
          : null;
      }
      if (!Object.keys(beforeDecisions).length) return true;

      const entry = createHistoryEntry(description, action, beforeDecisions);
      state.history = [entry, ...state.history].slice(0, MAX_HISTORY_ENTRIES);
      if (saveHistory()) return true;
      state.history = state.history.filter(candidate => candidate.id !== entry.id);
      return false;
    }

    function syncUndoAvailability() {
      els.undoBulk.disabled = !state.history.some(isUndoableBulkHistoryEntry);
    }

    function undoLastBulkChange() {
      const entry = state.history.find(isUndoableBulkHistoryEntry);
      if (!entry) {
        showToast("No bulk, channel-rule, or video-group change is available to undo.");
        return;
      }
      restoreHistoryEntry(entry, { removeOriginal: true, label: "Undo" });
    }

    function restoreHistoryEntry(entry, options = {}) {
      const label = options.label || "Restore";
      const ok = confirm(`${label} “${entry.description}”? This will restore ${entry.affectedCount} affected decisions.`);
      if (!ok) return;

      const affectedIds = Object.keys(entry.beforeDecisions || {});
      if (!addHistoryEntry(`Before restoring: ${entry.description}`, "snapshot-restore", affectedIds)) {
        showToast("Restore cancelled because a safety snapshot could not be saved.");
        return;
      }
      state.decisions = applyHistoryEntry(state.decisions, entry);
      if (options.removeOriginal) {
        state.history = state.history.filter(candidate => candidate.id !== entry.id);
      }
      saveDecisions();
      saveHistory();
      state.selectedIds.clear();
      render();
      showToast(`Restored ${entry.affectedCount} decisions from snapshot.`);
    }

    function saveDecisions() {
      state.decisionRevision++;
      return persistence.saveDecisions(state.decisions);
    }

    function saveHistory() {
      return persistence.saveHistory(state.history);
    }

    function saveDatasetBaseline(baseline) {
      return persistence.saveDatasetBaseline(baseline);
    }

    function savePreviewProgress(value) {
      return persistence.savePreviewProgress(value);
    }

    function saveUserRules(value) {
      return persistence.saveUserRules(value);
    }

    function saveChannelRules(value) {
      return persistence.saveChannelRules(value);
    }

    function saveTimeBudgetHours(value) {
      return persistence.saveTimeBudgetHours(value);
    }

    function saveInsightsSettings(value) {
      return persistence.saveInsightsSettings(value);
    }

    function handleShortcuts(event) {
      if (state.activeView !== "triage") return;
      const openDialog = [
        els.shortcutHelpDialog,
        els.videoEditorDialog,
        els.rulesDialog,
        els.channelRulesDialog,
        els.quickPreviewDialog,
      ].find(dialog => dialog.open);
      const action = getKeyboardShortcutAction({
        key: event.key,
        target: event.target || document.activeElement,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
      }, {
        hasCurrent: Boolean(state.currentId),
        openDialog: openDialog === els.quickPreviewDialog
          ? "preview"
          : openDialog
            ? "other"
            : "",
      });
      if (!action) return;

      event.preventDefault();
      if (action === "close-dialog") {
        openDialog?.close();
      } else if (action === "show-shortcuts") {
        openShortcutHelp();
      } else if (action === "focus-search") {
        els.searchInput.focus();
      } else if (action === "preview-toggle") {
        if (els.quickPreviewDialog.open) els.quickPreviewDialog.close();
        else openQuickPreview(state.currentId);
      } else if (action.startsWith("preview-status:")) {
        setPreviewStatusAndAdvance(action.split(":")[1]);
      } else if (action === "preview-move:next") {
        moveQuickPreview(1);
      } else if (action === "preview-move:previous") {
        moveQuickPreview(-1);
      } else if (action.startsWith("status:")) {
        setStatusAndAdvance(state.currentId, action.split(":")[1], { focusCurrent: true });
      } else if (action === "toggle-selection") {
        if (state.selectedIds.has(state.currentId)) state.selectedIds.delete(state.currentId);
        else state.selectedIds.add(state.currentId);
        render({ scrollToCurrent: true, focusCurrent: true });
      } else if (action === "edit-video") {
        openVideoEditor(state.currentId);
      } else if (action === "open-video") {
        const video = state.videos.find(candidate => candidate.videoId === state.currentId);
        if (video) window.open(video.cleanUrl || video.url, "_blank", "noreferrer");
      } else if (action === "move:next" || action === "move:previous") {
        moveCurrent(action === "move:next" ? 1 : -1);
        render({ scrollToCurrent: true, focusCurrent: true });
      }
    }

    function showToast(message) {
      els.toast.textContent = message;
      els.toast.classList.add("is-visible");
      window.clearTimeout(showToast.timeout);
      showToast.timeout = window.setTimeout(() => {
        els.toast.classList.remove("is-visible");
      }, 2600);
    }

    return Object.freeze({
      init,
      testApi: Object.freeze({
        buildYouTubeEmbedUrl,
        formatPreviewTime,
        handleShortcuts,
        getInsightsModel,
      }),
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.triageController = Object.freeze({
    createTriageController,
  });
})(globalThis);
