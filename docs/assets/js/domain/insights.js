(function registerInsightsDomainModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};

  const { normalizeDecision } = app.domain.decisions;
  const {
    finiteNumberOrNull,
    getApproximateAgeBucket,
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
  const INSIGHTS_MEASURES = Object.freeze(["count", "watch-time"]);
  const INSIGHTS_SORTS = Object.freeze([
    "backlog",
    "undecided",
    "watch-time",
    "channel",
  ]);
  const DEFAULT_CHANNEL_LIMIT = 100;
  const DEFAULT_DECISION_STALE_DAYS = 180;
  const MAX_DECISION_STALE_DAYS = 3650;

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
    return getApproximateAgeBucket(ageDays);
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

  function normalizeDecisionStaleDays(value) {
    if (String(value || "").toLowerCase() === "off") return "off";
    if (value === undefined || value === null || value === "") {
      return DEFAULT_DECISION_STALE_DAYS;
    }
    const days = Number(value);
    if (!Number.isFinite(days) || days <= 0) return DEFAULT_DECISION_STALE_DAYS;
    return Math.min(MAX_DECISION_STALE_DAYS, Math.max(1, Math.round(days)));
  }

  function normalizeInsightsSettings(value) {
    const settings = value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
    return {
      decisionStaleDays: normalizeDecisionStaleDays(settings.decisionStaleDays),
    };
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
        title: String(video.title || "").trim() || "Untitled video",
        url: String(video.cleanUrl || video.url || "").trim(),
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

  function normalizeInsightsMeasure(value) {
    return INSIGHTS_MEASURES.includes(value) ? value : "count";
  }

  function normalizeInsightsSort(value) {
    return INSIGHTS_SORTS.includes(value) ? value : "backlog";
  }

  function getChannelSearchText(channel) {
    return normalizeSearchText([
      channel?.channelName,
      channel?.channelUrl,
      channel?.channelKey,
    ].filter(Boolean).join(" "));
  }

  function compareChannels(left, right, sort) {
    if (sort === "channel") {
      return left.channelName.localeCompare(right.channelName)
        || left.channelKey.localeCompare(right.channelKey);
    }
    if (sort === "watch-time") {
      return right.totalDurationSeconds - left.totalDurationSeconds
        || right.knownDurationCount - left.knownDurationCount
        || right.totalCount - left.totalCount
        || left.channelName.localeCompare(right.channelName);
    }
    if (sort === "undecided") {
      return right.statusCounts.unreviewed - left.statusCounts.unreviewed
        || right.totalCount - left.totalCount
        || left.channelName.localeCompare(right.channelName);
    }
    return right.totalCount - left.totalCount
      || right.statusCounts.unreviewed - left.statusCounts.unreviewed
      || left.channelName.localeCompare(right.channelName)
      || left.channelKey.localeCompare(right.channelKey);
  }

  function getBucketScaleValue(bucket, measure) {
    return measure === "watch-time" ? bucket.durationSeconds : bucket.count;
  }

  function createMatrixRow(channel, measure) {
    let rowMaximum = 0;
    const cells = AGE_BUCKET_KEYS.map(key => {
      const bucket = channel.ageBuckets[key];
      const scaleValue = getBucketScaleValue(bucket, measure);
      rowMaximum = Math.max(rowMaximum, scaleValue);
      return {
        key,
        count: bucket.count,
        durationSeconds: bucket.durationSeconds,
        knownDurationCount: bucket.knownDurationCount,
        durationCoveragePercent: percent(bucket.knownDurationCount, bucket.count),
        scaleValue,
      };
    });

    return {
      channelKey: channel.channelKey,
      channelName: channel.channelName,
      channelUrl: channel.channelUrl,
      totalCount: channel.totalCount,
      knownDurationCount: channel.knownDurationCount,
      totalDurationSeconds: channel.totalDurationSeconds,
      durationCoveragePercent: percent(
        channel.knownDurationCount,
        channel.totalCount,
      ),
      undecidedCount: channel.statusCounts.unreviewed,
      statusCounts: channel.statusCounts,
      cells,
      rowMaximum,
    };
  }

  function buildChannelAgeMatrix(model, options = {}) {
    const channels = Array.isArray(model?.channels) ? model.channels : [];
    const measure = normalizeInsightsMeasure(options.measure);
    const sort = normalizeInsightsSort(options.sort);
    const search = normalizeSearchText(options.search);
    const requestedLimit = Number(options.limit);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? requestedLimit
      : DEFAULT_CHANNEL_LIMIT;
    const showAll = options.showAll === true;

    const backlogRanked = [...channels].sort((left, right) => (
      compareChannels(left, right, "backlog")
    ));
    const matchedChannels = search
      ? backlogRanked.filter(channel => getChannelSearchText(channel).includes(search))
      : backlogRanked;
    const limitedChannels = !search && !showAll
      ? matchedChannels.slice(0, limit)
      : matchedChannels;
    const sortedChannels = [...limitedChannels].sort((left, right) => (
      compareChannels(left, right, sort)
    ));
    const rows = sortedChannels.map(channel => createMatrixRow(channel, measure));
    const globalMaximum = rows.reduce((maximum, row) => (
      Math.max(maximum, ...row.cells.map(cell => cell.scaleValue))
    ), 0);

    return {
      measure,
      sort,
      search,
      rows,
      globalMaximum,
      channelCount: channels.length,
      matchedChannelCount: matchedChannels.length,
      visibleChannelCount: rows.length,
      isLimited: !search && !showAll && matchedChannels.length > limit,
      hiddenChannelCount: Math.max(0, matchedChannels.length - rows.length),
    };
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

  function createDetailVideo(fact) {
    return {
      videoId: fact.videoId,
      title: fact.title,
      url: fact.url,
      ageDays: fact.ageDays,
      ageBucket: fact.ageBucket,
      durationSeconds: fact.durationSeconds,
      status: fact.status,
      decisionUpdatedAt: fact.decisionUpdatedAt,
    };
  }

  function compareOldestFacts(left, right) {
    if (left.ageDays === null && right.ageDays !== null) return 1;
    if (left.ageDays !== null && right.ageDays === null) return -1;
    if (left.ageDays !== null && right.ageDays !== null) {
      return right.ageDays - left.ageDays;
    }
    return left.title.localeCompare(right.title)
      || left.videoId.localeCompare(right.videoId);
  }

  function buildChannelDetail(model, videoFacts, channelKey, options = {}) {
    const selectedChannel = (Array.isArray(model?.channels) ? model.channels : [])
      .find(channel => channel.channelKey === channelKey);
    if (!selectedChannel) return null;

    const settings = normalizeInsightsSettings(options);
    const nowTimestamp = getTimestamp(options.now) ?? Date.now();
    const staleDays = settings.decisionStaleDays;
    const staleCutoffTimestamp = staleDays === "off"
      ? null
      : nowTimestamp - staleDays * DAY_MILLISECONDS;
    const channelFacts = (Array.isArray(videoFacts) ? videoFacts : [])
      .filter(fact => fact?.channelKey === channelKey);
    const explicitlyDecided = channelFacts.filter(
      fact => fact.status !== "unreviewed",
    );
    const datedDecisions = explicitlyDecided
      .map(fact => ({
        fact,
        timestamp: getTimestamp(fact.decisionUpdatedAt),
      }))
      .filter(item => item.timestamp !== null);
    const staleCount = staleDays === "off"
      ? null
      : datedDecisions.filter(item => item.timestamp <= staleCutoffTimestamp).length;
    const oldestUntouchedFacts = channelFacts
      .filter(fact => fact.isUntouched)
      .sort(compareOldestFacts);
    const newSinceLastImportFacts = channelFacts
      .filter(fact => fact.isNewSinceLastImport);
    const buildImportTrend = app.domain.importHistory?.buildImportTrend;
    const persistence = typeof buildImportTrend === "function"
      ? buildImportTrend(options.importHistory, {
        channelKey,
        currentVideoIds: channelFacts.map(fact => fact.videoId),
      })
      : null;
    const totalCount = selectedChannel.totalCount;
    const decidedCount = explicitlyDecided.length;
    const statusMix = STATUS_KEYS.map(status => ({
      status,
      count: selectedChannel.statusCounts[status],
      percent: percent(selectedChannel.statusCounts[status], totalCount),
    }));
    const ageDistribution = AGE_BUCKET_KEYS.map(key => ({
      key,
      count: selectedChannel.ageBuckets[key].count,
      percent: percent(selectedChannel.ageBuckets[key].count, totalCount),
    }));

    return {
      channelKey: selectedChannel.channelKey,
      channelName: selectedChannel.channelName,
      channelUrl: selectedChannel.channelUrl,
      totalCount,
      knownDurationCount: selectedChannel.knownDurationCount,
      totalDurationSeconds: selectedChannel.totalDurationSeconds,
      knownAgeCount: selectedChannel.knownAgeCount,
      averageAgeDays: selectedChannel.averageAgeDays,
      backlogImpact: {
        videoPercent: percent(totalCount, model.videoCount),
        knownWatchTimePercent: model.totalDurationSeconds > 0
          ? percent(selectedChannel.totalDurationSeconds, model.totalDurationSeconds)
          : null,
        undecidedPercent: model.statusCounts.unreviewed > 0
          ? percent(
            selectedChannel.statusCounts.unreviewed,
            model.statusCounts.unreviewed,
          )
          : null,
        durationCoveragePercent: percent(
          selectedChannel.knownDurationCount,
          totalCount,
        ),
      },
      decisionHealth: {
        statusMix,
        statusMixDenominator: totalCount,
        decidedCount,
        reviewedPercent: percent(decidedCount, totalCount),
        maybeCount: selectedChannel.statusCounts.maybe,
        maybePercentOfDecided: percent(
          selectedChannel.statusCounts.maybe,
          decidedCount,
        ),
        staleDays,
        staleCount,
        staleEligibleCount: datedDecisions.length,
        stalePercent: staleDays === "off"
          ? null
          : percent(staleCount, datedDecisions.length),
        staleCutoffAt: staleCutoffTimestamp === null
          ? ""
          : new Date(staleCutoffTimestamp).toISOString(),
        undatedDecisionCount: decidedCount - datedDecisions.length,
      },
      ageDistribution,
      oldestUntouchedCount: oldestUntouchedFacts.length,
      oldestUntouchedUnknownAgeCount: oldestUntouchedFacts.filter(
        fact => fact.ageDays === null,
      ).length,
      oldestUntouched: oldestUntouchedFacts.slice(0, 5).map(createDetailVideo),
      newSinceLastImportAvailable: options.hasImportBaseline === true,
      newSinceLastImportCount: newSinceLastImportFacts.length,
      newSinceLastImport: newSinceLastImportFacts.slice(0, 5).map(createDetailVideo),
      persistence,
    };
  }

  function createEmptyInsightsCache() {
    return {
      datasetRevision: -1,
      decisionRevision: -1,
      videoFacts: [],
      model: createEmptyInsightsModel(),
    };
  }

  function refreshVideoFactDecisions(videoFacts, decisions = {}) {
    let changed = false;
    const refreshed = (Array.isArray(videoFacts) ? videoFacts : []).map(fact => {
      const decision = normalizeDecision(decisions?.[fact.videoId] || {});
      const isUntouched = decision.status === "unreviewed";
      if (fact.status === decision.status
        && fact.isUntouched === isUntouched
        && fact.decisionUpdatedAt === decision.updatedAt) {
        return fact;
      }
      changed = true;
      return {
        ...fact,
        status: decision.status,
        isUntouched,
        decisionUpdatedAt: decision.updatedAt,
      };
    });
    return changed ? refreshed : videoFacts;
  }

  function getMemoizedInsightsModel(cache, input = {}) {
    const target = cache && typeof cache === "object"
      ? cache
      : createEmptyInsightsCache();
    const datasetRevision = Number.isInteger(input.datasetRevision)
      ? input.datasetRevision
      : 0;
    const decisionRevision = Number.isInteger(input.decisionRevision)
      ? input.decisionRevision
      : 0;
    const datasetChanged = target.datasetRevision !== datasetRevision;
    const decisionsChanged = target.decisionRevision !== decisionRevision;

    if (!datasetChanged && !decisionsChanged) return target.model;

    if (datasetChanged) {
      target.videoFacts = deriveVideoFacts(
        input.videos,
        input.decisions,
        input.importContext,
        input.now,
      );
    } else if (decisionsChanged) {
      target.videoFacts = refreshVideoFactDecisions(
        target.videoFacts,
        input.decisions,
      );
    }

    target.model = buildChannelInsights(target.videoFacts, input.options);
    target.datasetRevision = datasetRevision;
    target.decisionRevision = decisionRevision;
    return target.model;
  }

  app.domain.insights = Object.freeze({
    AGE_BUCKET_KEYS,
    STATUS_KEYS,
    INSIGHTS_MEASURES,
    INSIGHTS_SORTS,
    DEFAULT_CHANNEL_LIMIT,
    DEFAULT_DECISION_STALE_DAYS,
    getAgeBucket,
    getChannelKey,
    normalizeDecisionStaleDays,
    normalizeInsightsSettings,
    deriveVideoFacts,
    buildChannelInsights,
    buildChannelDetail,
    buildChannelAgeMatrix,
    normalizeInsightsMeasure,
    normalizeInsightsSort,
    createEmptyInsightsModel,
    createEmptyInsightsCache,
    refreshVideoFactDecisions,
    getMemoizedInsightsModel,
  });
})(globalThis);
