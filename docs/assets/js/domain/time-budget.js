(function registerDomainModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};
    const { normalizeDecision, normalizeTags } = app.domain.decisions;
    const { finiteNumberOrNull } = app.domain.filters;

    function normalizeTimeBudgetHours(value) {
      const hours = Number(value);
      if (!Number.isFinite(hours) || hours <= 0) return 2;
      return Math.min(168, Math.max(0.25, Math.round(hours * 4) / 4));
    }

    function getMappedDecision(decisions, videoId) {
      return normalizeDecision(decisions?.[videoId] || {});
    }

    function calculateDurationStats(videos, decisions) {
      const summary = {
        totalCount: 0,
        knownCount: 0,
        unknownCount: 0,
        totalSeconds: 0,
        decidedCount: 0,
        decidedSeconds: 0,
        protectedSeconds: 0,
        byStatus: {},
        byChannel: {},
        byTag: {},
      };

      for (const video of Array.isArray(videos) ? videos : []) {
        if (!video?.videoId) continue;
        summary.totalCount++;
        const decision = getMappedDecision(decisions, video.videoId);
        const status = decision.status;
        const seconds = finiteNumberOrNull(video.durationSeconds);
        if (status !== "unreviewed") summary.decidedCount++;
        if (seconds === null || seconds < 0) {
          summary.unknownCount++;
          continue;
        }

        summary.knownCount++;
        summary.totalSeconds += seconds;
        if (status !== "unreviewed") summary.decidedSeconds += seconds;
        if (status === "keep" || status === "maybe") summary.protectedSeconds += seconds;
        addDurationGroup(summary.byStatus, status, seconds);
        addDurationGroup(summary.byChannel, String(video.channel || "(unknown)"), seconds);
        const tags = Array.from(new Set([
          ...normalizeTags(video.suggestedTags),
          ...normalizeTags(decision.tags),
        ]));
        tags.forEach(tag => addDurationGroup(summary.byTag, tag, seconds));
      }

      return summary;
    }

    function addDurationGroup(groups, name, seconds) {
      if (!groups[name]) groups[name] = { count: 0, seconds: 0 };
      groups[name].count++;
      groups[name].seconds += seconds;
    }

    function getSortedDurationGroups(groups) {
      return Object.entries(groups || {})
        .map(([name, value]) => ({ name, count: value.count, seconds: value.seconds }))
        .sort((a, b) => b.seconds - a.seconds || b.count - a.count || a.name.localeCompare(b.name));
    }

    function buildTimeBudgetShortlist(videos, decisions, budgetSeconds) {
      const budget = Math.max(0, Number(budgetSeconds) || 0);
      const priorities = { keep: 0, maybe: 1, unreviewed: 2 };
      const candidates = (Array.isArray(videos) ? videos : [])
        .map((video, order) => ({
          video,
          order,
          status: getMappedDecision(decisions, video?.videoId).status,
          seconds: finiteNumberOrNull(video?.durationSeconds),
        }))
        .filter(item => item.video?.videoId
          && item.seconds !== null
          && item.seconds > 0
          && !item.video.isUnavailable
          && item.status !== "delete")
        .sort((a, b) => (priorities[a.status] ?? 3) - (priorities[b.status] ?? 3)
          || a.seconds - b.seconds
          || a.order - b.order);
      const selected = [];
      let totalSeconds = 0;
      for (const candidate of candidates) {
        if (totalSeconds + candidate.seconds > budget) continue;
        selected.push(candidate.video);
        totalSeconds += candidate.seconds;
      }
      return { videos: selected, totalSeconds, budgetSeconds: budget };
    }

    function formatDuration(seconds) {
      const totalMinutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor((totalMinutes % 1440) / 60);
      const minutes = totalMinutes % 60;
      if (days) return `${days}d ${hours}h`;
      if (hours) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }

  app.domain.timeBudget = Object.freeze({
      normalizeTimeBudgetHours,
      getMappedDecision,
      calculateDurationStats,
      addDurationGroup,
      getSortedDurationGroups,
      buildTimeBudgetShortlist,
      formatDuration,
  });
})(globalThis);
