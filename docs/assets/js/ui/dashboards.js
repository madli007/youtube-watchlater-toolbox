(function registerDashboardsUi(root) {
  "use strict";

  function createDashboardsUi(context) {

    const {
      state,
      els,
      getMemoizedVideoGroups,
      chooseGroupWinner,
      getProtectedChannelMatches,
    } = context;
    const getFilteredVideos = (...args) => context.getFilteredVideos(...args);
    const getStatus = (...args) => context.getStatus(...args);
    const getDecision = (...args) => context.getDecision(...args);
    const setStatus = (...args) => context.setStatus(...args);
    const addHistoryEntry = (...args) => context.addHistoryEntry(...args);
    const saveDecisions = (...args) => context.saveDecisions(...args);
    const render = (...args) => context.render(...args);
    const showToast = (...args) => context.showToast(...args);
    const getActiveFilterSummary = (...args) => context.getActiveFilterSummary(...args);
    const getInboxIds = (...args) => context.getInboxIds(...args);
    const createChannelName = (...args) => context.createChannelName(...args);
    const createCount = (...args) => context.createCount(...args);
    const groupCounts = (...args) => context.groupCounts(...args);
    const handleFilterChange = (...args) => context.handleFilterChange(...args);
    const getTagCounts = (...args) => context.getTagCounts(...args);
    const getVideoTags = (...args) => context.getVideoTags(...args);
    const renderRuleSummary = (...args) => context.renderRuleSummary(...args);
    const renderChannelRuleSummary = (...args) => context.renderChannelRuleSummary(...args);
    const restoreHistoryEntry = (...args) => context.restoreHistoryEntry(...args);

    function getCurrentVideoGroups() {
      return getMemoizedVideoGroups(state.groupingCache, {
        videos: state.videos,
        datasetRevision: state.datasetRevision,
        overrides: state.groupingOverrides,
        overrideRevision: state.groupingOverrideRevision,
      });
    }

    function renderVideoGroups() {
      const sourceVideos = state.videos;
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
      els.groupSummary.textContent = sourceVideos.length
        ? `${allGroups.length} groups covering ${groupedIds.size} of ${sourceVideos.length} videos · ${typeCounts.series || 0} series · ${typeCounts.similar || 0} similar · ${typeCounts.duplicate || 0} probable duplicates.`
        : "Import videos or change filters to find local title patterns.";

      if (!groups.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = sourceVideos.length
          ? "No groups of this type were detected in the dataset."
          : "No videos to group.";
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

    function getImportAnchorSummary(importRecord) {
      if (!importRecord?.ageAnchorAt) return "";
      const formatted = new Date(importRecord.ageAnchorAt).toLocaleString();
      return importRecord.ageAnchorSource === "export"
        ? `Exported ${formatted}; export time is the age anchor.`
        : `Legacy array without export metadata; imported ${formatted}, and import time is the age anchor.`;
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

      els.clearFilters.disabled = getActiveFilterSummary().length === 0;
      [els.keepBulk, els.maybeBulk, els.deleteBulk, els.resetBulk, els.selectVisible, els.invertSelection, els.clearSelection, els.exportKeepMaybe, els.exportDeleteCandidates, els.exportTagged, els.exportVisible].forEach(button => {
        button.disabled = !state.videos.length;
      });
      els.exportSelected.disabled = !state.selectedIds.size;
      els.exportVisible.disabled = !visible;
      els.exportDecisions.disabled = !Object.keys(state.decisions).length;
      els.exportWorkspace.disabled = !state.videos.length && !Object.keys(state.decisions).length && !state.channelRules.length;
      context.syncUndoAvailability();
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
      const anchorSummary = getImportAnchorSummary(comparison.currentImport || state.lastImport);
      if (!comparison.baselineAvailable) {
        els.comparisonSummary.textContent = `No previous dataset was available. This import is now the local comparison baseline. ${anchorSummary}`.trim();
        return;
      }

      const previousName = comparison.previousImport?.fileName || "previous dataset";
      const currentIds = new Set(state.videos.map(video => video.videoId));
      const orphanedIds = Object.keys(state.decisions).filter(videoId => !currentIds.has(videoId));
      const summary = document.createElement("div");
      summary.textContent = `Compared with ${previousName}: ${comparison.newIds.length} new · ${comparison.removedVideos.length} no longer present · ${comparison.decidedIds.length} already decided · ${comparison.changedIds.length} metadata changed · ${orphanedIds.length} orphaned decisions. ${anchorSummary}`.trim();
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

    return Object.freeze({
      getCurrentVideoGroups,
      renderVideoGroups,
      createVideoGroupCard,
      createGroupActionButton,
      createGroupRecommendationButton,
      selectVideoGroup,
      applyVideoGroupStatus,
      applyGroupWinner,
      renderStats,
      countStatuses,
      getImportAnchorSummary,
      updateBulkLabels,
      renderImportComparison,
      renderSidebar,
      renderChannelList,
      renderTagSummary,
      renderHistory,
    });
  }

  const app = root.WatchLaterApp ||= {};
  app.ui ||= {};
  app.ui.dashboards = Object.freeze({
    createDashboardsUi,
  });
})(globalThis);
