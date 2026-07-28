(function registerDomainModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};
    const { normalizeDecision, normalizeTags } = app.domain.decisions;

    function videoMatchesFilters(video, decision, rawFilters) {
      const filters = normalizeFilterState(rawFilters);
      const suggestedTags = normalizeTags(video?.suggestedTags);
      const allTags = Array.from(new Set([...suggestedTags, ...normalizeTags(decision?.tags)]));
      const query = filters.search.toLowerCase();
      const searchText = [
        video?.searchText,
        video?.title,
        video?.channel,
        video?.views,
        video?.uploaded,
        video?.duration,
        allTags.join(" "),
        decision?.note,
      ].filter(Boolean).join(" ").toLowerCase();

      if (query && !searchText.includes(query)) return false;
      if (filters.status !== "all" && normalizeDecision(decision || {}).status !== filters.status) return false;
      if (filters.channels.length && !filters.channels.includes(String(video?.channel || "(unknown)"))) return false;
      if (filters.tags.length) {
        const matches = filters.tags.map(tag => allTags.includes(tag));
        if (filters.tagMode === "and" ? matches.some(match => !match) : !matches.some(Boolean)) return false;
      }

      const durationSeconds = finiteNumberOrNull(video?.durationSeconds);
      if (filters.minDurationMinutes !== "" && (durationSeconds === null || durationSeconds < Number(filters.minDurationMinutes) * 60)) return false;
      if (filters.maxDurationMinutes !== "" && (durationSeconds === null || durationSeconds > Number(filters.maxDurationMinutes) * 60)) return false;

      const ageDays = parseApproximateAgeDays(video?.uploaded);
      if (filters.minAgeDays !== "" && (ageDays === null || ageDays < Number(filters.minAgeDays))) return false;
      if (filters.maxAgeDays !== "" && (ageDays === null || ageDays > Number(filters.maxAgeDays))) return false;

      const viewCount = finiteNumberOrNull(video?.viewCountApprox) ?? parseApproximateViewCount(video?.views);
      if (filters.minViews !== "" && (viewCount === null || viewCount < Number(filters.minViews))) return false;
      if (filters.availability === "available" && video?.isUnavailable) return false;
      if (filters.availability === "unavailable" && !video?.isUnavailable) return false;

      const badges = normalizeTags(video?.badges);
      if (filters.badge === "any" && !badges.length) return false;
      if (filters.badge === "none" && badges.length) return false;
      if (filters.badge.startsWith("badge:") && !badges.includes(filters.badge.slice(6))) return false;
      if (filters.suggestedTag === "yes" && !suggestedTags.length) return false;
      if (filters.suggestedTag === "no" && suggestedTags.length) return false;
      const hasNote = Boolean(String(decision?.note || "").trim());
      if (filters.note === "yes" && !hasNote) return false;
      if (filters.note === "no" && hasNote) return false;
      return true;
    }

    function finiteNumberOrNull(value) {
      if (value === null || value === undefined || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }

    function parseApproximateAgeDays(value, now = Date.now()) {
      const text = String(value || "").trim().toLowerCase();
      if (!text) return null;
      if (/\b(today|danes|just now|zdaj)\b/.test(text)) return 0;
      if (/\b(yesterday|vceraj|v\u010Deraj)\b/.test(text)) return 1;

      const match = text.match(/(\d+(?:[.,]\d+)?)\s*([^\d\s]+)/u);
      if (match) {
        const amount = Number(match[1].replace(",", "."));
        const unit = match[2];
        const factors = [
          [/^(?:s|sec|secs|second|seconds|sekund)/, 1 / 86400],
          [/^(?:mo|month|months|mesec|mesece|mesecev)/, 30.4375],
          [/^(?:m|min|mins|minute|minutes|minut)/, 1 / 1440],
          [/^(?:h|hr|hrs|hour|hours|ur)/, 1 / 24],
          [/^(?:d|day|days|dan|dne|dnev)/, 1],
          [/^(?:w|week|weeks|teden|tedna|tednov)/, 7],
          [/^(?:y|yr|yrs|year|years|leto|leti|leta)/, 365.25],
        ];
        const factor = factors.find(([pattern]) => pattern.test(unit))?.[1];
        if (factor !== undefined) return amount * factor;
      }

      const timestamp = Date.parse(value);
      if (!Number.isFinite(timestamp)) return null;
      return Math.max(0, (now - timestamp) / 86400000);
    }

    function parseApproximateViewCount(value) {
      const text = String(value || "").trim().toLowerCase();
      const numberText = text.match(/[\d.,]+/)?.[0];
      if (!numberText) return null;
      const normalized = numberText.includes(",") && numberText.includes(".")
        ? numberText.replace(/\./g, "").replace(",", ".")
        : numberText.replace(",", ".");
      const number = Number(normalized);
      if (!Number.isFinite(number)) return null;
      if (/(?:tis|k)\b/.test(text)) return Math.round(number * 1000);
      if (/(?:mio|m|million|millions)\b/.test(text)) return Math.round(number * 1000000);
      if (/(?:billion|billions|b)\b/.test(text)) return Math.round(number * 1000000000);
      return Math.round(number);
    }

    function normalizeFilterState(value) {
      const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const numberInput = input => {
        if (input === "" || input === null || input === undefined) return "";
        const number = Number(input);
        return Number.isFinite(number) && number >= 0 ? String(number) : "";
      };
      return {
        search: typeof source.search === "string" ? source.search : "",
        status: ["all", "unreviewed", "keep", "maybe", "delete"].includes(source.status) ? source.status : "all",
        channels: normalizeTags(source.channels || (source.channel && source.channel !== "all" ? [source.channel] : [])),
        tags: normalizeTags(source.tags || (source.tag && source.tag !== "all" ? [source.tag] : [])),
        tagMode: source.tagMode === "and" ? "and" : "or",
        sort: ["index", "index-desc", "channel", "duration-desc", "views-desc", "title"].includes(source.sort) ? source.sort : "index",
        datasetView: ["all", "inbox", "new", "changed", "decided"].includes(source.datasetView) ? source.datasetView : "all",
        minDurationMinutes: numberInput(source.minDurationMinutes),
        maxDurationMinutes: numberInput(source.maxDurationMinutes),
        minAgeDays: numberInput(source.minAgeDays),
        maxAgeDays: numberInput(source.maxAgeDays),
        minViews: numberInput(source.minViews),
        availability: ["all", "available", "unavailable"].includes(source.availability) ? source.availability : "all",
        badge: typeof source.badge === "string" && (source.badge === "all" || source.badge === "any" || source.badge === "none" || source.badge.startsWith("badge:"))
          ? source.badge
          : "all",
        suggestedTag: ["all", "yes", "no"].includes(source.suggestedTag) ? source.suggestedTag : "all",
        note: ["all", "yes", "no"].includes(source.note) ? source.note : "all",
      };
    }

    function normalizeSavedViews(views) {
      if (!Array.isArray(views)) return [];
      const seen = new Set();
      return views
        .filter(view => view && typeof view === "object" && !Array.isArray(view))
        .map((view, index) => {
          const name = String(view.name || "").trim();
          const fallbackId = `saved-view-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "view"}`;
          return {
            id: String(view.id || fallbackId),
            name,
            filters: normalizeFilterState(view.filters),
            createdAt: typeof view.createdAt === "string" ? view.createdAt : "",
            updatedAt: typeof view.updatedAt === "string" ? view.updatedAt : "",
          };
        })
        .filter(view => view.name && !seen.has(view.id) && seen.add(view.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    function filterChannelOptions(channels, query) {
      if (!String(query || "").trim()) return channels;
      const normalizedQuery = normalizeSearchText(query);
      return channels
        .filter(item => channelMatchesQuery(item.name, query))
        .sort((a, b) => {
          const exactDifference = Number(normalizeSearchText(b.name) === normalizedQuery)
            - Number(normalizeSearchText(a.name) === normalizedQuery);
          return exactDifference || b.count - a.count || a.name.localeCompare(b.name);
        });
    }

    function getChannelOptionPage(channels, query, limit = 24) {
      const matches = filterChannelOptions(channels, query);
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 24;
      return {
        totalCount: matches.length,
        options: matches.slice(0, safeLimit),
      };
    }

    function channelMatchesQuery(channel, query) {
      const normalizedChannel = normalizeSearchText(channel);
      const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
      return tokens.every(token => normalizedChannel.includes(token));
    }

    function normalizeSearchText(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    }

  app.domain.filters = Object.freeze({
      videoMatchesFilters,
      finiteNumberOrNull,
      parseApproximateAgeDays,
      parseApproximateViewCount,
      normalizeFilterState,
      normalizeSavedViews,
      filterChannelOptions,
      getChannelOptionPage,
      channelMatchesQuery,
      normalizeSearchText,
  });
})(globalThis);
