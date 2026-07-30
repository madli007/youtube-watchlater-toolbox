(function registerGroupsViewUi(root) {
  "use strict";

  const GROUP_TYPES = Object.freeze({
    series: "Series",
    similar: "Similar titles",
    duplicate: "Probable duplicate",
  });
  const GROUP_PAGE_SIZE = 100;

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function getGroupChannels(group) {
    return Array.from(new Set(
      (group?.members || [])
        .map(video => String(video?.channel || "(unknown)").trim() || "(unknown)"),
    )).sort((left, right) => left.localeCompare(right));
  }

  function getGroupConfidenceKind(group) {
    if (group?.manual === true || group?.confidenceKind === "manual") return "manual";
    return group?.reviewRequired ? "review" : "auto";
  }

  function getGroupStatuses(group, getStatus) {
    return (group?.members || []).map(video => getStatus(video.videoId));
  }

  function matchesGroupStatus(statuses, filter) {
    if (filter === "all") return true;
    const unique = new Set(statuses);
    const unreviewedCount = statuses.filter(status => status === "unreviewed").length;
    if (filter === "has-unreviewed") return unreviewedCount > 0;
    if (filter === "mixed") return unique.size > 1;
    if (filter === "all-decided") return statuses.length > 0 && unreviewedCount === 0;
    if (filter.startsWith("all-")) {
      const expected = filter.slice(4);
      return statuses.length > 0 && statuses.every(status => status === expected);
    }
    return true;
  }

  function filterVideoGroups(groups, filters = {}, getStatus = () => "unreviewed") {
    const query = normalizeSearchText(filters.search);
    const channel = String(filters.channel || "all");
    const type = String(filters.type || "all");
    const confidence = String(filters.confidence || "all");
    const status = String(filters.status || "all");
    const onlyUndecided = Boolean(filters.onlyUndecided);

    return (Array.isArray(groups) ? groups : []).filter(group => {
      const channels = getGroupChannels(group);
      const statuses = getGroupStatuses(group, getStatus);
      if (type !== "all" && group.type !== type) return false;
      if (channel !== "all" && !channels.includes(channel)) return false;
      if (confidence !== "all" && getGroupConfidenceKind(group) !== confidence) return false;
      if (onlyUndecided && !statuses.includes("unreviewed")) return false;
      if (!matchesGroupStatus(statuses, status)) return false;
      if (!query) return true;
      const searchable = normalizeSearchText([
        group.label,
        group.type,
        ...channels,
        ...(group.reasons || []),
        ...(group.members || []).flatMap(video => [video.title, video.channel]),
      ].filter(Boolean).join(" "));
      return searchable.includes(query);
    });
  }

  function formatSequence(sequence) {
    if (!sequence) return "";
    if (sequence.kind === "qualifier") {
      const qualifier = String(sequence.qualifier || "Special").trim();
      return qualifier ? qualifier[0].toUpperCase() + qualifier.slice(1) : "Special";
    }
    const numbers = sequence.episodes?.length
      ? sequence.episodes
      : sequence.parts?.length
        ? sequence.parts
        : [sequence.episode ?? sequence.part].filter(Number.isFinite);
    const numberLabel = numbers.length > 1
      ? `${numbers[0]}\u2013${numbers.at(-1)}`
      : String(numbers[0] ?? "?");
    if (sequence.kind === "part") return `Part ${numberLabel}`;
    if (sequence.kind === "chapter") return `Chapter ${numberLabel}`;
    const episodeLabel = `E${numberLabel}`;
    return Number.isFinite(sequence.season)
      ? `S${sequence.season} \u00b7 ${episodeLabel}`
      : episodeLabel;
  }

  function formatConfidence(group) {
    const kind = getGroupConfidenceKind(group);
    if (kind === "manual") return "Manual";
    const score = Number(group?.confidence);
    const percent = Number.isFinite(score) ? ` \u00b7 ${Math.round(score * 100)}%` : "";
    return `${kind === "review" ? "Needs review" : "Auto"}${percent}`;
  }

  function createGroupsViewUi(context) {
    const {
      state,
      els,
      document: documentRef,
      getMemoizedVideoGroups,
      parseSeriesTitle,
      chooseGroupWinner,
      createGroupDecisionPlan,
      applyDecisionPlan,
      getProtectedChannelMatches,
      createAliasOverride,
      createMergeOverride,
      createSplitOverride,
      getGroupingOverrideDiagnostics,
      normalizeGroupingOverrides,
      removeGroupingOverride,
    } = context;
    const confirmedReviewGroupIds = new Set();
    let confirmedDatasetRevision = state.datasetRevision;
    const getStatus = videoId => context.getStatus(videoId);
    const navigateToGroupsGroup = groupId => {
      if (typeof context.navigateToGroupsGroup === "function") {
        state.selectedGroupMemberIds.clear();
        context.navigateToGroupsGroup(groupId);
        return;
      }
      state.selectedGroupId = groupId;
      state.selectedGroupMemberIds.clear();
      renderGroups();
    };

    function getAllGroups() {
      return getMemoizedVideoGroups(state.groupingCache, {
        videos: state.videos,
        datasetRevision: state.datasetRevision,
        overrides: state.groupingOverrides,
        overrideRevision: state.groupingOverrideRevision,
      });
    }

    function getFilters() {
      return {
        search: state.groupSearch,
        channel: state.groupChannel,
        type: state.groupType,
        confidence: state.groupConfidence,
        status: state.groupStatus,
        onlyUndecided: state.groupOnlyUndecided,
      };
    }

    function updateFiltersFromControls() {
      state.groupSearch = els.groupsSearch.value;
      state.groupChannel = els.groupsChannel.value;
      state.groupType = els.groupsType.value;
      state.groupConfidence = els.groupsConfidence.value;
      state.groupStatus = els.groupsStatus.value;
      state.groupOnlyUndecided = els.groupsOnlyUndecided.checked;
      state.renderedGroupCount = GROUP_PAGE_SIZE;
      renderGroups();
    }

    function clearFilters() {
      state.groupSearch = "";
      state.groupChannel = "all";
      state.groupType = "all";
      state.groupConfidence = "all";
      state.groupStatus = "all";
      state.groupOnlyUndecided = false;
      state.renderedGroupCount = GROUP_PAGE_SIZE;
      renderGroups();
    }

    function initializeGroupsView() {
      els.groupsSearch.addEventListener("input", updateFiltersFromControls);
      [
        els.groupsChannel,
        els.groupsType,
        els.groupsConfidence,
        els.groupsStatus,
        els.groupsOnlyUndecided,
      ].forEach(control => control.addEventListener("change", updateFiltersFromControls));
      els.groupsClearFilters.addEventListener("click", clearFilters);
      els.groupsImportJsonAction.addEventListener("click", () => els.fileInput.click());
      els.groupsShowMore.addEventListener("click", () => {
        state.renderedGroupCount += GROUP_PAGE_SIZE;
        renderGroups();
      });
      els.groupsMergeSelected.addEventListener("click", mergeSelectedGroups);
      els.groupsClearSelected.addEventListener("click", () => {
        state.selectedGroupIds.clear();
        renderGroups();
      });
      els.groupsConfirmMatch.addEventListener("click", confirmSelectedGroup);
      els.groupsOpenInTriage.addEventListener("click", openSelectedGroupInTriage);
      els.groupsKeepAll.addEventListener("click", () => applySelectedGroupStatus("keep"));
      els.groupsMaybeAll.addEventListener("click", () => applySelectedGroupStatus("maybe"));
      els.groupsDeleteAll.addEventListener("click", () => applySelectedGroupStatus("delete"));
      els.groupsKeepEarliestEpisode.addEventListener("click", () => applySelectedGroupWinner("earliest-episode"));
      els.groupsKeepNewest.addEventListener("click", () => applySelectedGroupWinner("newest"));
      els.groupsKeepMostViewed.addEventListener("click", () => applySelectedGroupWinner("most-viewed"));
      els.groupsEditAlias.addEventListener("click", editSelectedGroupAlias);
      els.groupsSplitMembers.addEventListener("click", splitSelectedMembers);
    }

    function syncControls(allGroups) {
      const channels = Array.from(new Set(allGroups.flatMap(getGroupChannels)))
        .sort((left, right) => left.localeCompare(right));
      if (state.groupChannel !== "all" && !channels.includes(state.groupChannel)) {
        state.groupChannel = "all";
      }
      const channelOptions = [
        createOption("all", "All channels"),
        ...channels.map(channel => createOption(channel, channel)),
      ];
      els.groupsChannel.replaceChildren(...channelOptions);
      els.groupsSearch.value = state.groupSearch;
      els.groupsChannel.value = state.groupChannel;
      els.groupsType.value = state.groupType;
      els.groupsConfidence.value = state.groupConfidence;
      els.groupsStatus.value = state.groupStatus;
      els.groupsOnlyUndecided.checked = state.groupOnlyUndecided;
    }

    function createOption(value, label) {
      const option = documentRef.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }

    function resolveSelectedGroup(allGroups) {
      if (state.groupFocusVideoId) {
        const focusedGroup = allGroups.find(group => group.members.some(
          video => video.videoId === state.groupFocusVideoId,
        ));
        state.selectedGroupId = focusedGroup?.id || "";
      }
      const selected = allGroups.find(group => group.id === state.selectedGroupId) || null;
      if (!selected) state.selectedGroupId = "";
      return selected;
    }

    function renderGroups() {
      if (confirmedDatasetRevision !== state.datasetRevision) {
        confirmedReviewGroupIds.clear();
        confirmedDatasetRevision = state.datasetRevision;
      }
      const allGroups = getAllGroups();
      const allGroupIds = new Set(allGroups.map(group => group.id));
      state.selectedGroupIds = new Set(
        Array.from(state.selectedGroupIds).filter(groupId => allGroupIds.has(groupId)),
      );
      syncControls(allGroups);
      const selectedGroup = resolveSelectedGroup(allGroups);
      const groups = filterVideoGroups(allGroups, getFilters(), getStatus);
      const groupedVideoCount = new Set(
        allGroups.flatMap(group => group.members.map(video => video.videoId)),
      ).size;

      els.groupsImportContext.textContent = getImportContext();
      renderGroupingOverrides();
      if (!state.videos.length) {
        renderPageEmpty(
          "No dataset imported",
          "Import a Watch Later JSON file to detect series, similar titles, and probable duplicates.",
          true,
        );
        return;
      }
      if (!allGroups.length) {
        renderPageEmpty(
          "No groups detected",
          `The current ${state.videos.length.toLocaleString()}-video dataset has no supported local title patterns.`,
          false,
        );
        return;
      }

      els.groupsEmptyState.hidden = true;
      els.groupsBrowser.hidden = false;
      const typeCounts = allGroups.reduce((counts, group) => {
        counts[group.type] = (counts[group.type] || 0) + 1;
        return counts;
      }, {});
      els.groupsSummary.textContent = [
        `${groups.length} of ${allGroups.length} groups`,
        `${groupedVideoCount} unique videos`,
        `${typeCounts.series || 0} series`,
        `${typeCounts.similar || 0} similar`,
        `${typeCounts.duplicate || 0} duplicates`,
      ].join(" \u00b7 ");
      els.groupsMergeSelected.disabled = state.selectedGroupIds.size < 2;
      els.groupsMergeSelected.textContent = state.selectedGroupIds.size
        ? `Merge selected (${state.selectedGroupIds.size})`
        : "Merge selected";
      els.groupsClearSelected.disabled = state.selectedGroupIds.size === 0;

      if (groups.length) {
        const renderedGroups = groups.slice(0, state.renderedGroupCount || GROUP_PAGE_SIZE);
        els.groupsList.replaceChildren(...renderedGroups.map(group => createGroupSummary(group)));
        els.groupsShowMore.hidden = renderedGroups.length >= groups.length;
        els.groupsShowMore.textContent = `Show more groups (${renderedGroups.length} / ${groups.length})`;
      } else {
        const empty = documentRef.createElement("div");
        empty.className = "groups-list-empty";
        empty.setAttribute("role", "listitem");
        empty.textContent = "No groups match the current filters.";
        els.groupsList.replaceChildren(empty);
        els.groupsShowMore.hidden = true;
      }
      renderGroupDetail(selectedGroup);
    }

    function renderPageEmpty(title, description, showImport) {
      els.groupsBrowser.hidden = true;
      els.groupsEmptyState.hidden = false;
      els.groupsShowMore.hidden = true;
      els.groupsEmptyTitle.textContent = title;
      els.groupsEmptyDescription.textContent = description;
      els.groupsImportJsonAction.hidden = !showImport;
    }

    function getImportContext() {
      if (!state.lastImport) {
        return state.videos.length
          ? `${state.videos.length.toLocaleString()} videos \u00b7 analysis uses the full dataset`
          : "No Watch Later dataset is loaded.";
      }
      const fileName = state.lastImport.fileName || "Imported dataset";
      return `${fileName} \u00b7 ${state.videos.length.toLocaleString()} videos \u00b7 analysis uses the full dataset`;
    }

    function createGroupSummary(group) {
      const item = documentRef.createElement("div");
      item.setAttribute("role", "listitem");
      item.className = "group-summary-item";
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "group-summary-row";
      button.dataset.groupId = group.id;
      button.setAttribute("aria-pressed", String(group.id === state.selectedGroupId));
      if (group.id === state.selectedGroupId) button.classList.add("is-selected");

      const main = documentRef.createElement("span");
      main.className = "group-summary-main";
      const title = documentRef.createElement("strong");
      title.textContent = group.label;
      const meta = documentRef.createElement("span");
      const channels = getGroupChannels(group);
      meta.textContent = `${channels.length === 1 ? channels[0] : `${channels.length} channels`} \u00b7 ${group.members.length} videos`;
      main.append(title, meta);

      const badges = documentRef.createElement("span");
      badges.className = "group-summary-badges";
      badges.append(
        createBadge(GROUP_TYPES[group.type] || group.type, "group-type-badge"),
        createBadge(formatConfidence(group), `group-confidence-badge is-${getGroupConfidenceKind(group)}`),
      );

      const statuses = getGroupStatuses(group, getStatus);
      const unreviewed = statuses.filter(status => status === "unreviewed").length;
      const status = documentRef.createElement("span");
      status.className = "group-summary-status";
      status.textContent = unreviewed
        ? `${unreviewed} undecided`
        : `${new Set(statuses).size > 1 ? "Mixed" : statuses[0] || "Decided"}`;
      button.append(main, badges, status);
      button.addEventListener("click", () => navigateToGroupsGroup(group.id));
      const selection = documentRef.createElement("input");
      selection.type = "checkbox";
      selection.className = "group-summary-select";
      selection.checked = state.selectedGroupIds.has(group.id);
      selection.setAttribute("aria-label", `Select ${group.label} for manual merge`);
      selection.addEventListener("change", () => {
        if (selection.checked) state.selectedGroupIds.add(group.id);
        else state.selectedGroupIds.delete(group.id);
        renderGroups();
      });
      item.append(selection, button);
      return item;
    }

    function createBadge(label, className) {
      const badge = documentRef.createElement("span");
      badge.className = className;
      badge.textContent = label;
      return badge;
    }

    function renderGroupDetail(group) {
      els.groupsBrowser.classList.toggle("has-detail", Boolean(group));
      els.groupsDetail.hidden = !group;
      if (!group) return;

      els.groupsDetailTitle.textContent = group.label;
      const channels = getGroupChannels(group);
      els.groupsDetailMeta.textContent = [
        GROUP_TYPES[group.type] || group.type,
        channels.join(", "),
        `${group.members.length} videos`,
      ].join(" \u00b7 ");
      els.groupsDetailConfidence.textContent = formatConfidence(group);
      els.groupsDetailConfidence.className = `group-confidence-badge is-${getGroupConfidenceKind(group)}`;
      const validMemberIds = new Set(group.members.map(video => video.videoId));
      state.selectedGroupMemberIds = new Set(
        Array.from(state.selectedGroupMemberIds).filter(videoId => validMemberIds.has(videoId)),
      );
      renderGroupActions(group);
      const reasons = (group.reasons?.length ? group.reasons : [group.reason])
        .filter(Boolean)
        .map(reason => {
          const item = documentRef.createElement("li");
          item.textContent = reason;
          return item;
        });
      els.groupsDetailReasons.replaceChildren(...reasons);

      const parsedById = new Map(
        (group.parsedMembers || []).map(parsed => [parsed.video.videoId, parsed]),
      );
      els.groupsDetailMembers.replaceChildren(...group.members.map(video => {
        const parsed = parsedById.get(video.videoId) || parseSeriesTitle(video);
        return createMemberRow(video, parsed);
      }));
    }

    function getSelectedGroup() {
      return getAllGroups().find(group => group.id === state.selectedGroupId) || null;
    }

    function isGroupActionEnabled(group) {
      return Boolean(group)
        && (getGroupConfidenceKind(group) !== "review" || confirmedReviewGroupIds.has(group.id));
    }

    function renderGroupActions(group) {
      const requiresConfirmation = getGroupConfidenceKind(group) === "review"
        && !confirmedReviewGroupIds.has(group.id);
      const earliestEpisodeWinner = chooseGroupWinner(group, "earliest-episode");
      const newestWinner = chooseGroupWinner(group, "newest");
      const viewedWinner = chooseGroupWinner(group, "most-viewed");
      const channels = getGroupChannels(group);

      els.groupsConfirmMatch.hidden = !requiresConfirmation;
      els.groupsDetailSafety.textContent = requiresConfirmation
        ? "This match needs review. Confirm the group before applying decisions to multiple videos."
        : "Every multi-video decision creates a local undo snapshot.";
      [els.groupsKeepAll, els.groupsMaybeAll, els.groupsDeleteAll].forEach(button => {
        button.disabled = requiresConfirmation;
        button.title = requiresConfirmation ? "Confirm this review group to enable bulk decisions" : "";
      });
      setRecommendationAvailability(
        els.groupsKeepEarliestEpisode,
        earliestEpisodeWinner,
        "episode number",
        requiresConfirmation,
      );
      setRecommendationAvailability(
        els.groupsKeepNewest,
        newestWinner,
        "upload age",
        requiresConfirmation,
      );
      els.groupsEditAlias.disabled = channels.length !== 1;
      els.groupsEditAlias.title = channels.length === 1
        ? "Set a canonical series name for matching title bases in this channel"
        : "Aliases cannot span multiple channels";
      els.groupsSplitMembers.disabled = state.selectedGroupMemberIds.size === 0
        || state.selectedGroupMemberIds.size >= group.members.length;
      els.groupsSplitMembers.textContent = state.selectedGroupMemberIds.size
        ? `Split selected members (${state.selectedGroupMemberIds.size})`
        : "Split selected members";
      setRecommendationAvailability(
        els.groupsKeepMostViewed,
        viewedWinner,
        "view count",
        requiresConfirmation,
      );
    }

    function setRecommendationAvailability(button, winner, metric, requiresConfirmation) {
      button.disabled = requiresConfirmation || !winner;
      if (requiresConfirmation) {
        button.title = "Confirm this review group to enable bulk decisions";
      } else if (winner) {
        button.title = `Keep “${winner.title || winner.videoId}” and mark the other group members delete`;
      } else {
        button.title = `No ${metric} data is available for this group`;
      }
    }

    function confirmSelectedGroup() {
      const group = getSelectedGroup();
      if (!group || getGroupConfidenceKind(group) !== "review") return;
      confirmedReviewGroupIds.add(group.id);
      renderGroupDetail(group);
      context.showToast(`Enabled bulk decisions for “${group.label}”.`);
    }

    function editSelectedGroupAlias() {
      const group = getSelectedGroup();
      if (!group) return;
      context.openGroupingAliasEditor(group, alias => {
        try {
          const override = createAliasOverride(group, alias, {
            id: context.createSnapshotId(),
            createdAt: new Date().toISOString(),
          });
          const next = normalizeGroupingOverrides(state.groupingOverrides);
          next.aliases = [...next.aliases, override];
          state.groupFocusVideoId = group.members[0]?.videoId || "";
          if (!context.saveGroupingOverrides(next)) {
            context.showToast("The alias could not be saved locally.");
            return false;
          }
          context.showToast(`Saved manual alias “${override.label || override.to}”.`);
          context.render();
          return true;
        } catch (error) {
          context.showToast(error.message || "The alias could not be created.");
          return false;
        }
      });
    }

    function mergeSelectedGroups() {
      const groups = getAllGroups().filter(group => state.selectedGroupIds.has(group.id));
      try {
        const override = createMergeOverride(groups, {
          id: context.createSnapshotId(),
          createdAt: new Date().toISOString(),
        });
        const next = normalizeGroupingOverrides(state.groupingOverrides);
        next.merges = [...next.merges, override];
        if (!context.saveGroupingOverrides(next)) {
          context.showToast("The manual merge could not be saved locally.");
          return;
        }
        state.selectedGroupIds.clear();
        state.selectedGroupMemberIds.clear();
        state.groupFocusVideoId = "";
        state.selectedGroupId = `manual-${override.id}`;
        context.render();
        context.showToast(`Merged ${groups.length} groups into a manual group.`);
      } catch (error) {
        context.showToast(error.message || "The selected groups could not be merged.");
      }
    }

    function splitSelectedMembers() {
      const group = getSelectedGroup();
      if (!group) return;
      try {
        const override = createSplitOverride(group, Array.from(state.selectedGroupMemberIds), {
          id: context.createSnapshotId(),
          createdAt: new Date().toISOString(),
        });
        const next = normalizeGroupingOverrides(state.groupingOverrides);
        next.splits = [...next.splits, override];
        if (!context.saveGroupingOverrides(next)) {
          context.showToast("The manual split could not be saved locally.");
          return;
        }
        state.selectedGroupMemberIds.clear();
        state.groupFocusVideoId = "";
        state.selectedGroupId = override.memberIds.length >= 2
          ? `manual-${override.id}`
          : "";
        context.render();
        context.showToast(`Split ${override.memberIds.length} member${override.memberIds.length === 1 ? "" : "s"} from the group.`);
      } catch (error) {
        context.showToast(error.message || "The selected members could not be split.");
      }
    }

    function renderGroupingOverrides() {
      const diagnostics = getGroupingOverrideDiagnostics(state.groupingOverrides, state.videos);
      els.groupsOverridesPanel.hidden = diagnostics.length === 0;
      els.groupsOverridesCount.textContent = String(diagnostics.length);
      els.groupsOverridesList.replaceChildren(...diagnostics.map(diagnostic => {
        const row = documentRef.createElement("div");
        row.className = "groups-override-row";
        const content = documentRef.createElement("div");
        const title = documentRef.createElement("strong");
        title.textContent = `${diagnostic.kind[0].toUpperCase()}${diagnostic.kind.slice(1)} · ${diagnostic.label}`;
        const meta = documentRef.createElement("span");
        meta.textContent = diagnostic.stale
          ? diagnostic.orphanedIds.length
            ? `${diagnostic.orphanedIds.length} orphaned IDs · stale`
            : "No matching current videos · stale"
          : `${diagnostic.matchedIds.length} current videos`;
        content.append(title, meta);
        const badge = createBadge(
          diagnostic.stale ? "Stale" : "Active",
          `group-confidence-badge is-${diagnostic.stale ? "review" : "manual"}`,
        );
        const remove = documentRef.createElement("button");
        remove.type = "button";
        remove.className = "danger";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove ${diagnostic.kind} correction ${diagnostic.label}`);
        remove.addEventListener("click", () => removeOverride(diagnostic));
        row.append(content, badge, remove);
        return row;
      }));
    }

    function removeOverride(diagnostic) {
      if (!context.window.confirm(
        `Remove the manual ${diagnostic.kind} correction “${diagnostic.label}”? Detected groups will be recalculated.`,
      )) return;
      const next = removeGroupingOverride(state.groupingOverrides, diagnostic.id);
      if (!context.saveGroupingOverrides(next)) {
        context.showToast("The correction could not be removed from local storage.");
        return;
      }
      state.selectedGroupId = "";
      state.groupFocusVideoId = "";
      state.selectedGroupIds.clear();
      state.selectedGroupMemberIds.clear();
      context.render();
      context.showToast("Removed the manual grouping correction.");
    }

    function openSelectedGroupInTriage() {
      const group = getSelectedGroup();
      if (!group) return;
      const videoIds = group.members.map(video => video.videoId).filter(Boolean);
      context.navigateToTriageFromInsights({ videoIds });
      context.showToast(`Selected ${videoIds.length} videos from “${group.label}”.`);
    }

    function applySelectedGroupStatus(status) {
      const group = getSelectedGroup();
      if (!guardGroupAction(group)) return;
      const plan = createGroupDecisionPlan(group, { status }, getStatus);
      if (!plan.changedIds.length) {
        context.showToast(`Every video in this group is already ${status}.`);
        return;
      }
      if (status === "delete" && !confirmDeletePlan(group, plan)) return;
      commitGroupPlan(
        group,
        plan,
        `${group.label}: ${plan.changedIds.length} group members → ${status}`,
        `Marked ${plan.changedIds.length} group members as ${status}.`,
      );
    }

    function applySelectedGroupWinner(strategy) {
      const group = getSelectedGroup();
      if (!guardGroupAction(group)) return;
      const winner = chooseGroupWinner(group, strategy);
      const metric = strategy === "newest"
        ? "upload age"
        : strategy === "earliest-episode"
          ? "episode number"
          : "view count";
      if (!winner) {
        context.showToast(`This group has no usable ${metric} data.`);
        return;
      }
      const plan = createGroupDecisionPlan(group, { winnerId: winner.videoId }, getStatus);
      if (!plan.changedIds.length) {
        context.showToast("This recommendation is already applied.");
        return;
      }

      const protectedWarning = getProtectedWarning(plan.changedDeleteIds);
      const strategyLabel = strategy === "newest"
        ? "newest"
        : strategy === "earliest-episode"
          ? "earliest episode"
          : "most viewed";
      const ok = context.window.confirm([
        `Keep only the ${strategyLabel} video in “${group.label}”?`,
        "",
        `Keep: ${winner.title || winner.videoId}`,
        `Mark delete: ${plan.deleteIds.length} other group members.${protectedWarning}`,
        "",
        "A local undo snapshot will be created.",
      ].join("\n"));
      if (!ok) return;

      commitGroupPlan(
        group,
        plan,
        `${group.label}: kept ${strategyLabel}, deleted ${plan.deleteIds.length}`,
        `Kept “${winner.title || winner.videoId}” and marked ${plan.deleteIds.length} group members delete.`,
        winner.videoId,
      );
    }

    function guardGroupAction(group) {
      if (!group) return false;
      if (isGroupActionEnabled(group)) return true;
      context.showToast("Confirm this review group before applying bulk decisions.");
      return false;
    }

    function confirmDeletePlan(group, plan) {
      const warning = getProtectedWarning(plan.changedDeleteIds);
      return context.window.confirm(
        `Mark all ${plan.changedIds.length} pending members of “${group.label}” as delete?${warning}\n\nA local undo snapshot will be created.`,
      );
    }

    function getProtectedWarning(videoIds) {
      const matches = getProtectedChannelMatches(state.videos, videoIds, state.channelRules);
      if (!matches.length) return "";
      const channels = Array.from(new Set(matches.map(match => match.channel)));
      return `\n\nWarning: ${matches.length} videos that would be marked delete belong to protected channels: ${channels.join(", ")}.`;
    }

    function commitGroupPlan(group, plan, description, toastMessage, currentId = "") {
      if (!context.addHistoryEntry(description, "group-decision", plan.changedIds)) {
        context.showToast("Group change cancelled because the local safety snapshot could not be saved.");
        return;
      }
      state.decisions = applyDecisionPlan(state.decisions, plan);
      state.selectedIds.clear();
      state.currentId = currentId || plan.changedIds[0] || state.currentId;
      context.saveDecisions();
      context.render();
      context.showToast(toastMessage);
    }

    function createMemberRow(video, parsed) {
      const row = documentRef.createElement("article");
      row.className = "groups-member-row";
      row.dataset.videoId = video.videoId;

      const index = documentRef.createElement("span");
      index.className = "playlist-index";
      index.textContent = `#${video.index || video.playlistIndex || "?"}`;

      const content = documentRef.createElement("div");
      content.className = "groups-member-content";
      const title = documentRef.createElement("a");
      title.href = video.cleanUrl || video.url || "#";
      title.target = "_blank";
      title.rel = "noreferrer";
      title.textContent = video.title || "(untitled)";
      const meta = documentRef.createElement("span");
      meta.textContent = [video.channel, video.uploaded, video.duration, video.views]
        .filter(Boolean)
        .join(" \u00b7 ");
      content.append(title, meta);

      const sequenceLabel = formatSequence(parsed?.sequence);
      const sequence = documentRef.createElement("span");
      sequence.className = "group-sequence-badge";
      sequence.textContent = sequenceLabel || "No S/E";
      sequence.title = sequenceLabel
        ? `Parsed as ${sequenceLabel}`
        : "No season or episode marker was detected";

      const status = documentRef.createElement("span");
      const currentStatus = getStatus(video.videoId);
      status.className = `group-member-status is-${currentStatus}`;
      status.textContent = currentStatus;
      const selection = documentRef.createElement("input");
      selection.type = "checkbox";
      selection.className = "group-member-select";
      selection.checked = state.selectedGroupMemberIds.has(video.videoId);
      selection.setAttribute("aria-label", `Select ${video.title || video.videoId} for manual split`);
      selection.addEventListener("change", () => {
        if (selection.checked) state.selectedGroupMemberIds.add(video.videoId);
        else state.selectedGroupMemberIds.delete(video.videoId);
        renderGroupDetail(getSelectedGroup());
      });
      row.append(selection, index, content, sequence, status);
      return row;
    }

    return Object.freeze({
      initializeGroupsView,
      renderGroups,
      clearFilters,
      getAllGroups,
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.ui ||= {};
  app.ui.groupsView = Object.freeze({
    GROUP_TYPES,
    GROUP_PAGE_SIZE,
    normalizeSearchText,
    getGroupChannels,
    getGroupConfidenceKind,
    getGroupStatuses,
    matchesGroupStatus,
    filterVideoGroups,
    formatSequence,
    formatConfidence,
    createGroupsViewUi,
  });
})(globalThis);
