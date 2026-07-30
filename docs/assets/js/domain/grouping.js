(function registerDomainModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};
    const { GROUPING_STOP_WORDS, GROUPING_WRAPPER_TERMS } = app.config;
    const { dedupeVideos } = app.domain.importComparison;
    const { finiteNumberOrNull, parseApproximateAgeDays, parseApproximateViewCount } = app.domain.filters;
    const { getChannelKey } = app.domain.insights;
    const SERIES_AUTO_THRESHOLD = 0.88;
    const SERIES_REVIEW_THRESHOLD = 0.72;
    const MAX_FUZZY_POSTING_SIZE = 40;
    const GROUPING_OVERRIDES_SCHEMA_VERSION = 1;

    function normalizeGroupingTitle(value) {
      return String(value || "")
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^\p{L}\p{N}#]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizeDuplicateTitle(value) {
      return normalizeGroupingTitle(value)
        .replace(/\b(?:official|music|lyric|lyrics|video|audio|hd|hq|uhd|4k|8k|1080p|720p|reupload|reuploaded|remaster|remastered)\b/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function createEmptyGroupingOverrides() {
      return {
        schemaVersion: GROUPING_OVERRIDES_SCHEMA_VERSION,
        aliases: [],
        merges: [],
        splits: [],
      };
    }

    function normalizeOverrideId(value) {
      return String(value || "").trim().slice(0, 160);
    }

    function normalizeOverrideTimestamp(value) {
      const text = String(value || "").trim();
      return Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : "";
    }

    function normalizeOverrideMemberIds(value, minimum = 1) {
      const ids = Array.from(new Set(
        (Array.isArray(value) ? value : [])
          .map(id => String(id || "").trim())
          .filter(Boolean),
      )).sort();
      return ids.length >= minimum ? ids : [];
    }

    function normalizeAliasOverride(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const id = normalizeOverrideId(value.id);
      const channelKey = String(value.channelKey || "").trim();
      const fromBases = Array.from(new Set(
        (Array.isArray(value.fromBases) ? value.fromBases : [value.from])
          .map(normalizeGroupingTitle)
          .filter(Boolean),
      )).sort();
      const to = normalizeGroupingTitle(value.to);
      if (!id || !channelKey || !fromBases.length || !to) return null;
      const usefulBases = fromBases.filter(base => base !== to);
      if (!usefulBases.length) return null;
      return {
        id,
        channelKey,
        fromBases: usefulBases,
        to,
        label: String(value.label || "").trim().slice(0, 240),
        createdAt: normalizeOverrideTimestamp(value.createdAt),
      };
    }

    function normalizeMergeOverride(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const id = normalizeOverrideId(value.id);
      const channelKey = String(value.channelKey || "").trim();
      const memberIds = normalizeOverrideMemberIds(value.memberIds, 2);
      if (!id || !channelKey || !memberIds.length) return null;
      return {
        id,
        channelKey,
        memberIds,
        label: String(value.label || "").trim().slice(0, 240),
        createdAt: normalizeOverrideTimestamp(value.createdAt),
      };
    }

    function normalizeSplitOverride(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const id = normalizeOverrideId(value.id);
      const channelKey = String(value.channelKey || "").trim();
      const sourceMemberIds = normalizeOverrideMemberIds(value.sourceMemberIds, 2);
      const sourceSet = new Set(sourceMemberIds);
      const memberIds = normalizeOverrideMemberIds(value.memberIds, 1)
        .filter(videoId => sourceSet.has(videoId));
      if (!id || !channelKey || !sourceMemberIds.length || !memberIds.length
        || memberIds.length >= sourceMemberIds.length) {
        return null;
      }
      return {
        id,
        channelKey,
        sourceMemberIds,
        memberIds,
        label: String(value.label || "").trim().slice(0, 240),
        createdAt: normalizeOverrideTimestamp(value.createdAt),
      };
    }

    function normalizeGroupingOverrides(value) {
      const source = value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
      const uniqueById = (items, normalizer) => {
        const byId = new Map();
        for (const item of Array.isArray(items) ? items : []) {
          const normalized = normalizer(item);
          if (normalized) byId.set(normalized.id, normalized);
        }
        return Array.from(byId.values());
      };
      return {
        schemaVersion: GROUPING_OVERRIDES_SCHEMA_VERSION,
        aliases: uniqueById(source.aliases, normalizeAliasOverride),
        merges: uniqueById(source.merges, normalizeMergeOverride),
        splits: uniqueById(source.splits, normalizeSplitOverride),
      };
    }

    function removeGroupingOverride(overrides, overrideId) {
      const normalized = normalizeGroupingOverrides(overrides);
      const id = normalizeOverrideId(overrideId);
      return {
        ...normalized,
        aliases: normalized.aliases.filter(item => item.id !== id),
        merges: normalized.merges.filter(item => item.id !== id),
        splits: normalized.splits.filter(item => item.id !== id),
      };
    }

    function getVideoChannelKey(video) {
      return getChannelKey(video?.channelUrl, video?.channel);
    }

    function createAliasOverride(group, alias, options = {}) {
      const members = Array.isArray(group?.members) ? group.members : [];
      const channelKeys = new Set(members.map(getVideoChannelKey).filter(Boolean));
      if (channelKeys.size !== 1) {
        throw new Error("A manual alias can only apply to one channel.");
      }
      const to = normalizeGroupingTitle(alias);
      const fromBases = Array.from(new Set(
        members.map(video => parseSeriesTitle(video).base).filter(Boolean),
      ));
      const normalized = normalizeAliasOverride({
        id: options.id,
        channelKey: Array.from(channelKeys)[0],
        fromBases,
        to,
        label: String(alias || "").trim(),
        createdAt: options.createdAt,
      });
      if (!normalized) throw new Error("Enter a different, usable alias for this group.");
      return normalized;
    }

    function createMergeOverride(groups, options = {}) {
      const sourceGroups = (Array.isArray(groups) ? groups : []).filter(Boolean);
      if (sourceGroups.length < 2) throw new Error("Select at least two groups to merge.");
      const members = dedupeVideos(sourceGroups.flatMap(group => group.members || []))
        .filter(video => video?.videoId);
      const channelKeys = new Set(members.map(getVideoChannelKey).filter(Boolean));
      if (channelKeys.size !== 1) {
        throw new Error("Groups from different channels cannot be merged.");
      }
      const normalized = normalizeMergeOverride({
        id: options.id,
        channelKey: Array.from(channelKeys)[0],
        memberIds: members.map(video => video.videoId),
        label: options.label || sourceGroups[0]?.label,
        createdAt: options.createdAt,
      });
      if (!normalized) throw new Error("The selected groups do not contain enough videos to merge.");
      return normalized;
    }

    function createSplitOverride(group, memberIds, options = {}) {
      const members = dedupeVideos(Array.isArray(group?.members) ? group.members : [])
        .filter(video => video?.videoId);
      const channelKeys = new Set(members.map(getVideoChannelKey).filter(Boolean));
      if (channelKeys.size !== 1) throw new Error("A split can only apply within one channel.");
      const selected = normalizeOverrideMemberIds(memberIds, 1);
      const normalized = normalizeSplitOverride({
        id: options.id,
        channelKey: Array.from(channelKeys)[0],
        sourceMemberIds: members.map(video => video.videoId),
        memberIds: selected,
        label: options.label || group?.label,
        createdAt: options.createdAt,
      });
      if (!normalized) {
        throw new Error("Select some, but not all, group members to split.");
      }
      return normalized;
    }

    function normalizeSeriesSyntax(value) {
      return String(value || "")
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[‐‑‒–—−]/gu, "-")
        .replace(/[^\p{L}\p{N}#/-]+/gu, " ")
        .replace(/\s*([/-])\s*/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
    }

    function escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function removeGenericWrappers(value) {
      let title = normalizeSeriesSyntax(value);
      const removed = [];
      const terms = [...GROUPING_WRAPPER_TERMS]
        .map(term => normalizeGroupingTitle(term))
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);

      let changed = true;
      while (title && changed) {
        changed = false;
        for (const term of terms) {
          const escaped = escapeRegExp(term).replace(/\s+/g, "\\s+");
          const prefix = new RegExp(`^${escaped}(?:\\s+|$)`, "u");
          const suffix = new RegExp(`(?:^|\\s+)${escaped}$`, "u");
          if (prefix.test(title)) {
            title = title.replace(prefix, " ").replace(/\s+/g, " ").trim();
            removed.push(term);
            changed = true;
            break;
          }
          if (suffix.test(title)) {
            title = title.replace(suffix, " ").replace(/\s+/g, " ").trim();
            removed.push(term);
            changed = true;
            break;
          }
        }
      }

      return {
        title,
        removed: Array.from(new Set(removed)),
      };
    }

    function sequenceFromMatch(match, definition) {
      const season = definition.seasonGroup
        ? Number(match[definition.seasonGroup])
        : null;
      const first = definition.firstGroup
        ? Number(match[definition.firstGroup])
        : null;
      const second = definition.secondGroup && match[definition.secondGroup]
        ? Number(match[definition.secondGroup])
        : null;
      const separator = definition.separatorGroup && match[definition.separatorGroup]
        ? match[definition.separatorGroup]
        : "";
      const numbers = [first, second].filter(number => Number.isFinite(number));
      const isRange = second !== null && separator === "-";

      return {
        kind: definition.kind,
        format: definition.format,
        season: Number.isFinite(season) ? season : null,
        episode: definition.kind === "episode" || definition.kind === "trailing"
          ? (numbers[0] ?? null)
          : null,
        episodes: definition.kind === "episode" || definition.kind === "trailing"
          ? numbers
          : [],
        part: definition.kind === "part" || definition.kind === "chapter"
          ? (numbers[0] ?? null)
          : null,
        parts: definition.kind === "part" || definition.kind === "chapter"
          ? numbers
          : [],
        qualifier: definition.qualifierGroup
          ? String(match[definition.qualifierGroup] || "").replace(/\s+/g, " ").trim()
          : null,
        range: isRange ? { start: first, end: second } : null,
        raw: match[0].trim(),
      };
    }

    function findExplicitSequence(title) {
      const definitions = [
        {
          regex: /\bs\s*0*(\d{1,3})\s*e(?:p(?:isode)?)?\s*0*(\d{1,4})(?:\s*(\/|and|-)\s*(?:e(?:p(?:isode)?)?\s*)?0*(\d{1,4}))?\b/u,
          kind: "episode",
          format: "season-episode",
          seasonGroup: 1,
          firstGroup: 2,
          separatorGroup: 3,
          secondGroup: 4,
        },
        {
          regex: /\bseason\s*0*(\d{1,3})\s*(?:episode|episodes|ep)\s*0*(\d{1,4})(?:\s*(\/|and|-)\s*(?:e(?:p(?:isode)?)?\s*)?0*(\d{1,4}))?\b/u,
          kind: "episode",
          format: "season-episode-words",
          seasonGroup: 1,
          firstGroup: 2,
          separatorGroup: 3,
          secondGroup: 4,
        },
        {
          regex: /\b0*(\d{1,3})\s*x\s*0*(\d{1,4})(?:\s*(\/|and|-)\s*0*(\d{1,4}))?\b/u,
          kind: "episode",
          format: "season-x-episode",
          seasonGroup: 1,
          firstGroup: 2,
          separatorGroup: 3,
          secondGroup: 4,
        },
        {
          regex: /\b(?:episode|episodes|ep)\s*#?\s*0*(\d{1,4})(?:\s*(\/|and|-)\s*(?:e(?:p(?:isode)?)?\s*)?0*(\d{1,4}))?\b/u,
          kind: "episode",
          format: "episode",
          firstGroup: 1,
          separatorGroup: 2,
          secondGroup: 3,
        },
        {
          regex: /(?:^|\s)#\s*0*(\d{1,4})\b/u,
          kind: "episode",
          format: "hash-episode",
          firstGroup: 1,
        },
        {
          regex: /\b(part|pt|chapter)\s*#?\s*0*(\d{1,4})(?:\s*(\/|and|-)\s*0*(\d{1,4}))?\b/u,
          kind: null,
          format: "part",
          firstGroup: 2,
          separatorGroup: 3,
          secondGroup: 4,
          kindGroup: 1,
        },
        {
          regex: /\b(?:season\s*0*(\d{1,3})\s+)?((?:season|series)\s+finale|finale|special|pilot)\b/u,
          kind: "qualifier",
          format: "qualifier",
          seasonGroup: 1,
          qualifierGroup: 2,
        },
      ];

      for (const definition of definitions) {
        const match = title.match(definition.regex);
        if (!match) continue;
        const resolvedDefinition = definition.kindGroup
          ? {
            ...definition,
            kind: match[definition.kindGroup] === "chapter" ? "chapter" : "part",
          }
          : definition;
        return {
          index: match.index,
          length: match[0].length,
          sequence: sequenceFromMatch(match, resolvedDefinition),
        };
      }
      return null;
    }

    function findTrailingSequence(title) {
      const rangeMatch = title.match(/\b0*(\d{1,3})(-)0*(\d{1,3})\s*$/u);
      if (rangeMatch) {
        return {
          index: rangeMatch.index,
          length: rangeMatch[0].length,
          sequence: sequenceFromMatch(rangeMatch, {
            kind: "episode",
            format: "unlabeled-range",
            firstGroup: 1,
            separatorGroup: 2,
            secondGroup: 3,
          }),
        };
      }

      const trailingMatch = title.match(/\b0*(\d{1,4})\s*$/u);
      if (!trailingMatch) return null;
      const number = Number(trailingMatch[1]);
      const prefix = title.slice(0, trailingMatch.index).trim();
      if ((number >= 1900 && number <= 2099)
        || /\b(?:4k|8k|1080p|720p)\s*$/u.test(title)
        || !prefix) {
        return null;
      }
      return {
        index: trailingMatch.index,
        length: trailingMatch[0].length,
        sequence: sequenceFromMatch(trailingMatch, {
          kind: "trailing",
          format: "trailing-number",
          firstGroup: 1,
        }),
      };
    }

    function removeRepeatedChannel(base, channelName) {
      const normalizedChannel = normalizeGroupingTitle(channelName);
      if (!normalizedChannel || normalizedChannel.length < 3) {
        return { base, removed: false };
      }
      const escaped = escapeRegExp(normalizedChannel).replace(/\s+/g, "\\s+");
      const prefix = new RegExp(`^${escaped}(?:\\s+|$)`, "u");
      const suffix = new RegExp(`(?:^|\\s+)${escaped}$`, "u");
      const withoutPrefix = base.replace(prefix, " ").replace(/\s+/g, " ").trim();
      if (withoutPrefix && withoutPrefix !== base) return { base: withoutPrefix, removed: true };
      const withoutSuffix = base.replace(suffix, " ").replace(/\s+/g, " ").trim();
      if (withoutSuffix && withoutSuffix !== base) return { base: withoutSuffix, removed: true };
      return { base, removed: false };
    }

    function getTitleInitialism(value) {
      const words = normalizeGroupingTitle(value)
        .split(" ")
        .filter(word => word && !/^\d+$/u.test(word));
      return words.length >= 2 ? words.map(word => word[0]).join("") : "";
    }

    function parseSeriesTitle(video) {
      const originalTitle = String(video?.title || "");
      const normalizedTitle = normalizeSeriesSyntax(originalTitle);
      const channelKey = getChannelKey(video?.channelUrl, video?.channel);
      const warnings = [];
      const reasons = [
        channelKey.startsWith("url:")
          ? "canonical channel URL"
          : "normalized channel name",
      ];

      const firstWrapperPass = removeGenericWrappers(normalizedTitle);
      const matched = findExplicitSequence(firstWrapperPass.title)
        || findTrailingSequence(firstWrapperPass.title);
      let sequence = matched?.sequence || null;
      let withoutSequence = firstWrapperPass.title;
      if (matched) {
        const beforeSequence = withoutSequence.slice(0, matched.index)
          .replace(/[-/]+\s*$/u, " ")
          .replace(/\s+/g, " ")
          .trim();
        const afterSequence = withoutSequence.slice(matched.index + matched.length)
          .replace(/^\s*[-/]+\s*/u, " ")
          .replace(/\s+/g, " ")
          .trim();
        // Reaction channels commonly use "Show S01E02 - Episode title". The
        // subtitle changes for every upload and must not become the series base.
        // If the sequence is at the start, keep the text after it instead.
        withoutSequence = normalizeGroupingTitle(beforeSequence).length >= 3
          ? beforeSequence
          : afterSequence;
        if (beforeSequence && afterSequence && withoutSequence === beforeSequence) {
          reasons.push("ignored episode subtitle after sequence");
        }
        reasons.push(`detected ${sequence.format}`);
      }

      const wrappers = firstWrapperPass.removed;
      if (wrappers.length) reasons.push(`removed wrapper: ${wrappers.join(", ")}`);

      let base = normalizeGroupingTitle(withoutSequence);
      const channelResult = removeRepeatedChannel(base, video?.channel);
      base = channelResult.base;
      if (channelResult.removed) reasons.push("removed repeated channel name");

      if (sequence?.range) warnings.push("multiple-episode-range");
      else if ((sequence?.episodes.length || sequence?.parts.length) > 1) {
        warnings.push("multiple-episode-list");
      }
      if (sequence?.format === "unlabeled-range") warnings.push("unlabeled-sequence");
      if (sequence?.format === "trailing-number") warnings.push("unlabeled-sequence");
      if (sequence?.kind === "part"
        && /\b(?:movie|film)\b/u.test(normalizeGroupingTitle(originalTitle))) {
        warnings.push("ambiguous-movie-part");
      }
      if (!sequence && /\b(?:19|20)\d{2}\b/u.test(normalizedTitle)) {
        warnings.push("year-not-treated-as-episode");
      }
      if (!sequence && /\b(?:4k|8k|1080p|720p)\b/u.test(normalizedTitle)) {
        warnings.push("resolution-not-treated-as-episode");
      }
      if (!base) warnings.push("missing-series-base");

      const tokens = getSimilarityTokens(base);
      const initialism = getTitleInitialism(base);
      const canonicalBase = base;
      reasons.push(base ? `base: ${base}` : "no usable base");

      return {
        video,
        channelKey,
        originalTitle,
        normalizedTitle,
        titleWithoutWrappers: normalizeGroupingTitle(firstWrapperPass.title),
        base,
        canonicalBase,
        tokens,
        initialism,
        sequence,
        wrappers,
        warnings,
        reasons,
        debugReason: reasons.join(" · "),
      };
    }

    function getSeriesSignature(video) {
      const parsed = parseSeriesTitle(video);
      const { base, sequence } = parsed;
      if (!sequence || !base || !parsed.tokens.length || base.length < 3) return null;
      return {
        key: `${parsed.channelKey}|${base}`,
        base,
        season: sequence.season ?? 0,
        episode: sequence.episode ?? sequence.part ?? 0,
        parsed,
      };
    }

    function getSimilarityTokens(value) {
      return Array.from(new Set(normalizeDuplicateTitle(value)
        .split(" ")
        .filter(token => token.length >= 2 && !/^\d+$/u.test(token) && !GROUPING_STOP_WORDS.has(token))));
    }

    function calculateTitleSimilarity(left, right) {
      const leftTokens = Array.isArray(left) ? left : getSimilarityTokens(left);
      const rightTokens = Array.isArray(right) ? right : getSimilarityTokens(right);
      if (!leftTokens.length || !rightTokens.length) return 0;
      const rightSet = new Set(rightTokens);
      const intersection = leftTokens.filter(token => rightSet.has(token)).length;
      if (intersection < 2) return 0;
      const dice = (2 * intersection) / (leftTokens.length + rightTokens.length);
      const containment = intersection / Math.min(leftTokens.length, rightTokens.length);
      const balance = Math.min(leftTokens.length, rightTokens.length) / Math.max(leftTokens.length, rightTokens.length);
      return Math.max(dice, containment * (0.75 + 0.25 * balance));
    }

    function calculateCharacterSimilarity(left, right) {
      const normalizedLeft = normalizeGroupingTitle(left).replace(/\s+/g, "");
      const normalizedRight = normalizeGroupingTitle(right).replace(/\s+/g, "");
      if (!normalizedLeft || !normalizedRight) return 0;
      if (normalizedLeft === normalizedRight) return 1;
      if (normalizedLeft.length < 2 || normalizedRight.length < 2) return 0;

      const toBigrams = value => {
        const counts = new Map();
        for (let index = 0; index < value.length - 1; index++) {
          const bigram = value.slice(index, index + 2);
          counts.set(bigram, (counts.get(bigram) || 0) + 1);
        }
        return counts;
      };
      const leftBigrams = toBigrams(normalizedLeft);
      const rightBigrams = toBigrams(normalizedRight);
      let intersection = 0;
      for (const [bigram, count] of leftBigrams) {
        intersection += Math.min(count, rightBigrams.get(bigram) || 0);
      }
      return (2 * intersection) / (normalizedLeft.length + normalizedRight.length - 2);
    }

    function getTokenMatchMetrics(leftTokens, rightTokens) {
      const left = Array.from(new Set(leftTokens || []));
      const right = Array.from(new Set(rightTokens || []));
      if (!left.length || !right.length) {
        return { intersection: 0, dice: 0, containment: 0 };
      }
      const rightSet = new Set(right);
      const intersection = left.filter(token => rightSet.has(token)).length;
      return {
        intersection,
        dice: (2 * intersection) / (left.length + right.length),
        containment: intersection / Math.min(left.length, right.length),
      };
    }

    function getSequenceFamily(sequence) {
      if (!sequence) return "";
      if (sequence.kind === "episode" || sequence.kind === "trailing" || sequence.kind === "qualifier") {
        return "episode";
      }
      if (sequence.kind === "part" || sequence.kind === "chapter") return "part";
      return sequence.kind || "";
    }

    function scoreSeriesMatch(left, right) {
      const reasons = [];
      if (!left?.video?.videoId || !right?.video?.videoId || left.channelKey !== right.channelKey) {
        return {
          score: 0,
          confidence: 0,
          reasons: ["different channel or missing video identity"],
          reviewRequired: true,
        };
      }
      if (!left.base || !right.base) {
        return {
          score: 0,
          confidence: 0,
          reasons: ["missing usable series base"],
          reviewRequired: true,
        };
      }

      reasons.push(left.channelKey.startsWith("url:")
        ? "same canonical channel URL"
        : "same normalized channel");

      const exactBase = left.base === right.base;
      const exactCanonicalBase = left.canonicalBase === right.canonicalBase;
      const manualAlias = exactCanonicalBase
        && (left.manualAliasOverrideIds?.length || right.manualAliasOverrideIds?.length);
      const initialismAlias = exactCanonicalBase
        && !exactBase
        && !manualAlias
        && (left.aliasResolved || right.aliasResolved);
      const metrics = getTokenMatchMetrics(left.tokens, right.tokens);
      const titleSimilarity = calculateTitleSimilarity(left.tokens, right.tokens);
      const characterSimilarity = calculateCharacterSimilarity(left.base, right.base);
      let score;

      if (exactBase) {
        score = 0.94;
        reasons.push("exact normalized base");
      } else if (manualAlias) {
        score = 0.93;
        reasons.push("manual per-channel alias");
      } else if (initialismAlias) {
        score = 0.9;
        reasons.push("unambiguous initialism alias");
      } else if (exactCanonicalBase) {
        score = 0.89;
        reasons.push("exact canonical base");
      } else {
        score = (titleSimilarity * 0.64)
          + (metrics.containment * 0.1)
          + (characterSimilarity * 0.16);
        if (metrics.intersection >= 2) reasons.push("strong title-token overlap");
        if (characterSimilarity >= 0.65) reasons.push("similar normalized wording");
      }

      const leftFamily = getSequenceFamily(left.sequence);
      const rightFamily = getSequenceFamily(right.sequence);
      if (leftFamily && rightFamily) {
        if (leftFamily !== rightFamily) {
          score -= 0.25;
          reasons.push("conflicting episode/part interpretation");
        } else {
          score += 0.06;
          reasons.push("compatible sequence patterns");
        }
      } else if (leftFamily || rightFamily) {
        score -= 0.05;
        reasons.push("one title has no sequence marker");
      } else {
        score -= 0.12;
        reasons.push("neither title has a sequence marker");
      }

      const leftNormalized = left.normalizedTitle || "";
      const rightNormalized = right.normalizedTitle || "";
      const hasTrailerMismatch = /\btrailer\b/u.test(leftNormalized) !== /\btrailer\b/u.test(rightNormalized);
      if (hasTrailerMismatch) {
        score -= 0.18;
        reasons.push("trailer/episode mismatch");
      }
      if (left.warnings?.includes("ambiguous-movie-part")
        || right.warnings?.includes("ambiguous-movie-part")) {
        score = Math.min(score - 0.08, SERIES_AUTO_THRESHOLD - 0.001);
        reasons.push("ambiguous movie part");
      }
      if (!exactCanonicalBase
        && metrics.intersection >= 2
        && metrics.dice < 0.7
        && left.tokens.some(token => !right.tokens.includes(token))
        && right.tokens.some(token => !left.tokens.includes(token))) {
        score -= 0.08;
        reasons.push("distinctive title tokens conflict");
      }

      score = Math.max(0, Math.min(0.99, Math.round(score * 1000) / 1000));
      return {
        score,
        confidence: score,
        reasons,
        reviewRequired: score < SERIES_AUTO_THRESHOLD,
      };
    }

    function resolveUnambiguousInitialisms(items) {
      const expansions = new Map();
      for (const item of items) {
        const wordCount = normalizeGroupingTitle(item.base).split(" ").filter(Boolean).length;
        if (!item.initialism || wordCount < 2 || item.initialism === item.base) continue;
        if (!expansions.has(item.initialism)) expansions.set(item.initialism, new Set());
        expansions.get(item.initialism).add(item.base);
      }

      return items.map(item => {
        if (item.manualAliasOverrideIds?.length) return item;
        const matches = expansions.get(item.base);
        if (!matches || matches.size !== 1) return item;
        const canonicalBase = Array.from(matches)[0];
        return {
          ...item,
          canonicalBase,
          aliasResolved: true,
          reasons: [...item.reasons, `resolved initialism ${item.base} → ${canonicalBase}`],
          debugReason: `${item.debugReason} · resolved initialism ${item.base} → ${canonicalBase}`,
        };
      });
    }

    function applyManualAliases(items, overrides) {
      const aliases = normalizeGroupingOverrides(overrides).aliases;
      if (!aliases.length) return items;
      const byChannelAndBase = new Map();
      for (const alias of aliases) {
        for (const base of alias.fromBases) {
          byChannelAndBase.set(`${alias.channelKey}\u001f${base}`, alias);
        }
      }
      return items.map(item => {
        const alias = byChannelAndBase.get(`${item.channelKey}\u001f${item.base}`);
        if (!alias) return item;
        const reason = `manual alias ${item.base} → ${alias.to}`;
        return {
          ...item,
          canonicalBase: alias.to,
          aliasResolved: true,
          manualAliasOverrideIds: [alias.id],
          reasons: [...item.reasons, reason],
          debugReason: `${item.debugReason} · ${reason}`,
        };
      });
    }

    function buildSeriesCandidateIndex(parsedItems) {
      const byChannel = new Map();
      for (const item of Array.isArray(parsedItems) ? parsedItems : []) {
        if (!item?.video?.videoId || !item.base || item.base.length < 2) continue;
        if (!byChannel.has(item.channelKey)) byChannel.set(item.channelKey, []);
        byChannel.get(item.channelKey).push(item);
      }

      const indexedItems = [];
      const pairMap = new Map();
      let totalPossiblePairs = 0;
      let skippedHighFrequencyTokens = 0;

      const addPair = (left, right, source) => {
        if (left === right || left.channelKey !== right.channelKey) return;
        const ids = [left.video.videoId, right.video.videoId].sort();
        const key = `${ids[0]}\u001f${ids[1]}`;
        if (!pairMap.has(key)) pairMap.set(key, { left, right, sources: new Set() });
        pairMap.get(key).sources.add(source);
      };
      const addStarPairs = (items, source) => {
        if (items.length < 2) return;
        const anchor = items[0];
        for (let index = 1; index < items.length; index++) addPair(anchor, items[index], source);
      };

      for (const channelItems of byChannel.values()) {
        const items = resolveUnambiguousInitialisms(channelItems);
        indexedItems.push(...items);
        totalPossiblePairs += (items.length * (items.length - 1)) / 2;

        const exactBases = new Map();
        const tokenPostings = new Map();
        for (const item of items) {
          if (!exactBases.has(item.canonicalBase)) exactBases.set(item.canonicalBase, []);
          exactBases.get(item.canonicalBase).push(item);
          for (const token of item.tokens) {
            if (!tokenPostings.has(token)) tokenPostings.set(token, []);
            tokenPostings.get(token).push(item);
          }
        }
        for (const baseItems of exactBases.values()) addStarPairs(baseItems, "canonical-base");

        const postingLimit = Math.min(
          MAX_FUZZY_POSTING_SIZE,
          Math.max(4, Math.ceil(items.length * 0.4)),
        );
        for (const [token, posting] of tokenPostings) {
          if (posting.length > postingLimit) {
            skippedHighFrequencyTokens++;
            continue;
          }
          for (let left = 0; left < posting.length; left++) {
            for (let right = left + 1; right < posting.length; right++) {
              addPair(posting[left], posting[right], `token:${token}`);
            }
          }
        }
      }

      return {
        items: indexedItems,
        pairs: Array.from(pairMap.values()).map(pair => ({
          ...pair,
          sources: Array.from(pair.sources),
        })),
        stats: {
          itemCount: indexedItems.length,
          channelCount: byChannel.size,
          totalPossiblePairs,
          candidatePairCount: pairMap.size,
          skippedHighFrequencyTokens,
        },
      };
    }

    function createGroupId(type, members) {
      const source = `${type}:${members.map(video => video.videoId).sort().join("|")}`;
      let hash = 2166136261;
      for (let index = 0; index < source.length; index++) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return `${type}-${(hash >>> 0).toString(36)}`;
    }

    function getRepresentativeTitle(members) {
      return [...members]
        .map(video => String(video.title || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.length - b.length || a.localeCompare(b))[0] || "Untitled group";
    }

    function formatGroupLabel(value) {
      const text = String(value || "").trim();
      return text ? text[0].toUpperCase() + text.slice(1) : "Untitled group";
    }

    function getCommonTitleWords(members) {
      const tokenLists = members.map(video => getSimilarityTokens(video.title));
      if (!tokenLists.length) return "";
      const common = tokenLists[0].filter(token => tokenLists.every(tokens => tokens.includes(token)));
      return common.slice(0, 8).join(" ");
    }

    function canMergeSeriesClusters(leftCluster, rightCluster) {
      const leftBases = new Set(leftCluster.map(item => item.canonicalBase));
      const rightBases = new Set(rightCluster.map(item => item.canonicalBase));
      if (leftBases.size === 1 && rightBases.size === 1
        && leftCluster[0].canonicalBase === rightCluster[0].canonicalBase) {
        return true;
      }

      // Fuzzy clusters are intentionally kept small and conservative. Exact-base
      // clusters use the linear fast path above.
      if (leftCluster.length * rightCluster.length > 400) return false;
      for (const left of leftCluster) {
        for (const right of rightCluster) {
          if (scoreSeriesMatch(left, right).score < SERIES_REVIEW_THRESHOLD) return false;
        }
      }
      return true;
    }

    function constrainedSeriesCluster(items, scoredEdges) {
      const clusters = items.map(item => [item]);
      const clusterByItem = new Map(items.map((item, index) => [item, index]));
      const active = new Set(clusters.map((_, index) => index));
      const sortedEdges = [...scoredEdges].sort((left, right) => right.score - left.score
        || left.left.video.videoId.localeCompare(right.left.video.videoId)
        || left.right.video.videoId.localeCompare(right.right.video.videoId));

      for (const edge of sortedEdges) {
        const leftIndex = clusterByItem.get(edge.left);
        const rightIndex = clusterByItem.get(edge.right);
        if (leftIndex === rightIndex) continue;
        const leftCluster = clusters[leftIndex];
        const rightCluster = clusters[rightIndex];
        if (!canMergeSeriesClusters(leftCluster, rightCluster)) continue;
        leftCluster.push(...rightCluster);
        for (const item of rightCluster) clusterByItem.set(item, leftIndex);
        clusters[rightIndex] = [];
        active.delete(rightIndex);
      }

      return Array.from(active, index => clusters[index]).filter(cluster => cluster.length >= 2);
    }

    function getCanonicalSeriesItem(items) {
      const baseCounts = new Map();
      for (const item of items) {
        baseCounts.set(item.canonicalBase, (baseCounts.get(item.canonicalBase) || 0) + 1);
      }
      return [...items].sort((left, right) => {
        const countDifference = baseCounts.get(right.canonicalBase) - baseCounts.get(left.canonicalBase);
        if (countDifference) return countDifference;
        const leftAliasPenalty = left.aliasResolved ? 1 : 0;
        const rightAliasPenalty = right.aliasResolved ? 1 : 0;
        if (leftAliasPenalty !== rightAliasPenalty) return leftAliasPenalty - rightAliasPenalty;
        return right.tokens.length - left.tokens.length
          || left.canonicalBase.localeCompare(right.canonicalBase)
          || left.video.videoId.localeCompare(right.video.videoId);
      })[0];
    }

    function createSeriesGroup(items) {
      const canonical = getCanonicalSeriesItem(items);
      const comparisons = items
        .filter(item => item !== canonical)
        .map(item => scoreSeriesMatch(canonical, item));
      const confidence = comparisons.length
        ? Math.min(...comparisons.map(match => match.score))
        : 0;
      const reasons = Array.from(new Set([
        canonical.channelKey.startsWith("url:")
          ? "same canonical channel URL"
          : "same normalized channel",
        items.every(item => item.canonicalBase === canonical.canonicalBase)
          ? "exact canonical base"
          : "constrained title similarity",
        ...(items.some(item => item.manualAliasOverrideIds?.length)
          ? ["manual per-channel alias"]
          : items.some(item => item.aliasResolved)
            ? ["unambiguous initialism alias"]
            : []),
        ...comparisons.flatMap(match => match.reasons.slice(1)),
      ]));
      const sortedItems = [...items].sort((left, right) => {
        const leftSeason = left.sequence?.season ?? 0;
        const rightSeason = right.sequence?.season ?? 0;
        const leftEpisode = left.sequence?.episode ?? left.sequence?.part ?? Number.MAX_SAFE_INTEGER;
        const rightEpisode = right.sequence?.episode ?? right.sequence?.part ?? Number.MAX_SAFE_INTEGER;
        return leftSeason - rightSeason
          || leftEpisode - rightEpisode
          || (left.video.index || 0) - (right.video.index || 0)
          || left.video.videoId.localeCompare(right.video.videoId);
      });
      const overrideIds = Array.from(new Set(
        items.flatMap(item => item.manualAliasOverrideIds || []),
      ));

      return {
        type: "series",
        label: formatGroupLabel(canonical.canonicalBase),
        canonicalBase: canonical.canonicalBase,
        channelKey: canonical.channelKey,
        confidence,
        reasons,
        reason: reasons.join(" · "),
        reviewRequired: confidence < SERIES_AUTO_THRESHOLD,
        manual: overrideIds.length > 0,
        confidenceKind: overrideIds.length ? "manual" : undefined,
        overrideIds,
        members: sortedItems.map(item => item.video),
        parsedMembers: sortedItems,
      };
    }

    function buildSeriesClusters(videos, options = {}) {
      const parsed = applyManualAliases(dedupeVideos(Array.isArray(videos) ? videos : [])
        .filter(video => video?.videoId)
        .map(parseSeriesTitle)
        .filter(item => item.base && item.tokens.length), options.overrides);
      const index = buildSeriesCandidateIndex(parsed);
      const scoredEdges = index.pairs
        .map(pair => ({
          ...pair,
          ...scoreSeriesMatch(pair.left, pair.right),
        }))
        .filter(edge => edge.score >= SERIES_REVIEW_THRESHOLD);
      const byChannel = new Map();
      for (const item of index.items) {
        if (!byChannel.has(item.channelKey)) byChannel.set(item.channelKey, []);
        byChannel.get(item.channelKey).push(item);
      }
      const edgesByChannel = new Map();
      for (const edge of scoredEdges) {
        if (!edgesByChannel.has(edge.left.channelKey)) edgesByChannel.set(edge.left.channelKey, []);
        edgesByChannel.get(edge.left.channelKey).push(edge);
      }

      const groups = [];
      for (const [channelKey, channelItems] of byChannel) {
        const channelEdges = edgesByChannel.get(channelKey) || [];
        for (const cluster of constrainedSeriesCluster(channelItems, channelEdges)) {
          groups.push(createSeriesGroup(cluster));
        }
      }

      if (options.diagnostics && typeof options.diagnostics === "object") {
        Object.assign(options.diagnostics, index.stats, {
          scoredPairCount: scoredEdges.length,
          groupCount: groups.length,
        });
      }
      return groups;
    }

    function buildSeriesGroups(videos, options) {
      return buildSeriesClusters(videos, options);
    }

    function buildDuplicateGroups(videos) {
      const buckets = new Map();
      for (const video of videos) {
        const fingerprint = normalizeDuplicateTitle(video.title);
        const tokens = fingerprint.split(" ").filter(Boolean);
        if (fingerprint.length < 8 || tokens.length < 2) continue;
        const channelKey = getVideoChannelKey(video);
        if (!channelKey) continue;
        const key = `${channelKey}\u001f${fingerprint}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(video);
      }
      return Array.from(buckets.entries())
        .filter(([, members]) => members.length >= 2)
        .map(([, members]) => {
          return {
            type: "duplicate",
            label: getRepresentativeTitle(members),
            confidence: 0.98,
            reasons: ["Same normalized title from the same channel; possible duplicate or reupload"],
            reason: "Same normalized title from the same channel; possible duplicate or reupload",
            reviewRequired: false,
            members: [...members].sort((a, b) => (a.index || 0) - (b.index || 0)),
          };
        });
    }

    function buildSimilarTitleGroups(videos) {
      const channelBuckets = new Map();
      for (const video of videos) {
        const channel = normalizeGroupingTitle(video.channel) || "unknown channel";
        const tokens = getSimilarityTokens(video.title);
        if (tokens.length < 3) continue;
        if (!channelBuckets.has(channel)) channelBuckets.set(channel, []);
        channelBuckets.get(channel).push({ video, tokens });
      }

      const groups = [];
      for (const items of channelBuckets.values()) {
        if (items.length < 2) continue;
        const parent = items.map((_, index) => index);
        const find = index => {
          let current = index;
          while (parent[current] !== current) {
            parent[current] = parent[parent[current]];
            current = parent[current];
          }
          return current;
        };
        const union = (left, right) => {
          const leftRoot = find(left);
          const rightRoot = find(right);
          if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
        };
        const inverted = new Map();
        items.forEach((item, index) => item.tokens.forEach(token => {
          if (!inverted.has(token)) inverted.set(token, []);
          inverted.get(token).push(index);
        }));
        const pairKeys = new Set();
        for (const indexes of inverted.values()) {
          if (indexes.length > Math.max(40, Math.ceil(items.length * 0.4))) continue;
          for (let left = 0; left < indexes.length; left++) {
            for (let right = left + 1; right < indexes.length; right++) {
              pairKeys.add(`${indexes[left]}:${indexes[right]}`);
            }
          }
        }
        for (const key of pairKeys) {
          const [left, right] = key.split(":").map(Number);
          if (calculateTitleSimilarity(items[left].tokens, items[right].tokens) >= 0.74) union(left, right);
        }
        const components = new Map();
        items.forEach((item, index) => {
          const root = find(index);
          if (!components.has(root)) components.set(root, []);
          components.get(root).push(item.video);
        });
        for (const members of components.values()) {
          if (members.length < 2) continue;
          members.sort((a, b) => (a.index || 0) - (b.index || 0));
          groups.push({
            type: "similar",
            label: formatGroupLabel(getCommonTitleWords(members) || getRepresentativeTitle(members)),
            confidence: 0.74,
            reasons: ["Strong title-word overlap within the same channel"],
            reason: "Strong title-word overlap within the same channel",
            reviewRequired: true,
            members,
          });
        }
      }
      return groups;
    }

    function createManualGroup(override, members, operation, orphanedIds = []) {
      const channels = new Set(members.map(getVideoChannelKey).filter(Boolean));
      if (channels.size !== 1 || !channels.has(override.channelKey)) return null;
      const type = "series";
      const label = formatGroupLabel(override.label || getRepresentativeTitle(members));
      const reason = operation === "merge"
        ? "Manually merged groups"
        : "Manually split from a detected group";
      return {
        id: `manual-${override.id}`,
        type,
        label,
        channelKey: override.channelKey,
        confidence: 1,
        confidenceKind: "manual",
        manual: true,
        reviewRequired: false,
        overrideIds: [override.id],
        orphanedIds,
        stale: orphanedIds.length > 0,
        reasons: [reason],
        reason,
        members: [...members].sort((left, right) =>
          (left.index || 0) - (right.index || 0)
          || left.videoId.localeCompare(right.videoId)),
      };
    }

    function applyManualGroupingOperations(groups, videos, overrides) {
      const normalized = normalizeGroupingOverrides(overrides);
      const videoById = new Map(
        (Array.isArray(videos) ? videos : [])
          .filter(video => video?.videoId)
          .map(video => [video.videoId, video]),
      );
      const operations = [
        ...normalized.merges.map(override => ({ kind: "merge", override })),
        ...normalized.splits.map(override => ({ kind: "split", override })),
      ].sort((left, right) =>
        String(left.override.createdAt).localeCompare(String(right.override.createdAt))
        || left.override.id.localeCompare(right.override.id));
      let result = [...groups];

      const removeIdsFromGroups = ids => {
        const idSet = new Set(ids);
        result = result.flatMap(group => {
          const members = group.members.filter(video => !idSet.has(video.videoId));
          if (members.length < 2) return [];
          if (members.length === group.members.length) return [group];
          return [{
            ...group,
            id: group.manual
              ? group.id
              : createGroupId(group.type, members),
            members,
            parsedMembers: Array.isArray(group.parsedMembers)
              ? group.parsedMembers.filter(item => !idSet.has(item.video.videoId))
              : group.parsedMembers,
          }];
        });
      };

      for (const { kind, override } of operations) {
        const memberIds = kind === "split" ? override.memberIds : override.memberIds;
        const existingMembers = memberIds.map(videoId => videoById.get(videoId)).filter(Boolean);
        const orphanedIds = memberIds.filter(videoId => !videoById.has(videoId));
        if (existingMembers.some(video => getVideoChannelKey(video) !== override.channelKey)) continue;

        if (kind === "split") {
          const sourceSet = new Set(override.sourceMemberIds);
          const touchesSourceGroup = result.some(group =>
            group.members.filter(video => sourceSet.has(video.videoId)).length >= 2);
          if (!touchesSourceGroup) continue;
        }
        removeIdsFromGroups(memberIds);
        if (existingMembers.length >= 2) {
          const manualGroup = createManualGroup(
            override,
            existingMembers,
            kind,
            orphanedIds,
          );
          if (manualGroup) result.push(manualGroup);
        }
      }
      return result;
    }

    function getGroupingOverrideDiagnostics(overrides, videos) {
      const normalized = normalizeGroupingOverrides(overrides);
      const sourceVideos = dedupeVideos(Array.isArray(videos) ? videos : [])
        .filter(video => video?.videoId);
      const videoById = new Map(sourceVideos.map(video => [video.videoId, video]));
      const parsed = sourceVideos.map(parseSeriesTitle);
      const diagnostics = [];
      for (const alias of normalized.aliases) {
        const matchedIds = parsed
          .filter(item => item.channelKey === alias.channelKey && alias.fromBases.includes(item.base))
          .map(item => item.video.videoId);
        diagnostics.push({
          id: alias.id,
          kind: "alias",
          label: alias.label || alias.to,
          matchedIds,
          orphanedIds: [],
          stale: matchedIds.length === 0,
        });
      }
      for (const [kind, records] of [["merge", normalized.merges], ["split", normalized.splits]]) {
        for (const override of records) {
          const expectedIds = kind === "split" ? override.sourceMemberIds : override.memberIds;
          const orphanedIds = expectedIds.filter(videoId => !videoById.has(videoId));
          const crossChannelIds = expectedIds.filter(videoId => {
            const video = videoById.get(videoId);
            return video && getVideoChannelKey(video) !== override.channelKey;
          });
          diagnostics.push({
            id: override.id,
            kind,
            label: override.label || `${kind} override`,
            matchedIds: expectedIds.filter(videoId => videoById.has(videoId)),
            orphanedIds,
            crossChannelIds,
            stale: orphanedIds.length > 0 || crossChannelIds.length > 0,
          });
        }
      }
      return diagnostics;
    }

    function buildVideoGroups(videos, options = {}) {
      const uniqueVideos = dedupeVideos(Array.isArray(videos) ? videos : []).filter(video => video?.videoId);
      const seriesDiagnostics = {};
      const candidates = [
        ...buildDuplicateGroups(uniqueVideos),
        ...buildSeriesGroups(uniqueVideos, {
          diagnostics: seriesDiagnostics,
          overrides: options.overrides,
        }),
        ...buildSimilarTitleGroups(uniqueVideos),
      ];
      const typePriority = { duplicate: 0, series: 1, similar: 2 };
      const byMembers = new Map();
      for (const candidate of candidates) {
        const memberKey = candidate.members.map(video => video.videoId).sort().join("|");
        const existing = byMembers.get(memberKey);
        if (!existing || typePriority[candidate.type] < typePriority[existing.type]) byMembers.set(memberKey, candidate);
      }
      const detectedGroups = Array.from(byMembers.values())
        .map(group => ({ ...group, id: createGroupId(group.type, group.members) }));
      const groups = applyManualGroupingOperations(
        detectedGroups,
        uniqueVideos,
        options.overrides,
      )
        .sort((a, b) => typePriority[a.type] - typePriority[b.type]
          || b.members.length - a.members.length
          || a.label.localeCompare(b.label));
      if (options.diagnostics && typeof options.diagnostics === "object") {
        Object.assign(options.diagnostics, seriesDiagnostics, {
          totalGroupCount: groups.length,
        });
      }
      return groups;
    }

    function createEmptyGroupingCache() {
      return {
        datasetRevision: -1,
        overrideRevision: -1,
        groups: [],
        diagnostics: null,
      };
    }

    function getMemoizedVideoGroups(cache, input = {}) {
      const target = cache && typeof cache === "object"
        ? cache
        : createEmptyGroupingCache();
      const datasetRevision = Number.isInteger(input.datasetRevision)
        ? input.datasetRevision
        : 0;
      const overrideRevision = Number.isInteger(input.overrideRevision)
        ? input.overrideRevision
        : 0;
      if (target.datasetRevision === datasetRevision
        && target.overrideRevision === overrideRevision) {
        return target.groups;
      }

      const diagnostics = {};
      target.groups = buildVideoGroups(input.videos, {
        diagnostics,
        overrides: input.overrides,
      });
      target.datasetRevision = datasetRevision;
      target.overrideRevision = overrideRevision;
      target.diagnostics = diagnostics;
      return target.groups;
    }

    function chooseGroupWinner(group, strategy) {
      const members = Array.isArray(group?.members) ? group.members.filter(video => video?.videoId) : [];
      if (!members.length) return null;
      const ranked = members.map((video, order) => {
        const value = strategy === "most-viewed"
          ? (finiteNumberOrNull(video.viewCountApprox) ?? parseApproximateViewCount(video.views))
          : parseApproximateAgeDays(video.uploaded);
        return { video, order, value };
      }).filter(item => item.value !== null && Number.isFinite(item.value));
      if (!ranked.length) return null;
      ranked.sort((a, b) => strategy === "most-viewed"
        ? b.value - a.value || a.order - b.order
        : a.value - b.value || a.order - b.order);
      return ranked[0].video;
    }

  app.domain.grouping = Object.freeze({
      normalizeGroupingTitle,
      normalizeDuplicateTitle,
      createEmptyGroupingOverrides,
      normalizeGroupingOverrides,
      removeGroupingOverride,
      createAliasOverride,
      createMergeOverride,
      createSplitOverride,
      getGroupingOverrideDiagnostics,
      normalizeSeriesSyntax,
      removeGenericWrappers,
      getTitleInitialism,
      parseSeriesTitle,
      getSeriesSignature,
      getSimilarityTokens,
      calculateTitleSimilarity,
      calculateCharacterSimilarity,
      scoreSeriesMatch,
      resolveUnambiguousInitialisms,
      buildSeriesCandidateIndex,
      createGroupId,
      getRepresentativeTitle,
      formatGroupLabel,
      getCommonTitleWords,
      constrainedSeriesCluster,
      buildSeriesClusters,
      buildSeriesGroups,
      buildDuplicateGroups,
      buildSimilarTitleGroups,
      buildVideoGroups,
      createEmptyGroupingCache,
      getMemoizedVideoGroups,
      chooseGroupWinner,
      SERIES_AUTO_THRESHOLD,
      SERIES_REVIEW_THRESHOLD,
      GROUPING_OVERRIDES_SCHEMA_VERSION,
  });
})(globalThis);
