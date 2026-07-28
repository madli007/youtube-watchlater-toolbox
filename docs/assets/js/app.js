    const {
      STORAGE_KEY,
      HISTORY_STORAGE_KEY,
      USER_RULES_STORAGE_KEY,
      CHANNEL_RULES_STORAGE_KEY,
      SAVED_VIEWS_STORAGE_KEY,
      DATASET_BASELINE_STORAGE_KEY,
      TIME_BUDGET_STORAGE_KEY,
      PREVIEW_PROGRESS_STORAGE_KEY,
      PAGE_SIZE,
      BULK_CONFIRM_THRESHOLD,
      MAX_HISTORY_ENTRIES,
      RULES,
    } = globalThis.WatchLaterApp.config;
    const {
      ruleMatchesVideo,
      updateDecisionDetails,
      normalizeUserRules,
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
      createHistoryEntry,
      createSnapshotId,
      normalizeHistory,
      mergeHistoryEntries,
      applyHistoryEntry,
    } = globalThis.WatchLaterApp.domain.decisions;
    const {
      dedupeVideos,
      createEmptyImportComparison,
      createVideoSnapshot,
      createDatasetBaseline,
      compareVideoDatasets,
      normalizePlainObject,
    } = globalThis.WatchLaterApp.domain.importComparison;
    const {
      videoMatchesFilters,
      normalizeFilterState,
      normalizeSavedViews,
      filterChannelOptions,
      getChannelOptionPage,
    } = globalThis.WatchLaterApp.domain.filters;
    const {
      normalizeTimeBudgetHours,
      calculateDurationStats,
      getSortedDurationGroups,
      buildTimeBudgetShortlist,
      formatDuration,
    } = globalThis.WatchLaterApp.domain.timeBudget;
    const {
      buildVideoGroups,
      chooseGroupWinner,
    } = globalThis.WatchLaterApp.domain.grouping;
    const {
      buildWorkspacePayload,
      parseWorkspacePayload,
      toWorkspaceVideo,
      normalizeWorkspaceUi,
      normalizePreviewProgress,
    } = globalThis.WatchLaterApp.domain.workspace;

    const state = {
      videos: [],
      decisions: loadDecisions(),
      selectedIds: new Set(),
      activeTags: new Set(),
      activeChannels: new Set(),
      renderedCount: PAGE_SIZE,
      currentId: "",
      history: loadHistory(),
      userRules: normalizeUserRules(loadStoredObject(USER_RULES_STORAGE_KEY)),
      channelRules: normalizeChannelRules(loadStoredArray(CHANNEL_RULES_STORAGE_KEY)),
      savedViews: normalizeSavedViews(loadStoredArray(SAVED_VIEWS_STORAGE_KEY)),
      activeSavedViewId: "",
      lastImport: null,
      datasetView: "all",
      importComparison: createEmptyImportComparison(),
      datasetBaseline: loadDatasetBaseline(),
      editingVideoId: "",
      editingRuleName: "",
      editingChannelRuleId: "",
      timeBudgetHours: normalizeTimeBudgetHours(localStorage.getItem(TIME_BUDGET_STORAGE_KEY)),
      groupType: "all",
      renderedGroupCount: 20,
      groupCacheKey: "",
      groupCache: [],
      previewVideoId: "",
      previewCurrentTime: 0,
      previewPlayerState: -1,
      previewPlayerReady: false,
      previewProgress: normalizePreviewProgress(loadStoredObject(PREVIEW_PROGRESS_STORAGE_KEY)),
      previewLastPersistAt: 0,
      previewCountdownRemaining: 30,
      previewCountdownActive: false,
      previewCountdownLastTick: 0,
      previewPollTimer: null,
    };

    const els = {
      fileInput: document.getElementById("fileInput"),
      exportKeepMaybe: document.getElementById("exportKeepMaybe"),
      exportDeleteCandidates: document.getElementById("exportDeleteCandidates"),
      exportSelected: document.getElementById("exportSelected"),
      exportVisible: document.getElementById("exportVisible"),
      exportTagged: document.getElementById("exportTagged"),
      exportDecisions: document.getElementById("exportDecisions"),
      decisionsInput: document.getElementById("decisionsInput"),
      exportWorkspace: document.getElementById("exportWorkspace"),
      workspaceInput: document.getElementById("workspaceInput"),
      clearDecisions: document.getElementById("clearDecisions"),
      searchInput: document.getElementById("searchInput"),
      statusFilter: document.getElementById("statusFilter"),
      channelCombo: document.getElementById("channelCombo"),
      channelSearch: document.getElementById("channelSearch"),
      channelMenu: document.getElementById("channelMenu"),
      sortSelect: document.getElementById("sortSelect"),
      clearFilters: document.getElementById("clearFilters"),
      advancedFilters: document.getElementById("advancedFilters"),
      minDurationInput: document.getElementById("minDurationInput"),
      maxDurationInput: document.getElementById("maxDurationInput"),
      minAgeInput: document.getElementById("minAgeInput"),
      maxAgeInput: document.getElementById("maxAgeInput"),
      minViewsInput: document.getElementById("minViewsInput"),
      availabilityFilter: document.getElementById("availabilityFilter"),
      badgeFilter: document.getElementById("badgeFilter"),
      suggestedTagFilter: document.getElementById("suggestedTagFilter"),
      noteFilter: document.getElementById("noteFilter"),
      tagModeSelect: document.getElementById("tagModeSelect"),
      savedViewSelect: document.getElementById("savedViewSelect"),
      saveView: document.getElementById("saveView"),
      deleteView: document.getElementById("deleteView"),
      tagFilter: document.getElementById("tagFilter"),
      datasetViews: document.getElementById("datasetViews"),
      comparisonSummary: document.getElementById("comparisonSummary"),
      totalCount: document.getElementById("totalCount"),
      visibleCount: document.getElementById("visibleCount"),
      keepCount: document.getElementById("keepCount"),
      maybeCount: document.getElementById("maybeCount"),
      protectedCount: document.getElementById("protectedCount"),
      deleteCount: document.getElementById("deleteCount"),
      timeCoverage: document.getElementById("timeCoverage"),
      timeBudgetHours: document.getElementById("timeBudgetHours"),
      selectTimeShortlist: document.getElementById("selectTimeShortlist"),
      totalDuration: document.getElementById("totalDuration"),
      protectedDuration: document.getElementById("protectedDuration"),
      reviewProgress: document.getElementById("reviewProgress"),
      reviewProgressLabel: document.getElementById("reviewProgressLabel"),
      reviewProgressBar: document.getElementById("reviewProgressBar"),
      budgetCoverage: document.getElementById("budgetCoverage"),
      timeByStatus: document.getElementById("timeByStatus"),
      timeByChannel: document.getElementById("timeByChannel"),
      timeByTag: document.getElementById("timeByTag"),
      timeShortlistSummary: document.getElementById("timeShortlistSummary"),
      timeShortlistItems: document.getElementById("timeShortlistItems"),
      groupSummary: document.getElementById("groupSummary"),
      groupTypeFilter: document.getElementById("groupTypeFilter"),
      videoGroups: document.getElementById("videoGroups"),
      showMoreGroups: document.getElementById("showMoreGroups"),
      scopeLabel: document.getElementById("scopeLabel"),
      scopeHint: document.getElementById("scopeHint"),
      activeFilters: document.getElementById("activeFilters"),
      keepBulk: document.getElementById("keepBulk"),
      maybeBulk: document.getElementById("maybeBulk"),
      deleteBulk: document.getElementById("deleteBulk"),
      resetBulk: document.getElementById("resetBulk"),
      selectVisible: document.getElementById("selectVisible"),
      invertSelection: document.getElementById("invertSelection"),
      clearSelection: document.getElementById("clearSelection"),
      videoList: document.getElementById("videoList"),
      channelList: document.getElementById("channelList"),
      tagSummary: document.getElementById("tagSummary"),
      manageRules: document.getElementById("manageRules"),
      ruleSummary: document.getElementById("ruleSummary"),
      manageChannelRules: document.getElementById("manageChannelRules"),
      channelRuleSummary: document.getElementById("channelRuleSummary"),
      stateSummary: document.getElementById("stateSummary"),
      undoBulk: document.getElementById("undoBulk"),
      historyList: document.getElementById("historyList"),
      quickPreviewDialog: document.getElementById("quickPreviewDialog"),
      quickPreviewTitle: document.getElementById("quickPreviewTitle"),
      closeQuickPreview: document.getElementById("closeQuickPreview"),
      quickPreviewPlayer: document.getElementById("quickPreviewPlayer"),
      quickPreviewThumb: document.getElementById("quickPreviewThumb"),
      quickPreviewMeta: document.getElementById("quickPreviewMeta"),
      quickPreviewProgress: document.getElementById("quickPreviewProgress"),
      quickPreviewTags: document.getElementById("quickPreviewTags"),
      quickPreviewTimer: document.getElementById("quickPreviewTimer"),
      startPreviewTimer: document.getElementById("startPreviewTimer"),
      quickPreviewTimerStatus: document.getElementById("quickPreviewTimerStatus"),
      quickPreviewStatusActions: document.getElementById("quickPreviewStatusActions"),
      videoEditorDialog: document.getElementById("videoEditorDialog"),
      videoEditorForm: document.getElementById("videoEditorForm"),
      videoEditorTitle: document.getElementById("videoEditorTitle"),
      videoEditorSuggested: document.getElementById("videoEditorSuggested"),
      videoTagsInput: document.getElementById("videoTagsInput"),
      videoNoteInput: document.getElementById("videoNoteInput"),
      cancelVideoEditor: document.getElementById("cancelVideoEditor"),
      rulesDialog: document.getElementById("rulesDialog"),
      ruleEditorForm: document.getElementById("ruleEditorForm"),
      ruleList: document.getElementById("ruleList"),
      ruleNameInput: document.getElementById("ruleNameInput"),
      ruleChannelInput: document.getElementById("ruleChannelInput"),
      ruleChannels: document.getElementById("ruleChannels"),
      rulePositiveInput: document.getElementById("rulePositiveInput"),
      ruleNegativeInput: document.getElementById("ruleNegativeInput"),
      newRule: document.getElementById("newRule"),
      closeRules: document.getElementById("closeRules"),
      channelRulesDialog: document.getElementById("channelRulesDialog"),
      channelRuleEditorForm: document.getElementById("channelRuleEditorForm"),
      channelRuleList: document.getElementById("channelRuleList"),
      channelRuleChannelCombo: document.getElementById("channelRuleChannelCombo"),
      channelRuleChannelInput: document.getElementById("channelRuleChannelInput"),
      channelRuleChannelMenu: document.getElementById("channelRuleChannelMenu"),
      channelRuleModeSelect: document.getElementById("channelRuleModeSelect"),
      channelRuleTagInput: document.getElementById("channelRuleTagInput"),
      channelRuleProtectedInput: document.getElementById("channelRuleProtectedInput"),
      channelRulePreview: document.getElementById("channelRulePreview"),
      newChannelRule: document.getElementById("newChannelRule"),
      applyAllChannelRules: document.getElementById("applyAllChannelRules"),
      applyChannelRule: document.getElementById("applyChannelRule"),
      closeChannelRules: document.getElementById("closeChannelRules"),
      toast: document.getElementById("toast"),
    };

    if (globalThis.__WATCHLATER_TEST__) {
      globalThis.WatchLaterTestApi = {
        buildYouTubeEmbedUrl,
        formatPreviewTime,
      };
    } else {
      init();
    }

    function init() {
      els.timeBudgetHours.value = state.timeBudgetHours;
      renderBadgeOptions();
      renderTagFilters();
      renderSavedViews();
      bindEvents();
      render();
    }

    function bindEvents() {
      els.fileInput.addEventListener("change", importFile);
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
        els.minAgeInput,
        els.maxAgeInput,
        els.minViewsInput,
      ].forEach(input => input.addEventListener("input", handleFilterChange));
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
      els.timeBudgetHours.addEventListener("input", handleTimeBudgetInput);
      els.timeBudgetHours.addEventListener("change", updateTimeBudget);
      els.selectTimeShortlist.addEventListener("click", selectSuggestedShortlist);
      els.groupTypeFilter.addEventListener("change", () => {
        state.groupType = els.groupTypeFilter.value;
        state.renderedGroupCount = 20;
        renderVideoGroups();
      });
      els.showMoreGroups.addEventListener("click", () => {
        state.renderedGroupCount += 20;
        renderVideoGroups();
      });
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
        const raw = await file.text();
        const parsed = JSON.parse(raw);
        const videos = Array.isArray(parsed) ? parsed : parsed.videos;
        if (!Array.isArray(videos)) throw new Error("Expected a JSON array of videos.");

        const deduped = dedupeVideos(videos)
          .map(video => enrichVideo(video))
          .filter(video => video.videoId);

        const importedAt = new Date().toISOString();
        const currentImport = {
          fileName: file.name,
          importedAt,
          videoCount: deduped.length,
          sourceExportedAt: typeof parsed?.exportedAt === "string" ? parsed.exportedAt : "",
          sourceMode: typeof parsed?.mode === "string" ? parsed.mode : "",
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

    function setStatusAndAdvance(videoId, status) {
      setStatus(videoId, status);
      moveCurrent(1);
      render({ scrollToCurrent: true });
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
      showToast("Cleared filters.");
    }

    function handleFilterChange() {
      state.activeSavedViewId = "";
      state.renderedCount = PAGE_SIZE;
      state.renderedGroupCount = 20;
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

    function getCurrentVideoGroups() {
      const videos = getFilteredVideos();
      const cacheKey = videos.map(video => `${video.videoId}\u001f${video.title || ""}\u001f${video.channel || ""}`).join("\u001e");
      if (state.groupCacheKey !== cacheKey) {
        state.groupCacheKey = cacheKey;
        state.groupCache = buildVideoGroups(videos);
      }
      return state.groupCache;
    }

    function renderVideoGroups() {
      const visibleVideos = getFilteredVideos();
      const allGroups = getCurrentVideoGroups();
      const groupedIds = new Set(allGroups.flatMap(group => group.members.map(video => video.videoId)));
      const groups = state.groupType === "all"
        ? allGroups
        : allGroups.filter(group => group.type === state.groupType);
      const typeCounts = allGroups.reduce((counts, group) => {
        counts[group.type] = (counts[group.type] || 0) + 1;
        return counts;
      }, {});

      els.groupTypeFilter.value = state.groupType;
      els.groupSummary.textContent = visibleVideos.length
        ? `${allGroups.length} groups covering ${groupedIds.size} of ${visibleVideos.length} visible videos · ${typeCounts.series || 0} series · ${typeCounts.similar || 0} similar · ${typeCounts.duplicate || 0} probable duplicates.`
        : "Import videos or change filters to find local title patterns.";

      if (!groups.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = visibleVideos.length
          ? "No groups of this type were detected in the current visible scope."
          : "No visible videos to group.";
        els.videoGroups.replaceChildren(empty);
        els.showMoreGroups.hidden = true;
        return;
      }

      const rendered = groups.slice(0, state.renderedGroupCount).map(createVideoGroupCard);
      els.videoGroups.replaceChildren(...rendered);
      els.showMoreGroups.hidden = rendered.length >= groups.length;
      els.showMoreGroups.textContent = `Show more groups (${rendered.length} / ${groups.length})`;
    }

    function createVideoGroupCard(group) {
      const card = document.createElement("article");
      card.className = "video-group-card";
      card.dataset.groupType = group.type;

      const header = document.createElement("div");
      header.className = "video-group-header";
      const heading = document.createElement("h3");
      heading.textContent = group.label;
      const typeBadge = document.createElement("span");
      typeBadge.className = "group-type-badge";
      typeBadge.textContent = ({ series: "Series", similar: "Similar", duplicate: "Probable duplicate" })[group.type] || group.type;
      heading.appendChild(typeBadge);
      const count = document.createElement("strong");
      count.textContent = `${group.members.length} videos`;
      header.append(heading, count);

      const reason = document.createElement("div");
      reason.className = "scope-text";
      reason.textContent = `${group.reason}. Review every member below before applying a group action.`;

      const members = document.createElement("div");
      members.className = "group-member-list";
      for (const video of group.members) {
        const row = document.createElement("div");
        row.className = "group-member";
        const index = document.createElement("span");
        index.className = "playlist-index";
        index.textContent = `#${video.index || video.playlistIndex || "?"}`;
        const title = document.createElement("a");
        title.className = "group-member-title";
        title.href = video.cleanUrl || video.url || "#";
        title.target = "_blank";
        title.rel = "noreferrer";
        title.textContent = video.title || "(untitled)";
        title.title = [video.channel, video.uploaded, video.views].filter(Boolean).join(" · ");
        const status = document.createElement("span");
        status.className = "group-member-status";
        status.textContent = getStatus(video.videoId);
        row.append(index, title, status);
        members.appendChild(row);
      }

      const actions = document.createElement("div");
      actions.className = "video-group-actions";
      actions.append(
        createGroupActionButton("Select group", () => selectVideoGroup(group)),
        createGroupActionButton("Keep all", () => applyVideoGroupStatus(group, "keep"), "keep-button"),
        createGroupActionButton("Maybe all", () => applyVideoGroupStatus(group, "maybe"), "maybe-button"),
        createGroupActionButton("Delete all", () => applyVideoGroupStatus(group, "delete"), "danger"),
        createGroupRecommendationButton(group, "newest", "Keep newest only"),
        createGroupRecommendationButton(group, "most-viewed", "Keep most viewed only"),
      );
      card.append(header, reason, members, actions);
      return card;
    }

    function createGroupActionButton(label, handler, className = "") {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      if (className) button.className = className;
      button.addEventListener("click", handler);
      return button;
    }

    function createGroupRecommendationButton(group, strategy, label) {
      const winner = chooseGroupWinner(group, strategy);
      const button = createGroupActionButton(label, () => applyGroupWinner(group, strategy));
      button.disabled = !winner;
      button.title = winner
        ? `Keep “${winner.title || winner.videoId}” and mark the other group members delete`
        : `No ${strategy === "newest" ? "upload age" : "view count"} data is available for this group`;
      return button;
    }

    function selectVideoGroup(group) {
      state.selectedIds = new Set(group.members.map(video => video.videoId));
      state.currentId = group.members[0]?.videoId || state.currentId;
      render();
      showToast(`Selected ${group.members.length} videos from “${group.label}”.`);
    }

    function applyVideoGroupStatus(group, status) {
      const changedIds = group.members
        .map(video => video.videoId)
        .filter(videoId => getStatus(videoId) !== status);
      if (!changedIds.length) {
        showToast(`Every video in this group is already ${status}.`);
        return;
      }
      const protectedMatches = status === "delete"
        ? getProtectedChannelMatches(state.videos, changedIds, state.channelRules)
        : [];
      if (status === "delete") {
        const protectedChannels = Array.from(new Set(protectedMatches.map(match => match.channel)));
        const warning = protectedMatches.length
          ? `\n\nWarning: ${protectedMatches.length} videos belong to protected channels: ${protectedChannels.join(", ")}.`
          : "";
        if (!confirm(`Mark all ${changedIds.length} pending members of “${group.label}” as delete?${warning}`)) return;
      }
      if (!addHistoryEntry(`${group.label}: ${changedIds.length} group members → ${status}`, "similarity-group", changedIds)) {
        showToast("Group change cancelled because the local safety snapshot could not be saved.");
        return;
      }
      changedIds.forEach(videoId => setStatus(videoId, status, false));
      saveDecisions();
      state.selectedIds.clear();
      render();
      showToast(`Marked ${changedIds.length} group members as ${status}.`);
    }

    function applyGroupWinner(group, strategy) {
      const winner = chooseGroupWinner(group, strategy);
      if (!winner) {
        showToast(`This group has no usable ${strategy === "newest" ? "upload age" : "view count"} data.`);
        return;
      }
      const memberIds = group.members.map(video => video.videoId);
      const loserIds = memberIds.filter(videoId => videoId !== winner.videoId);
      const protectedMatches = getProtectedChannelMatches(state.videos, loserIds, state.channelRules);
      const protectedChannels = Array.from(new Set(protectedMatches.map(match => match.channel)));
      const warning = protectedMatches.length
        ? `\n\nWarning: ${protectedMatches.length} videos that would be marked delete belong to protected channels: ${protectedChannels.join(", ")}.`
        : "";
      const strategyLabel = strategy === "newest" ? "newest" : "most viewed";
      const ok = confirm([
        `Keep only the ${strategyLabel} video in “${group.label}”?`,
        "",
        `Keep: ${winner.title || winner.videoId}`,
        `Mark delete: ${loserIds.length} other group members.${warning}`,
        "",
        "A local undo snapshot will be created.",
      ].join("\n"));
      if (!ok) return;
      const changedIds = memberIds.filter(videoId => getStatus(videoId) !== (videoId === winner.videoId ? "keep" : "delete"));
      if (!changedIds.length) {
        showToast("This recommendation is already applied.");
        return;
      }
      if (!addHistoryEntry(`${group.label}: kept ${strategyLabel}, deleted ${loserIds.length}`, "similarity-group", changedIds)) {
        showToast("Recommendation cancelled because the local safety snapshot could not be saved.");
        return;
      }
      changedIds.forEach(videoId => setStatus(videoId, videoId === winner.videoId ? "keep" : "delete", false));
      saveDecisions();
      state.selectedIds.clear();
      state.currentId = winner.videoId;
      render();
      showToast(`Kept “${winner.title || winner.videoId}” and marked ${loserIds.length} group members delete.`);
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

    function render(options = {}) {
      ensureCurrentVisible();
      renderStats();
      renderTimeDashboard();
      renderVideoGroups();
      renderVideoList();
      renderSidebar();
      renderHistory();
      renderImportComparison();
      updateBulkLabels();
      if (options.scrollToCurrent) scrollCurrentIntoView();
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

    function renderStats() {
      const total = state.videos.length;
      const visible = getFilteredVideos().length;
      const counts = countStatuses(state.videos);

      els.totalCount.textContent = total;
      els.visibleCount.textContent = visible;
      els.keepCount.textContent = counts.keep;
      els.maybeCount.textContent = counts.maybe;
      els.protectedCount.textContent = counts.keep + counts.maybe;
      els.deleteCount.textContent = counts.unreviewed + counts.delete;

      const decisionCount = Object.keys(state.decisions).length;
      const importedIds = new Set(state.videos.map(video => video.videoId));
      const orphaned = Object.keys(state.decisions).filter(id => !importedIds.has(id)).length;
      const lastImport = state.lastImport?.importedAt
        ? ` Last import: ${new Date(state.lastImport.importedAt).toLocaleString()}.`
        : "";
      els.stateSummary.textContent = `${decisionCount} saved decisions. ${orphaned} orphaned decisions hidden from this import.${lastImport}`;
    }

    function countStatuses(videos) {
      const counts = { unreviewed: 0, keep: 0, maybe: 0, delete: 0 };
      for (const video of videos) counts[getStatus(video.videoId)]++;
      return counts;
    }

    function updateTimeBudget() {
      state.timeBudgetHours = normalizeTimeBudgetHours(els.timeBudgetHours.value);
      els.timeBudgetHours.value = state.timeBudgetHours;
      localStorage.setItem(TIME_BUDGET_STORAGE_KEY, String(state.timeBudgetHours));
      renderTimeDashboard();
    }

    function handleTimeBudgetInput() {
      const hours = Number(els.timeBudgetHours.value);
      if (!Number.isFinite(hours) || hours <= 0) return;
      state.timeBudgetHours = Math.min(168, hours);
      localStorage.setItem(TIME_BUDGET_STORAGE_KEY, String(state.timeBudgetHours));
      renderTimeDashboard();
    }

    function getCurrentTimeShortlist() {
      return buildTimeBudgetShortlist(
        getFilteredVideos(),
        state.decisions,
        state.timeBudgetHours * 3600,
      );
    }

    function selectSuggestedShortlist() {
      const shortlist = getCurrentTimeShortlist();
      if (!shortlist.videos.length) {
        showToast("No visible non-delete videos fit the weekly time budget.");
        return;
      }
      state.selectedIds = new Set(shortlist.videos.map(video => video.videoId));
      state.currentId = shortlist.videos[0].videoId;
      render();
      showToast(`Selected ${shortlist.videos.length} videos (${formatDuration(shortlist.totalSeconds)}).`);
    }

    function renderTimeDashboard() {
      const stats = calculateDurationStats(state.videos, state.decisions);
      const reviewPercent = stats.totalCount ? Math.round(stats.decidedCount / stats.totalCount * 100) : 0;
      const weeklySeconds = state.timeBudgetHours * 3600;
      const weeks = weeklySeconds ? stats.protectedSeconds / weeklySeconds : 0;
      const shortlist = getCurrentTimeShortlist();

      els.totalDuration.textContent = formatDuration(stats.totalSeconds);
      els.protectedDuration.textContent = formatDuration(stats.protectedSeconds);
      els.reviewProgress.textContent = `${reviewPercent}%`;
      els.reviewProgressLabel.textContent = `Reviewed · ${formatDuration(stats.decidedSeconds)} of ${formatDuration(stats.totalSeconds)} decided`;
      els.reviewProgressBar.style.width = `${reviewPercent}%`;
      els.budgetCoverage.textContent = weeks < 0.1 ? "0" : weeks.toFixed(weeks >= 10 ? 0 : 1);
      els.timeCoverage.textContent = state.videos.length
        ? `Duration available for ${stats.knownCount} of ${stats.totalCount} videos${stats.unknownCount ? `; ${stats.unknownCount} unknown.` : "."}`
        : "Import videos to calculate watch time.";
      els.timeBudgetHours.value = state.timeBudgetHours;
      els.selectTimeShortlist.disabled = !shortlist.videos.length;
      els.timeShortlistSummary.textContent = shortlist.videos.length
        ? `${shortlist.videos.length} visible non-delete videos · ${formatDuration(shortlist.totalSeconds)} of ${formatDuration(shortlist.budgetSeconds)}`
        : "No visible non-delete videos fit the budget.";

      const preview = shortlist.videos.slice(0, 5).map(video => {
        const item = document.createElement("div");
        item.textContent = `${video.title || "(untitled)"} · ${formatDuration(video.durationSeconds)}`;
        return item;
      });
      if (shortlist.videos.length > preview.length) {
        const more = document.createElement("div");
        more.textContent = `…and ${shortlist.videos.length - preview.length} more.`;
        preview.push(more);
      }
      els.timeShortlistItems.replaceChildren(...preview);

      renderDurationGroups(els.timeByStatus, ["keep", "maybe", "delete", "unreviewed"].map(name => ({
        name,
        ...(stats.byStatus[name] || { count: 0, seconds: 0 }),
      })));
      renderDurationGroups(els.timeByChannel, getSortedDurationGroups(stats.byChannel).slice(0, 10));
      renderDurationGroups(els.timeByTag, getSortedDurationGroups(stats.byTag).slice(0, 10));
    }

    function renderDurationGroups(container, groups) {
      const rows = groups.length ? groups.map(group => {
        const row = document.createElement("div");
        row.className = "time-breakdown-row";
        const name = document.createElement("span");
        name.textContent = `${group.name} (${group.count})`;
        const duration = document.createElement("strong");
        duration.textContent = formatDuration(group.seconds);
        row.append(name, duration);
        return row;
      }) : [Object.assign(document.createElement("div"), { className: "scope-text", textContent: "No data." })];
      container.replaceChildren(...rows);
    }

    function updateBulkLabels() {
      const selected = state.selectedIds.size;
      const visible = getFilteredVideos().length;
      const scope = selected || visible;
      const scopeName = selected ? "selected" : "visible";

      els.scopeLabel.textContent = state.videos.length ? `${scope} ${scopeName} videos` : "No videos loaded";
      els.scopeHint.textContent = selected
        ? "Bulk actions apply to selected videos."
        : "Bulk actions apply to all visible filtered results. Shortcuts: p preview, k/m/d decide, j/↑/↓ move.";
      els.activeFilters.textContent = `Filters: ${getActiveFilterSummary().join(", ") || "none"}`;

      els.keepBulk.textContent = `Keep ${scopeName}`;
      els.maybeBulk.textContent = `Maybe ${scopeName}`;
      els.deleteBulk.textContent = `Delete ${scopeName}`;
      els.exportSelected.textContent = selected ? `Export selected (${selected})` : "Export selected";
      els.exportVisible.textContent = visible ? `Export visible (${visible})` : "Export visible";

      [els.clearFilters, els.keepBulk, els.maybeBulk, els.deleteBulk, els.resetBulk, els.selectVisible, els.invertSelection, els.clearSelection, els.exportKeepMaybe, els.exportDeleteCandidates, els.exportTagged, els.exportVisible].forEach(button => {
        button.disabled = !state.videos.length;
      });
      els.exportSelected.disabled = !state.selectedIds.size;
      els.exportVisible.disabled = !visible;
      els.exportDecisions.disabled = !Object.keys(state.decisions).length;
      els.exportWorkspace.disabled = !state.videos.length && !Object.keys(state.decisions).length && !state.channelRules.length;
      els.undoBulk.disabled = !state.history.some(entry => ["bulk-status", "channel-rule", "similarity-group"].includes(entry.action));
    }

    function getDatasetViewIds(view) {
      const comparison = state.importComparison;
      if (!comparison.baselineAvailable || view === "all") return null;
      if (view === "inbox" || view === "new") return new Set(comparison.newIds);
      if (view === "changed") return new Set(comparison.changedIds);
      if (view === "decided") return new Set(comparison.decidedIds);
      return null;
    }

    function renderImportComparison() {
      const comparison = state.importComparison;
      const inboxCount = comparison.baselineAvailable ? getInboxIds(comparison).length : 0;
      const viewCounts = {
        all: state.videos.length,
        inbox: inboxCount,
        new: comparison.newIds.length,
        changed: comparison.changedIds.length,
        decided: comparison.decidedIds.length,
      };
      const labels = {
        all: "All",
        inbox: "Inbox",
        new: "New",
        changed: "Metadata changed",
        decided: "Already decided",
      };

      for (const button of els.datasetViews.querySelectorAll("[data-dataset-view]")) {
        const view = button.dataset.datasetView;
        button.textContent = `${labels[view]} ${viewCounts[view] ?? 0}`;
        button.classList.toggle("is-active", state.datasetView === view);
        button.disabled = view !== "all" && (!comparison.baselineAvailable || viewCounts[view] === 0);
      }

      if (!state.videos.length) {
        els.comparisonSummary.textContent = "Import a second export to compare datasets.";
        return;
      }
      if (!comparison.baselineAvailable) {
        els.comparisonSummary.textContent = "No previous dataset was available. This import is now the local comparison baseline.";
        return;
      }

      const previousName = comparison.previousImport?.fileName || "previous dataset";
      const currentIds = new Set(state.videos.map(video => video.videoId));
      const orphanedIds = Object.keys(state.decisions).filter(videoId => !currentIds.has(videoId));
      const summary = document.createElement("div");
      summary.textContent = `Compared with ${previousName}: ${comparison.newIds.length} new · ${comparison.removedVideos.length} no longer present · ${comparison.decidedIds.length} already decided · ${comparison.changedIds.length} metadata changed · ${orphanedIds.length} orphaned decisions.`;
      els.comparisonSummary.replaceChildren(summary);

      if (comparison.removedVideos.length || orphanedIds.length) {
        const details = document.createElement("details");
        const detailsSummary = document.createElement("summary");
        detailsSummary.textContent = "Show removed videos and orphaned decisions";
        const list = document.createElement("div");
        list.className = "comparison-detail-list";
        const visibleRemoved = comparison.removedVideos.slice(0, 50);
        const visibleOrphaned = orphanedIds.slice(0, 50);
        for (const video of visibleRemoved) {
          const item = document.createElement("span");
          item.textContent = `No longer present: ${video.title || video.videoId}${video.channel ? ` — ${video.channel}` : ""}`;
          list.appendChild(item);
        }
        if (comparison.removedVideos.length > visibleRemoved.length) {
          const item = document.createElement("span");
          item.textContent = `…and ${comparison.removedVideos.length - visibleRemoved.length} more videos no longer present.`;
          list.appendChild(item);
        }
        for (const videoId of visibleOrphaned) {
          const item = document.createElement("span");
          item.textContent = `Orphaned decision: ${videoId}`;
          list.appendChild(item);
        }
        if (orphanedIds.length > visibleOrphaned.length) {
          const item = document.createElement("span");
          item.textContent = `…and ${orphanedIds.length - visibleOrphaned.length} more orphaned decisions.`;
          list.appendChild(item);
        }
        details.append(detailsSummary, list);
        els.comparisonSummary.appendChild(details);
      }
    }

    function getInboxIds(comparison = state.importComparison) {
      return comparison.newIds.filter(videoId => getStatus(videoId) === "unreviewed");
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

    function applyFilterState(value, options = {}) {
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
      els.advancedFilters.open = [
        filters.minDurationMinutes,
        filters.maxDurationMinutes,
        filters.minAgeDays,
        filters.maxAgeDays,
        filters.minViews,
      ].some(filterValue => filterValue !== "")
        || filters.availability !== "all"
        || filters.badge !== "all"
        || filters.suggestedTag !== "all"
        || filters.note !== "all"
        || (filters.tags.length > 1 && filters.tagMode === "and");
      state.activeSavedViewId = options.savedViewId || "";
      state.selectedIds.clear();
      state.renderedCount = PAGE_SIZE;
      state.renderedGroupCount = 20;
      renderTagFilters();
      renderChannelMenu();
      renderSavedViews();
      render();
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
      saveStoredJson(SAVED_VIEWS_STORAGE_KEY, state.savedViews);
      renderSavedViews();
      showToast(`Saved view "${name}".`);
    }

    function createSavedViewId() {
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
      return `view-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function deleteCurrentView() {
      const view = state.savedViews.find(candidate => candidate.id === els.savedViewSelect.value);
      if (!view || !confirm(`Delete the saved view "${view.name}"?`)) return;
      state.savedViews = state.savedViews.filter(candidate => candidate.id !== view.id);
      state.activeSavedViewId = "";
      saveStoredJson(SAVED_VIEWS_STORAGE_KEY, state.savedViews);
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

    function buildYouTubeEmbedUrl(videoId, startSeconds = 0, locationOrigin = "") {
      const cleanId = String(videoId || "").trim();
      if (!cleanId) return "";
      const seconds = Math.max(0, Math.floor(Number(startSeconds) || 0));
      const params = ["autoplay=1", "enablejsapi=1", "playsinline=1", "rel=0"];
      if (seconds > 0) params.push(`start=${seconds}`);
      if (/^https?:\/\//i.test(locationOrigin)) params.push(`origin=${encodeURIComponent(locationOrigin)}`);
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(cleanId)}?${params.join("&")}`;
    }

    function formatPreviewTime(seconds) {
      const total = Math.max(0, Math.floor(Number(seconds) || 0));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const remainder = total % 60;
      return hours
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
        : `${minutes}:${String(remainder).padStart(2, "0")}`;
    }

    function openQuickPreview(videoId) {
      const video = state.videos.find(candidate => candidate.videoId === videoId);
      if (!video || video.isUnavailable) return;
      if (state.previewVideoId && state.previewVideoId !== videoId) flushPreviewProgress();
      state.previewVideoId = videoId;
      state.currentId = videoId;
      render();
      renderQuickPreview(video);
      if (!els.quickPreviewDialog.open) els.quickPreviewDialog.showModal();
      startPreviewSession();
    }

    function renderQuickPreview(video) {
      if (!video) return;
      const savedSeconds = state.previewProgress[video.videoId] || 0;
      const link = video.cleanUrl || video.url || `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
      els.quickPreviewTitle.textContent = video.title || "(untitled)";
      els.quickPreviewTitle.href = link;
      els.quickPreviewThumb.src = video.thumbnailUrl || "";
      els.quickPreviewThumb.alt = video.title ? `Thumbnail for ${video.title}` : "Video thumbnail";
      els.quickPreviewMeta.textContent = [video.channel, video.duration, video.views, video.uploaded].filter(Boolean).join(" · ");
      els.quickPreviewProgress.textContent = savedSeconds
        ? `Resuming from ${formatPreviewTime(savedSeconds)}. Playback position is saved locally.`
        : "Playback position will be saved locally.";

      const decision = getDecision(video.videoId);
      const chips = [];
      (video.suggestedTags || []).forEach(tag => chips.push(createPreviewTag(`Suggested: ${tag}`, "tag")));
      (decision.tags || []).forEach(tag => chips.push(createPreviewTag(`Manual: ${tag}`, "tag manual-tag")));
      els.quickPreviewTags.replaceChildren(...chips);
      Array.from(els.quickPreviewStatusActions.querySelectorAll("[data-preview-status]")).forEach(button => {
        button.classList.toggle("is-active", button.dataset.previewStatus === decision.status);
      });

      const origin = location.origin === "null" ? "" : location.origin;
      els.quickPreviewPlayer.dataset.videoId = video.videoId;
      state.previewPlayerReady = false;
      els.quickPreviewPlayer.src = buildYouTubeEmbedUrl(video.videoId, savedSeconds, origin);
      resetPreviewDecisionTimer();
    }

    function createPreviewTag(text, className) {
      const chip = document.createElement("span");
      chip.className = className;
      chip.textContent = text;
      return chip;
    }

    function startPreviewSession() {
      stopPreviewSession(false);
      state.previewCurrentTime = state.previewProgress[state.previewVideoId] || 0;
      state.previewPlayerState = -1;
      state.previewLastPersistAt = Date.now();
      state.previewPollTimer = window.setInterval(() => {
        sendPreviewCommand("getCurrentTime");
        sendPreviewCommand("getPlayerState");
        tickPreviewDecisionTimer();
      }, 500);
    }

    function stopPreviewSession(shouldFlush = true) {
      if (shouldFlush) flushPreviewProgress();
      if (state.previewPollTimer !== null) window.clearInterval(state.previewPollTimer);
      state.previewPollTimer = null;
      state.previewCountdownActive = false;
    }

    function closeQuickPreview() {
      stopPreviewSession();
      state.previewVideoId = "";
      state.previewCurrentTime = 0;
      state.previewPlayerState = -1;
      state.previewPlayerReady = false;
      els.quickPreviewPlayer.src = "about:blank";
      els.quickPreviewPlayer.dataset.videoId = "";
      resetPreviewDecisionTimer();
    }

    function initializePreviewPlayer() {
      if (!state.previewVideoId || els.quickPreviewPlayer.src === "about:blank") return;
      state.previewPlayerReady = true;
      els.quickPreviewPlayer.contentWindow?.postMessage(JSON.stringify({
        event: "listening",
        id: "quick-preview-player",
        channel: "quick-preview",
      }), "*");
      sendPreviewCommand("addEventListener", ["onStateChange"]);
      sendPreviewCommand("getCurrentTime");
      sendPreviewCommand("getPlayerState");
    }

    function sendPreviewCommand(func, args = []) {
      if (!state.previewVideoId) return;
      els.quickPreviewPlayer.contentWindow?.postMessage(JSON.stringify({
        event: "command",
        func,
        args,
      }), "*");
    }

    function handlePreviewPlayerMessage(event) {
      if (!state.previewVideoId || !state.previewPlayerReady || event.source !== els.quickPreviewPlayer.contentWindow) return;
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/i.test(event.origin)) return;
      let message = event.data;
      if (typeof message === "string") {
        try {
          message = JSON.parse(message);
        } catch (_error) {
          return;
        }
      }
      if (!message || typeof message !== "object") return;
      const info = message.info && typeof message.info === "object" ? message.info : {};
      if (Number.isFinite(Number(info.currentTime))) updatePreviewCurrentTime(Number(info.currentTime));
      if (Number.isFinite(Number(info.playerState))) state.previewPlayerState = Number(info.playerState);
      if (message.event === "onStateChange" && Number.isFinite(Number(message.info))) {
        state.previewPlayerState = Number(message.info);
      }
    }

    function updatePreviewCurrentTime(seconds) {
      if (!state.previewVideoId || !Number.isFinite(seconds) || seconds < 0) return;
      state.previewCurrentTime = seconds;
      state.previewProgress[state.previewVideoId] = Math.floor(seconds);
      els.quickPreviewProgress.textContent = `Current position ${formatPreviewTime(seconds)} · saved locally.`;
      if (Date.now() - state.previewLastPersistAt >= 5000) flushPreviewProgress();
    }

    function flushPreviewProgress() {
      if (state.previewVideoId && state.previewCurrentTime > 0) {
        state.previewProgress[state.previewVideoId] = Math.floor(state.previewCurrentTime);
      }
      try {
        localStorage.setItem(PREVIEW_PROGRESS_STORAGE_KEY, JSON.stringify(normalizePreviewProgress(state.previewProgress)));
        state.previewLastPersistAt = Date.now();
        return true;
      } catch (_error) {
        return false;
      }
    }

    function startPreviewDecisionTimer() {
      state.previewCountdownRemaining = 30;
      state.previewCountdownActive = true;
      state.previewCountdownLastTick = performance.now();
      sendPreviewCommand("playVideo");
      updatePreviewTimerUi();
    }

    function resetPreviewDecisionTimer() {
      state.previewCountdownRemaining = 30;
      state.previewCountdownActive = false;
      state.previewCountdownLastTick = 0;
      updatePreviewTimerUi();
    }

    function tickPreviewDecisionTimer(now = performance.now()) {
      if (!state.previewCountdownActive) return;
      if (state.previewPlayerState === 1) {
        const elapsed = Math.max(0, (now - state.previewCountdownLastTick) / 1000);
        state.previewCountdownRemaining = Math.max(0, state.previewCountdownRemaining - elapsed);
      }
      state.previewCountdownLastTick = now;
      if (state.previewCountdownRemaining <= 0) {
        state.previewCountdownActive = false;
        sendPreviewCommand("pauseVideo");
        updatePreviewTimerUi();
        els.quickPreviewStatusActions.querySelector('[data-preview-status="keep"]')?.focus();
        showToast("30-second review complete. Choose Keep, Maybe, or Delete.");
        return;
      }
      updatePreviewTimerUi();
    }

    function updatePreviewTimerUi() {
      const ready = !state.previewCountdownActive && state.previewCountdownRemaining <= 0;
      els.quickPreviewTimer.classList.toggle("is-ready", ready);
      els.startPreviewTimer.textContent = state.previewCountdownActive ? "Restart 30 s review" : "Start 30 s review";
      els.quickPreviewTimerStatus.textContent = ready
        ? "Time to decide — playback is paused."
        : state.previewCountdownActive
          ? `${Math.ceil(state.previewCountdownRemaining)} s left${state.previewPlayerState === 1 ? "" : " · waiting for playback"}`
          : "Timer counts only while the video is playing.";
    }

    function setPreviewStatusAndAdvance(status) {
      const videoId = state.previewVideoId;
      if (!videoId || !["keep", "maybe", "delete", "unreviewed"].includes(status)) return;
      const before = getFilteredVideos();
      const currentIndex = before.findIndex(video => video.videoId === videoId);
      const preferredIds = before.slice(Math.max(0, currentIndex + 1)).concat(before.slice(0, Math.max(0, currentIndex)))
        .map(video => video.videoId)
        .filter(candidateId => candidateId !== videoId);
      flushPreviewProgress();
      setStatus(videoId, status);
      const after = getFilteredVideos();
      const afterIds = new Set(after.map(video => video.videoId));
      const nextId = preferredIds.find(candidateId => afterIds.has(candidateId)) || after[0]?.videoId || "";
      if (!nextId) {
        els.quickPreviewDialog.close();
        render();
        showToast(`Marked the last matching video as ${status}.`);
        return;
      }
      state.previewVideoId = nextId;
      state.currentId = nextId;
      render();
      renderQuickPreview(state.videos.find(video => video.videoId === nextId));
      startPreviewSession();
    }

    function moveQuickPreview(direction) {
      const videos = getFilteredVideos();
      const currentIndex = videos.findIndex(video => video.videoId === state.previewVideoId);
      if (currentIndex < 0) return;
      const nextIndex = Math.min(Math.max(currentIndex + direction, 0), videos.length - 1);
      const next = videos[nextIndex];
      if (!next || next.videoId === state.previewVideoId) return;
      flushPreviewProgress();
      state.previewVideoId = next.videoId;
      state.currentId = next.videoId;
      render();
      renderQuickPreview(next);
      startPreviewSession();
    }

    function createEditVideoButton(video) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Tags / note";
      button.addEventListener("click", () => openVideoEditor(video.videoId));
      return button;
    }

    function openVideoEditor(videoId) {
      const video = state.videos.find(candidate => candidate.videoId === videoId);
      if (!video) return;
      const decision = getDecision(videoId);
      state.editingVideoId = videoId;
      state.currentId = videoId;
      els.videoEditorTitle.textContent = `${video.title || "(untitled)"} · ${video.channel || "Unknown channel"}`;
      els.videoTagsInput.value = (decision.tags || []).join(", ");
      els.videoNoteInput.value = decision.note || "";
      const suggested = (video.suggestedTags || []).map(tag => {
        const chip = document.createElement("span");
        chip.className = "tag";
        chip.textContent = tag;
        return chip;
      });
      if (!suggested.length) {
        const empty = document.createElement("span");
        empty.className = "scope-text";
        empty.textContent = "No tags suggested by the current rules.";
        suggested.push(empty);
      }
      els.videoEditorSuggested.replaceChildren(...suggested);
      els.videoEditorDialog.showModal();
      els.videoTagsInput.focus();
    }

    function saveVideoEditor(event) {
      event.preventDefault();
      const videoId = state.editingVideoId;
      if (!videoId) return;
      updateDecisionDetails(
        state.decisions,
        videoId,
        splitInputValues(els.videoTagsInput.value),
        els.videoNoteInput.value,
      );
      saveDecisions();
      els.videoEditorDialog.close();
      render();
      showToast("Saved manual tags and note.");
    }

    function renderSidebar() {
      renderChannelList();
      renderTagSummary();
      renderRuleSummary();
      renderChannelRuleSummary();
    }

    function renderChannelList() {
      const channels = groupCounts(state.videos, video => video.channel || "(unknown)")
        .slice(0, 18);
      els.channelList.replaceChildren(...channels.map(item => {
        const button = document.createElement("button");
        button.className = "channel-button";
        button.type = "button";
        button.title = item.name;
        button.append(createChannelName(item.name), createCount(item.count));
        button.addEventListener("click", () => {
          state.activeChannels = new Set([item.name]);
          els.channelSearch.value = "";
          handleFilterChange();
        });
        return button;
      }));
    }

    function renderTagSummary() {
      const countsByTag = getTagCounts();
      const counts = Object.keys(countsByTag).map(tag => ({
        name: tag,
        count: countsByTag[tag],
      })).sort((a, b) => b.count - a.count);

      els.tagSummary.replaceChildren(...counts.map(item => {
        const button = document.createElement("button");
        button.className = "channel-button";
        button.type = "button";
        button.innerHTML = `<span></span><strong>${item.count}</strong>`;
        button.querySelector("span").textContent = item.name;
        button.addEventListener("click", () => {
          state.activeTags = new Set([item.name]);
          handleFilterChange();
        });
        return button;
      }));
    }

    function renderRuleSummary() {
      const builtInCount = Object.keys(RULES).length;
      const userCount = Object.keys(state.userRules).length;
      els.ruleSummary.textContent = `${builtInCount} built-in rules · ${userCount} custom or overridden.`;
    }

    function openRulesDialog() {
      renderRuleChannelOptions();
      renderRuleList();
      resetRuleEditor();
      els.rulesDialog.showModal();
    }

    function renderChannelRuleSummary() {
      const protectedCount = state.channelRules.filter(rule => rule.protected).length;
      const pending = getCombinedChannelRuleImpact(state.videos, state.decisions, state.channelRules);
      els.channelRuleSummary.textContent = `${state.channelRules.length} rules · ${protectedCount} protected channels · ${pending.affectedIds.length} videos with pending defaults.`;
    }

    function renderRuleChannelOptions() {
      els.ruleChannels.replaceChildren(...getAllChannelNames().map(channel => {
        const option = document.createElement("option");
        option.value = channel;
        return option;
      }));
    }

    function renderRuleList() {
      const effectiveRules = getEffectiveRules();
      const names = Object.keys(effectiveRules).sort((a, b) => a.localeCompare(b));
      const items = names.map(name => {
        const rule = effectiveRules[name];
        const isBuiltIn = Object.prototype.hasOwnProperty.call(RULES, name);
        const isOverride = Object.prototype.hasOwnProperty.call(state.userRules, name);
        const item = document.createElement("div");
        item.className = "rule-item";
        const content = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = name;
        const meta = document.createElement("div");
        meta.className = "rule-item-meta";
        const source = isOverride ? (isBuiltIn ? "built-in override" : "custom") : "built-in";
        const channel = rule.channel ? ` · channel: ${rule.channel}` : " · all channels";
        meta.textContent = `${source} · ${rule.positive.length} positive · ${rule.negative.length} negative${channel}`;
        content.append(title, meta);
        const actions = document.createElement("div");
        actions.className = "rule-item-actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => editRule(name));
        actions.appendChild(edit);
        if (isOverride || !isBuiltIn) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.textContent = isBuiltIn ? "Restore" : "Remove";
          remove.addEventListener("click", () => removeUserRule(name, isBuiltIn));
          actions.appendChild(remove);
        }
        item.append(content, actions);
        return item;
      });
      els.ruleList.replaceChildren(...items);
    }

    function editRule(name) {
      const rule = getEffectiveRules()[name];
      if (!rule) return;
      state.editingRuleName = name;
      els.ruleNameInput.value = name;
      els.ruleNameInput.readOnly = true;
      els.rulePositiveInput.value = rule.positive.join("\n");
      els.ruleNegativeInput.value = rule.negative.join("\n");
      els.ruleChannelInput.value = rule.channel;
      els.rulePositiveInput.focus();
    }

    function resetRuleEditor() {
      state.editingRuleName = "";
      els.ruleNameInput.readOnly = false;
      els.ruleNameInput.value = "";
      els.rulePositiveInput.value = "";
      els.ruleNegativeInput.value = "";
      els.ruleChannelInput.value = "";
      if (els.rulesDialog.open) els.ruleNameInput.focus();
    }

    function saveRuleEditor(event) {
      event.preventDefault();
      const name = els.ruleNameInput.value.trim();
      const positive = splitInputValues(els.rulePositiveInput.value);
      if (!name || !positive.length) {
        showToast("A rule needs a tag name and at least one positive keyword.");
        return;
      }
      state.userRules[name] = normalizeRule({
        positive,
        negative: splitInputValues(els.ruleNegativeInput.value),
        channel: els.ruleChannelInput.value,
      });
      saveStoredJson(USER_RULES_STORAGE_KEY, state.userRules);
      refreshEnrichedVideos();
      state.activeTags = new Set(Array.from(state.activeTags).filter(tag => getAllTagNames().includes(tag)));
      renderRuleList();
      renderTagFilters();
      render();
      resetRuleEditor();
      showToast(`Saved rule for “${name}”.`);
    }

    function removeUserRule(name, restoresBuiltIn) {
      const action = restoresBuiltIn ? "restore the built-in rule" : "remove this custom rule";
      if (!confirm(`Remove “${name}” and ${action}?`)) return;
      delete state.userRules[name];
      saveStoredJson(USER_RULES_STORAGE_KEY, state.userRules);
      refreshEnrichedVideos();
      state.activeTags = new Set(Array.from(state.activeTags).filter(tag => getAllTagNames().includes(tag)));
      renderRuleList();
      renderTagFilters();
      render();
      resetRuleEditor();
      showToast(restoresBuiltIn ? `Restored built-in rule “${name}”.` : `Removed rule “${name}”.`);
    }

    function openChannelRulesDialog() {
      renderChannelRuleList();
      resetChannelRuleEditor();
      els.channelRulesDialog.showModal();
    }

    function getChannelRuleChannelOptions() {
      const channels = groupCounts(state.videos, video => video.channel || "(unknown)");
      return filterChannelOptions(channels, els.channelRuleChannelInput.value);
    }

    function openChannelRuleChannelMenu() {
      renderChannelRuleChannelMenu();
      els.channelRuleChannelCombo.classList.add("is-open");
    }

    function closeChannelRuleChannelMenu() {
      els.channelRuleChannelCombo.classList.remove("is-open");
    }

    function selectChannelRuleChannel(channel) {
      els.channelRuleChannelInput.value = channel;
      closeChannelRuleChannelMenu();
      renderChannelRulePreview();
    }

    function renderChannelRuleChannelMenu() {
      const page = getChannelOptionPage(
        groupCounts(state.videos, video => video.channel || "(unknown)"),
        els.channelRuleChannelInput.value,
        24,
      );
      const visibleMatches = page.options;
      const summary = document.createElement("div");
      summary.className = "scope-text";
      summary.textContent = page.totalCount > visibleMatches.length
        ? `Showing first ${visibleMatches.length} of ${page.totalCount} matches. Keep typing to narrow the list.`
        : `${page.totalCount} matching ${page.totalCount === 1 ? "channel" : "channels"}.`;

      const options = visibleMatches.map(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "channel-option";
        button.title = item.name;
        button.append(createChannelName(item.name), createCount(item.count));
        button.addEventListener("click", () => selectChannelRuleChannel(item.name));
        return button;
      });

      if (!options.length) {
        const empty = document.createElement("div");
        empty.className = "scope-text";
        empty.textContent = "No matching channels. You can still use the typed channel name.";
        els.channelRuleChannelMenu.replaceChildren(summary, empty);
        return;
      }
      els.channelRuleChannelMenu.replaceChildren(summary, ...options);
    }

    function renderChannelRuleList() {
      const items = state.channelRules.map(rule => {
        const impact = getChannelRuleImpact(state.videos, state.decisions, rule);
        const item = document.createElement("div");
        item.className = "rule-item";
        const content = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = rule.channel;
        const meta = document.createElement("div");
        meta.className = "rule-item-meta";
        const tag = rule.tag ? ` · tag: ${rule.tag}` : "";
        const protection = rule.protected ? " · protected" : "";
        meta.textContent = `${formatChannelRuleMode(rule.mode)}${tag}${protection} · ${impact.matchCount} matches · ${impact.affectedIds.length} pending`;
        content.append(title, meta);
        const actions = document.createElement("div");
        actions.className = "rule-item-actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => editChannelRule(rule.id));
        const apply = document.createElement("button");
        apply.type = "button";
        apply.textContent = "Apply";
        apply.disabled = !impact.affectedIds.length;
        apply.addEventListener("click", () => applyChannelRules([rule], `channel rule for ${rule.channel}`));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => removeChannelRule(rule.id));
        actions.append(edit, apply, remove);
        item.append(content, actions);
        return item;
      });

      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "scope-text";
        empty.textContent = "No channel rules yet.";
        items.push(empty);
      }
      els.channelRuleList.replaceChildren(...items);
      els.applyAllChannelRules.disabled = !getCombinedChannelRuleImpact(state.videos, state.decisions, state.channelRules).affectedIds.length;
    }

    function getChannelRuleDraft() {
      return normalizeChannelRule({
        id: state.editingChannelRuleId,
        channel: els.channelRuleChannelInput.value,
        mode: els.channelRuleModeSelect.value,
        tag: els.channelRuleTagInput.value,
        protected: els.channelRuleProtectedInput.checked,
      });
    }

    function renderChannelRulePreview() {
      const alwaysKeep = els.channelRuleModeSelect.value === "always-keep";
      if (alwaysKeep) els.channelRuleProtectedInput.checked = true;
      els.channelRuleProtectedInput.disabled = alwaysKeep;
      const rule = getChannelRuleDraft();
      if (!rule) {
        els.channelRulePreview.textContent = "Choose a channel to preview this rule.";
        els.applyChannelRule.disabled = true;
        return;
      }
      const impact = getChannelRuleImpact(state.videos, state.decisions, rule);
      const protection = rule.protected
        ? ` ${impact.matchCount} matching videos will trigger protected-channel delete warnings.`
        : "";
      els.channelRulePreview.textContent = `${impact.matchCount} matching videos. Applying now would change ${impact.statusChangeCount} statuses and add ${impact.tagAdditionCount} tags across ${impact.affectedIds.length} videos.${protection}`;
      els.applyChannelRule.disabled = !impact.affectedIds.length;
    }

    function editChannelRule(ruleId) {
      const rule = state.channelRules.find(candidate => candidate.id === ruleId);
      if (!rule) return;
      state.editingChannelRuleId = rule.id;
      els.channelRuleChannelInput.value = rule.channel;
      els.channelRuleModeSelect.value = rule.mode;
      els.channelRuleTagInput.value = rule.tag;
      els.channelRuleProtectedInput.checked = rule.protected;
      renderChannelRulePreview();
      els.channelRuleChannelInput.focus();
    }

    function resetChannelRuleEditor() {
      state.editingChannelRuleId = "";
      els.channelRuleChannelInput.value = "";
      els.channelRuleModeSelect.value = "none";
      els.channelRuleTagInput.value = "";
      els.channelRuleProtectedInput.checked = false;
      renderChannelRulePreview();
      if (els.channelRulesDialog.open) els.channelRuleChannelInput.focus();
    }

    function saveChannelRuleEditor(event) {
      event.preventDefault();
      const rule = getChannelRuleDraft();
      if (!rule) {
        showToast("A channel rule needs a channel name.");
        return;
      }
      const savedRule = storeChannelRule(rule);
      renderChannelRuleList();
      renderChannelRuleSummary();
      renderChannelRulePreview();
      showToast(`Saved channel rule for “${savedRule.channel}”. Review the preview before applying it.`);
    }

    function storeChannelRule(rule) {
      const existingIndex = state.channelRules.findIndex(candidate =>
        candidate.id === rule.id || candidate.channel.toLowerCase() === rule.channel.toLowerCase()
      );
      if (existingIndex >= 0) {
        rule.id = state.channelRules[existingIndex].id;
        state.channelRules.splice(existingIndex, 1, rule);
      } else {
        rule.id = createSnapshotId();
        state.channelRules.push(rule);
      }
      state.channelRules = normalizeChannelRules(state.channelRules);
      state.editingChannelRuleId = rule.id;
      saveStoredJson(CHANNEL_RULES_STORAGE_KEY, state.channelRules);
      return state.channelRules.find(candidate => candidate.id === rule.id) || rule;
    }

    function removeChannelRule(ruleId) {
      const rule = state.channelRules.find(candidate => candidate.id === ruleId);
      if (!rule || !confirm(`Remove the channel rule for “${rule.channel}”? Applied decisions will not be changed.`)) return;
      state.channelRules = state.channelRules.filter(candidate => candidate.id !== ruleId);
      saveStoredJson(CHANNEL_RULES_STORAGE_KEY, state.channelRules);
      renderChannelRuleList();
      renderChannelRuleSummary();
      resetChannelRuleEditor();
      showToast(`Removed channel rule for “${rule.channel}”.`);
    }

    function applyCurrentChannelRule() {
      const rule = getChannelRuleDraft();
      if (!rule) {
        showToast("Choose a channel before applying a rule.");
        return;
      }
      const savedRule = storeChannelRule(rule);
      renderChannelRuleList();
      renderChannelRuleSummary();
      applyChannelRules([savedRule], `channel rule for ${savedRule.channel}`);
    }

    function applyAllPendingChannelRules() {
      applyChannelRules(state.channelRules, `${state.channelRules.length} channel rules`);
    }

    function applyChannelRules(rules, label) {
      const normalizedRules = normalizeChannelRules(rules);
      const impact = getCombinedChannelRuleImpact(state.videos, state.decisions, normalizedRules);
      if (!impact.affectedIds.length) {
        showToast("These channel rules have no pending changes.");
        return;
      }
      const ok = confirm([
        `Apply ${label}?`,
        "",
        `Matching videos: ${impact.matchCount}`,
        `Status changes: ${impact.statusChangeCount}`,
        `Tags added: ${impact.tagAdditionCount}`,
        `Affected videos: ${impact.affectedIds.length}`,
        "",
        "Existing statuses are preserved by default modes. An undo snapshot will be created.",
      ].join("\n"));
      if (!ok) return;
      if (!addHistoryEntry(`Applied ${label} to ${impact.affectedIds.length} videos`, "channel-rule", impact.affectedIds)) {
        showToast("Channel rule application cancelled because the local safety snapshot could not be saved.");
        return;
      }

      const updatedAt = new Date().toISOString();
      for (const rule of normalizedRules) {
        for (const video of state.videos) {
          if (String(video.channel || "").trim().toLowerCase() !== rule.channel.toLowerCase()) continue;
          const current = getDecision(video.videoId);
          const next = getChannelRuleDecision(current, rule, updatedAt);
          if (!areDecisionsEqual(current, next)) state.decisions[video.videoId] = next;
        }
      }
      saveDecisions();
      state.selectedIds.clear();
      renderTagFilters();
      render();
      if (els.channelRulesDialog.open) {
        renderChannelRuleList();
        renderChannelRulePreview();
      }
      showToast(`Applied channel rules to ${impact.affectedIds.length} videos. You can restore the safety snapshot from history.`);
    }

    function formatChannelRuleMode(mode) {
      return ({
        none: "No status default",
        "default-keep": "Keep new/unreviewed",
        "default-review": "Review new/unreviewed",
        "always-keep": "Always keep",
        "always-review": "Always review",
      })[mode] || "No status default";
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
        const raw = await file.text();
        const incoming = parseWorkspacePayload(JSON.parse(raw));
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
        state.datasetBaseline = createDatasetBaseline(state.videos, state.lastImport);
        saveDatasetBaseline(state.datasetBaseline);
        state.history = mergeHistoryEntries([
          ...(importBackup ? [importBackup] : []),
          ...incoming.history,
          ...state.history.filter(entry => entry !== importBackup),
        ]);

        saveDecisions();
        saveStoredJson(USER_RULES_STORAGE_KEY, state.userRules);
        saveStoredJson(CHANNEL_RULES_STORAGE_KEY, state.channelRules);
        saveStoredJson(SAVED_VIEWS_STORAGE_KEY, state.savedViews);
        localStorage.setItem(TIME_BUDGET_STORAGE_KEY, String(state.timeBudgetHours));
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
        const raw = await file.text();
        const parsed = JSON.parse(raw);
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
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

    function undoLastBulkChange() {
      const entry = state.history.find(candidate => ["bulk-status", "channel-rule", "similarity-group"].includes(candidate.action));
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

    function renderHistory() {
      els.historyList.replaceChildren();
      if (!state.history.length) {
        const empty = document.createElement("div");
        empty.className = "scope-text";
        empty.textContent = "Workspace safety snapshots will appear here.";
        els.historyList.appendChild(empty);
        return;
      }

      for (const entry of state.history) {
        const item = document.createElement("div");
        item.className = "history-item";
        const title = document.createElement("strong");
        title.textContent = entry.description;
        const meta = document.createElement("div");
        meta.className = "history-meta";
        const date = Date.parse(entry.createdAt);
        meta.textContent = `${entry.affectedCount} decisions · ${Number.isFinite(date) ? new Date(date).toLocaleString() : "unknown time"}`;
        const restore = document.createElement("button");
        restore.type = "button";
        restore.textContent = "Restore snapshot";
        restore.addEventListener("click", () => restoreHistoryEntry(entry));
        item.append(title, meta, restore);
        els.historyList.appendChild(item);
      }
    }

    function loadDecisions() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      } catch (_error) {
        return {};
      }
    }

    function saveDecisions() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.decisions));
    }

    function loadHistory() {
      try {
        return normalizeHistory(JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]"));
      } catch (_error) {
        return [];
      }
    }

    function saveHistory() {
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.history));
        return true;
      } catch (_error) {
        return false;
      }
    }

    function loadStoredObject(key) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
      } catch (_error) {
        return {};
      }
    }

    function loadStoredArray(key) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
      } catch (_error) {
        return [];
      }
    }

    function saveStoredJson(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }

    function loadDatasetBaseline() {
      try {
        const parsed = JSON.parse(localStorage.getItem(DATASET_BASELINE_STORAGE_KEY) || "null");
        if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.videos)) return null;
        return {
          schemaVersion: 1,
          savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
          lastImport: normalizePlainObject(parsed.lastImport),
          videos: parsed.videos.map(createVideoSnapshot).filter(video => video.videoId),
        };
      } catch (_error) {
        return null;
      }
    }

    function saveDatasetBaseline(baseline) {
      try {
        localStorage.setItem(DATASET_BASELINE_STORAGE_KEY, JSON.stringify(baseline));
        return true;
      } catch (_error) {
        return false;
      }
    }

    function handleShortcuts(event) {
      const tagName = document.activeElement?.tagName?.toLowerCase();
      const isTyping = tagName === "input" || tagName === "select" || tagName === "textarea";

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        els.searchInput.focus();
        return;
      }

      if (isTyping || !state.currentId) return;

      if (event.key === "p") {
        event.preventDefault();
        if (els.quickPreviewDialog.open) els.quickPreviewDialog.close();
        else openQuickPreview(state.currentId);
        return;
      }

      if (els.quickPreviewDialog.open && state.previewVideoId) {
        if (["k", "m", "d"].includes(event.key)) {
          const status = { k: "keep", m: "maybe", d: "delete" }[event.key];
          setPreviewStatusAndAdvance(status);
        } else if (event.key === "j" || event.key === "ArrowDown") {
          event.preventDefault();
          moveQuickPreview(1);
        } else if (event.key === "J" || event.key === "ArrowUp") {
          event.preventDefault();
          moveQuickPreview(-1);
        }
        return;
      }

      if (event.key === "k") {
        setStatusAndAdvance(state.currentId, "keep");
      } else if (event.key === "m") {
        setStatusAndAdvance(state.currentId, "maybe");
      } else if (event.key === "d") {
        setStatusAndAdvance(state.currentId, "delete");
      } else if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        moveCurrent(1);
        render({ scrollToCurrent: true });
      } else if (event.key === "J" || event.key === "ArrowUp") {
        event.preventDefault();
        moveCurrent(-1);
        render({ scrollToCurrent: true });
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
