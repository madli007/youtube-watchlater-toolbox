(function registerDomainModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};
    const { MAX_HISTORY_ENTRIES } = app.config;

    function ruleMatchesVideo(video, rule) {
      const normalized = normalizeRule(rule);
      if (!normalized.positive.length) return false;
      const channel = String(video?.channel || "").trim().toLowerCase();
      if (normalized.channel && channel !== normalized.channel.toLowerCase()) return false;
      const haystack = [video?.title, video?.channel, video?.searchText]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const hasPositive = normalized.positive.some(keyword => haystack.includes(keyword.toLowerCase()));
      const hasNegative = normalized.negative.some(keyword => haystack.includes(keyword.toLowerCase()));
      return hasPositive && !hasNegative;
    }

    function updateDecisionDetails(decisions, videoId, tags, note, updatedAt = new Date().toISOString()) {
      const current = normalizeDecision(decisions[videoId] || {});
      const next = {
        ...current,
        tags: normalizeTags(tags),
        note: String(note || "").trim(),
        updatedAt,
      };
      if (next.status === "unreviewed" && !next.tags.length && !next.note) delete decisions[videoId];
      else decisions[videoId] = next;
      return next;
    }

    function normalizeUserRules(rules) {
      if (!rules || typeof rules !== "object" || Array.isArray(rules)) return {};
      const normalized = {};
      for (const [name, rule] of Object.entries(rules)) {
        const cleanName = String(name || "").trim();
        if (!cleanName || (!Array.isArray(rule) && (!rule || typeof rule !== "object"))) continue;
        const cleanRule = normalizeRule(rule);
        if (!cleanRule.positive.length) continue;
        normalized[cleanName] = cleanRule;
      }
      return normalized;
    }

    function normalizeRule(rule) {
      if (Array.isArray(rule)) {
        return { positive: normalizeTags(rule), negative: [], channel: "" };
      }
      const source = rule && typeof rule === "object" && !Array.isArray(rule) ? rule : {};
      return {
        positive: normalizeTags(source.positive || source.keywords),
        negative: normalizeTags(source.negative),
        channel: typeof source.channel === "string" ? source.channel.trim() : "",
      };
    }

    function normalizeChannelRules(rules) {
      const source = Array.isArray(rules)
        ? rules
        : (rules && typeof rules === "object" ? Object.values(rules) : []);
      const byChannel = new Map();
      source.forEach((rule, index) => {
        const normalized = normalizeChannelRule(rule, index);
        if (normalized) byChannel.set(normalized.channel.toLowerCase(), normalized);
      });
      return Array.from(byChannel.values()).sort((a, b) => a.channel.localeCompare(b.channel));
    }

    function normalizeChannelRule(rule, index = 0) {
      if (!rule || typeof rule !== "object" || Array.isArray(rule)) return null;
      const channel = String(rule.channel || "").trim();
      if (!channel) return null;
      const validModes = new Set(["none", "default-keep", "default-review", "always-keep", "always-review"]);
      const mode = validModes.has(rule.mode) ? rule.mode : "none";
      const tag = normalizeTags([rule.tag || rule.defaultTag])[0] || "";
      return {
        id: String(rule.id || `channel-rule-${index}-${channel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "channel"}`),
        channel,
        mode,
        tag,
        protected: Boolean(rule.protected || mode === "always-keep"),
      };
    }

    function getChannelRuleDecision(decision, rule, updatedAt = new Date().toISOString()) {
      const current = normalizeDecision(decision || {});
      const normalizedRule = normalizeChannelRule(rule);
      if (!normalizedRule) return current;
      let status = current.status;
      if (normalizedRule.mode === "always-keep") status = "keep";
      if (normalizedRule.mode === "always-review") status = "maybe";
      if (normalizedRule.mode === "default-keep" && current.status === "unreviewed") status = "keep";
      if (normalizedRule.mode === "default-review" && current.status === "unreviewed") status = "maybe";
      const tags = normalizedRule.tag && !current.tags.includes(normalizedRule.tag)
        ? [...current.tags, normalizedRule.tag]
        : current.tags;
      if (status === current.status && tags === current.tags) return current;
      return { ...current, status, tags, updatedAt };
    }

    function getChannelRuleImpact(videos, decisions, rule) {
      const normalizedRule = normalizeChannelRule(rule);
      const impact = {
        matchCount: 0,
        statusChangeCount: 0,
        tagAdditionCount: 0,
        affectedIds: [],
      };
      if (!normalizedRule || !Array.isArray(videos)) return impact;
      const channel = normalizedRule.channel.toLowerCase();
      for (const video of videos) {
        if (!video?.videoId || String(video.channel || "").trim().toLowerCase() !== channel) continue;
        impact.matchCount++;
        const current = normalizeDecision(decisions?.[video.videoId] || {});
        const next = getChannelRuleDecision(current, normalizedRule, "preview");
        const statusChanged = current.status !== next.status;
        const tagAdded = next.tags.length > current.tags.length;
        if (statusChanged) impact.statusChangeCount++;
        if (tagAdded) impact.tagAdditionCount++;
        if (statusChanged || tagAdded) impact.affectedIds.push(video.videoId);
      }
      return impact;
    }

    function getCombinedChannelRuleImpact(videos, decisions, rules) {
      const combined = {
        matchCount: 0,
        statusChangeCount: 0,
        tagAdditionCount: 0,
        affectedIds: [],
      };
      const affectedIds = new Set();
      for (const rule of normalizeChannelRules(rules)) {
        const impact = getChannelRuleImpact(videos, decisions, rule);
        combined.matchCount += impact.matchCount;
        combined.statusChangeCount += impact.statusChangeCount;
        combined.tagAdditionCount += impact.tagAdditionCount;
        impact.affectedIds.forEach(videoId => affectedIds.add(videoId));
      }
      combined.affectedIds = Array.from(affectedIds);
      return combined;
    }

    function getProtectedChannelMatches(videos, videoIds, rules) {
      const protectedChannels = new Set(normalizeChannelRules(rules)
        .filter(rule => rule.protected)
        .map(rule => rule.channel.toLowerCase()));
      if (!protectedChannels.size) return [];
      const scopedIds = new Set(videoIds || []);
      return (Array.isArray(videos) ? videos : [])
        .filter(video => scopedIds.has(video.videoId) && protectedChannels.has(String(video.channel || "").trim().toLowerCase()))
        .map(video => ({ videoId: video.videoId, channel: String(video.channel || "").trim() }));
    }

    function splitInputValues(value) {
      return normalizeTags(String(value || "").split(/[,\n]+/));
    }

    function parseDecisionsPayload(payload) {
      if (!payload || typeof payload !== "object") {
        throw new Error("Expected a decisions export JSON object.");
      }

      const decisions = payload.decisions || payload;
      if (!decisions || typeof decisions !== "object" || Array.isArray(decisions)) {
        throw new Error("Expected a decisions map keyed by videoId.");
      }

      return getPortableDecisions(decisions);
    }

    function previewDecisionsMerge(incoming, current) {
      const merged = { ...current };
      const stats = {
        newCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        conflictCount: 0,
        merged,
      };

      for (const [videoId, incomingDecision] of Object.entries(incoming)) {
        const currentDecision = current[videoId] ? normalizeDecision(current[videoId]) : null;

        if (!currentDecision) {
          merged[videoId] = incomingDecision;
          stats.newCount++;
          continue;
        }

        const differs = !areDecisionsEqual(incomingDecision, currentDecision);
        if (differs) stats.conflictCount++;

        const incomingTime = getDecisionTime(incomingDecision);
        const currentTime = getDecisionTime(currentDecision);
        if (incomingTime > currentTime) {
          merged[videoId] = incomingDecision;
          stats.updatedCount++;
        } else {
          merged[videoId] = currentDecision;
          stats.skippedCount++;
        }
      }

      return stats;
    }

    function getPortableDecisions(decisions) {
      const portable = {};
      for (const [videoId, decision] of Object.entries(decisions || {})) {
        if (!videoId || !decision || typeof decision !== "object") continue;
        const normalized = normalizeDecision(decision);
        if (normalized.status === "unreviewed" && !normalized.tags.length && !normalized.note.trim()) continue;
        portable[videoId] = normalized;
      }
      return portable;
    }

    function normalizeDecision(decision) {
      const validStatuses = new Set(["keep", "maybe", "delete", "archive", "unreviewed"]);
      const status = validStatuses.has(decision.status) ? decision.status : "unreviewed";
      return {
        status,
        tags: normalizeTags(decision.tags),
        note: typeof decision.note === "string" ? decision.note : "",
        updatedAt: typeof decision.updatedAt === "string" ? decision.updatedAt : "",
      };
    }

    function normalizeTags(tags) {
      if (!Array.isArray(tags)) return [];
      return Array.from(new Set(tags
        .map(tag => String(tag || "").trim())
        .filter(Boolean)));
    }

    function areDecisionsEqual(a, b) {
      return JSON.stringify(normalizeDecision(a)) === JSON.stringify(normalizeDecision(b));
    }

    function getDecisionTime(decision) {
      const time = Date.parse(decision.updatedAt || "");
      return Number.isFinite(time) ? time : 0;
    }

    function createHistoryEntry(description, action, beforeDecisions, createdAt = new Date().toISOString(), id = "") {
      const normalizedDecisions = normalizeBeforeDecisions(beforeDecisions);
      return {
        id: id || createSnapshotId(),
        createdAt,
        description: String(description || "Workspace change"),
        action: String(action || "change"),
        affectedCount: Object.keys(normalizedDecisions).length,
        beforeDecisions: normalizedDecisions,
      };
    }

    function createSnapshotId() {
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
      return `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function normalizeBeforeDecisions(decisions) {
      const normalized = {};
      if (!decisions || typeof decisions !== "object" || Array.isArray(decisions)) return normalized;
      for (const [videoId, decision] of Object.entries(decisions)) {
        if (!videoId) continue;
        normalized[videoId] = decision === null ? null : normalizeDecision(decision);
      }
      return normalized;
    }

    function normalizeHistory(history) {
      if (!Array.isArray(history)) return [];
      return history
        .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
        .map(entry => createHistoryEntry(
          entry.description,
          entry.action,
          entry.beforeDecisions,
          typeof entry.createdAt === "string" ? entry.createdAt : "",
          typeof entry.id === "string" ? entry.id : "",
        ))
        .filter(entry => Object.keys(entry.beforeDecisions).length)
        .slice(0, MAX_HISTORY_ENTRIES);
    }

    function mergeHistoryEntries(history) {
      const seen = new Set();
      const merged = [];
      for (const entry of normalizeHistory(history)) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        merged.push(entry);
        if (merged.length >= MAX_HISTORY_ENTRIES) break;
      }
      return merged;
    }

    function applyHistoryEntry(decisions, entry) {
      const restored = { ...getPortableDecisions(decisions) };
      for (const [videoId, previousDecision] of Object.entries(entry.beforeDecisions || {})) {
        if (previousDecision === null) delete restored[videoId];
        else restored[videoId] = normalizeDecision(previousDecision);
      }
      return restored;
    }

  app.domain.decisions = Object.freeze({
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
      getDecisionTime,
      createHistoryEntry,
      createSnapshotId,
      normalizeBeforeDecisions,
      normalizeHistory,
      mergeHistoryEntries,
      applyHistoryEntry,
  });
})(globalThis);
