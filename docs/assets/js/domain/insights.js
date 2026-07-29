(function registerInsightsDomainModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};

  const { normalizeDecision } = app.domain.decisions;
  const {
    finiteNumberOrNull,
    normalizeSearchText,
    parseApproximateAgeDays,
    parseApproximateViewCount,
  } = app.domain.filters;

  const DAY_MILLISECONDS = 86400000;
  const AGE_BUCKET_KEYS = Object.freeze([
    "0-7d",
    "8-30d",
    "1-3m",
    "3-6m",
    "6-12m",
    "1y+",
    "unknown",
  ]);
  const STATUS_KEYS = Object.freeze([
    "keep",
    "maybe",
    "delete",
    "unreviewed",
    "archive",
  ]);

  function createStatusCounts() {
    return Object.fromEntries(STATUS_KEYS.map(status => [status, 0]));
  }

  function createAgeBuckets() {
    return Object.fromEntries(AGE_BUCKET_KEYS.map(key => [
      key,
      { count: 0, durationSeconds: 0, knownDurationCount: 0 },
    ]));
  }

  function getAgeBucket(ageDays) {
    const age = finiteNumberOrNull(ageDays);
    if (age === null || age < 0) return "unknown";
    if (age < 8) return "0-7d";
    if (age < 31) return "8-30d";
    if (age < 91) return "1-3m";
    if (age < 183) return "3-6m";
    if (age < 366) return "6-12m";
    return "1y+";
  }

  function normalizeIdentityText(value) {
    return normalizeSearchText(value).replace(/\s+/g, " ");
  }

  function normalizeChannelUrlPart(value) {
    let normalized = String(value || "").trim();
    if (!normalized) return "";

    normalized = normalized
      .replace(/^[a-z][a-z\d+.-]*:\/\/(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)\//i, "")
      .replace(/^\/\/(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)\//i, "")
      .replace(/^(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)\//i, "")
      .replace(/[?#].*$/, "")
      .replace(/^\/+|\/+$/g, "");

    if (!normalized) return "";
    const parts = normalized.split("/").filter(Boolean);
    const firstPart = parts[0] || "";
    const canonicalParts = firstPart.startsWith("@")
      ? [firstPart]
      : /^(?:channel|c|user)$/i.test(firstPart) && parts[1]
        ? [firstPart, parts[1]]
        : parts;

    return normalizeIdentityText(canonicalParts.join("/"));
  }

  function getChannelKey(channelUrl, channelName) {
    const canonicalUrlPart = normalizeChannelUrlPart(channelUrl);
    if (canonicalUrlPart) return `url:${canonicalUrlPart}`;
    return `name:${normalizeIdentityText(channelName) || "(unknown)"}`;
  }

  function getTimestamp(value) {
    if (value instanceof Date) {
      const timestamp = value.getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    }
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function getAgeAnchor(importContext, nowTimestamp) {
    const context = importContext && typeof importContext === "object"
      ? importContext
      : {};
    return getTimestamp(context.sourceExportedAt)
      ?? getTimestamp(context.exportedAt)
      ?? getTimestamp(context.ageAnchorAt)
      ?? getTimestamp(context.importedAt)
      ?? nowTimestamp;
  }

  function getNewVideoIds(importContext) {
    const context = importContext && typeof importContext === "object"
      ? importContext
      : {};
    const values = context.newIds ?? context.importComparison?.newIds;
    return new Set(Array.isArray(values) || values instanceof Set ? values : []);
  }

  function deriveVideoFacts(videos, decisions = {}, importContext = {}, now = Date.now()) {
    const nowTimestamp = getTimestamp(now) ?? Date.now();
    const ageAnchor = getAgeAnchor(importContext, nowTimestamp);
    const newVideoIds = getNewVideoIds(importContext);
    const facts = [];

    for (const video of Array.isArray(videos) ? videos : []) {
      const videoId = String(video?.videoId || "").trim();
      if (!videoId) continue;

      const decision = normalizeDecision(decisions?.[videoId] || {});
      const channelName = String(video.channel || "").trim() || "(unknown)";
      const channelUrl = String(video.channelUrl || "").trim();
      const durationValue = finiteNumberOrNull(video.durationSeconds);
      const durationSeconds = durationValue !== null && durationValue >= 0
        ? durationValue
        : null;
      const ageAtAnchor = parseApproximateAgeDays(video.uploaded, ageAnchor);
      const approxPublishedTimestamp = ageAtAnchor === null
        ? null
        : ageAnchor - Math.max(0, ageAtAnchor) * DAY_MILLISECONDS;
      const ageDays = approxPublishedTimestamp === null
        ? null
        : Math.max(0, (nowTimestamp - approxPublishedTimestamp) / DAY_MILLISECONDS);
      const directViewCount = finiteNumberOrNull(video.viewCountApprox);

      facts.push({
        videoId,
        channelKey: getChannelKey(channelUrl, channelName),
        channelName,
        channelUrl,
        status: decision.status,
        durationSeconds,
        ageDays,
        ageBucket: getAgeBucket(ageDays),
        approxPublishedAt: approxPublishedTimestamp === null
          ? null
          : new Date(approxPublishedTimestamp).toISOString(),
        viewCountApprox: directViewCount !== null && directViewCount >= 0
          ? directViewCount
          : parseApproximateViewCount(video.views),
        isUnavailable: Boolean(video.isUnavailable),
        isUntouched: decision.status === "unreviewed",
        isNewSinceLastImport: newVideoIds.has(videoId),
        decisionUpdatedAt: decision.updatedAt,
      });
    }

    return facts;
  }

  function addToBucket(buckets, fact) {
    const bucket = buckets[fact.ageBucket] || buckets.unknown;
    bucket.count++;
    if (fact.durationSeconds !== null) {
      bucket.knownDurationCount++;
      bucket.durationSeconds += fact.durationSeconds;
    }
  }

  function addNameVote(votes, value, order) {
    const current = votes.get(value);
    if (current) {
      current.count++;
      return;
    }
    votes.set(value, { count: 1, order });
  }

  function selectMostFrequent(votes, fallback = "") {
    let selected = fallback;
    let selectedCount = -1;
    let selectedOrder = Number.POSITIVE_INFINITY;
    for (const [value, vote] of votes) {
      if (vote.count > selectedCount
        || (vote.count === selectedCount && vote.order < selectedOrder)) {
        selected = value;
        selectedCount = vote.count;
        selectedOrder = vote.order;
      }
    }
    return selected;
  }

  function createChannelAccumulator(fact) {
    return {
      channelKey: fact.channelKey,
      channelName: fact.channelName,
      channelUrl: fact.channelUrl,
      totalCount: 0,
      knownDurationCount: 0,
      totalDurationSeconds: 0,
      knownAgeCount: 0,
      averageAgeDays: null,
      oldestAgeDays: null,
      oldestUntouchedCount: 0,
      statusCounts: createStatusCounts(),
      ageBuckets: createAgeBuckets(),
      newSinceLastImportCount: 0,
      persistence: null,
      ageDaysTotal: 0,
      nameVotes: new Map(),
      urlVotes: new Map(),
    };
  }

  function addFactToChannel(channel, fact, order) {
    channel.totalCount++;
    channel.statusCounts[fact.status]++;
    addToBucket(channel.ageBuckets, fact);
    addNameVote(channel.nameVotes, fact.channelName, order);
    if (fact.channelUrl) addNameVote(channel.urlVotes, fact.channelUrl, order);
    if (fact.isUntouched) channel.oldestUntouchedCount++;
    if (fact.isNewSinceLastImport) channel.newSinceLastImportCount++;
    if (fact.durationSeconds !== null) {
      channel.knownDurationCount++;
      channel.totalDurationSeconds += fact.durationSeconds;
    }
    if (fact.ageDays !== null) {
      channel.knownAgeCount++;
      channel.ageDaysTotal += fact.ageDays;
      channel.oldestAgeDays = channel.oldestAgeDays === null
        ? fact.ageDays
        : Math.max(channel.oldestAgeDays, fact.ageDays);
    }
  }

  function finishChannel(channel) {
    channel.channelName = selectMostFrequent(channel.nameVotes, channel.channelName);
    channel.channelUrl = selectMostFrequent(channel.urlVotes, channel.channelUrl);
    channel.averageAgeDays = channel.knownAgeCount
      ? channel.ageDaysTotal / channel.knownAgeCount
      : null;
    delete channel.ageDaysTotal;
    delete channel.nameVotes;
    delete channel.urlVotes;
    return channel;
  }

  function percent(numerator, denominator) {
    return denominator ? numerator / denominator * 100 : 0;
  }

  function normalizeInsightStatuses(options) {
    const values = options && typeof options === "object" ? options.statuses : null;
    if (!Array.isArray(values)) return null;
    return new Set(values.filter(status => STATUS_KEYS.includes(status)));
  }

  function createEmptyInsightsModel() {
    return {
      channelCount: 0,
      videoCount: 0,
      totalDurationSeconds: 0,
      knownDurationCount: 0,
      knownAgeCount: 0,
      averageAgeDays: null,
      oldestVideo: null,
      statusCounts: createStatusCounts(),
      ageBuckets: createAgeBuckets(),
      channels: [],
      coverage: {
        durationPercent: 0,
        agePercent: 0,
        channelIdentityPercent: 0,
      },
    };
  }

  function buildChannelInsights(videoFacts, options = {}) {
    const model = createEmptyInsightsModel();
    const allowedStatuses = normalizeInsightStatuses(options);
    const channelsByKey = new Map();
    let ageDaysTotal = 0;
    let canonicalChannelIdentityCount = 0;

    for (const [order, fact] of (Array.isArray(videoFacts) ? videoFacts : []).entries()) {
      if (!fact?.videoId || !STATUS_KEYS.includes(fact.status)) continue;
      if (allowedStatuses && !allowedStatuses.has(fact.status)) continue;

      model.videoCount++;
      model.statusCounts[fact.status]++;
      addToBucket(model.ageBuckets, fact);
      if (fact.channelKey.startsWith("url:")) canonicalChannelIdentityCount++;
      if (fact.durationSeconds !== null) {
        model.knownDurationCount++;
        model.totalDurationSeconds += fact.durationSeconds;
      }
      if (fact.ageDays !== null) {
        model.knownAgeCount++;
        ageDaysTotal += fact.ageDays;
        if (model.oldestVideo === null || fact.ageDays > model.oldestVideo.ageDays) {
          model.oldestVideo = fact;
        }
      }

      let channel = channelsByKey.get(fact.channelKey);
      if (!channel) {
        channel = createChannelAccumulator(fact);
        channelsByKey.set(fact.channelKey, channel);
      }
      addFactToChannel(channel, fact, order);
    }

    model.channels = Array.from(channelsByKey.values(), finishChannel)
      .sort((left, right) => right.totalCount - left.totalCount
        || left.channelName.localeCompare(right.channelName)
        || left.channelKey.localeCompare(right.channelKey));
    model.channelCount = model.channels.length;
    model.averageAgeDays = model.knownAgeCount
      ? ageDaysTotal / model.knownAgeCount
      : null;
    model.coverage.durationPercent = percent(model.knownDurationCount, model.videoCount);
    model.coverage.agePercent = percent(model.knownAgeCount, model.videoCount);
    model.coverage.channelIdentityPercent = percent(
      canonicalChannelIdentityCount,
      model.videoCount,
    );
    return model;
  }

  function createEmptyInsightsCache() {
    return {
      datasetRevision: -1,
      decisionRevision: -1,
      videoFacts: [],
      model: createEmptyInsightsModel(),
    };
  }

  app.domain.insights = Object.freeze({
    AGE_BUCKET_KEYS,
    STATUS_KEYS,
    getAgeBucket,
    getChannelKey,
    deriveVideoFacts,
    buildChannelInsights,
    createEmptyInsightsModel,
    createEmptyInsightsCache,
  });
})(globalThis);
