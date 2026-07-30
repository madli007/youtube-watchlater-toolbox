(function registerDomainModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};
    const { GROUPING_STOP_WORDS, GROUPING_WRAPPER_TERMS } = app.config;
    const { dedupeVideos } = app.domain.importComparison;
    const { finiteNumberOrNull, parseApproximateAgeDays, parseApproximateViewCount } = app.domain.filters;
    const { getChannelKey } = app.domain.insights;

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
        withoutSequence = `${withoutSequence.slice(0, matched.index)} ${withoutSequence.slice(matched.index + matched.length)}`
          .replace(/\s+/g, " ")
          .trim();
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

    function buildSeriesGroups(videos) {
      const buckets = new Map();
      for (const video of videos) {
        const signature = getSeriesSignature(video);
        if (!signature) continue;
        if (!buckets.has(signature.key)) buckets.set(signature.key, []);
        buckets.get(signature.key).push({ video, signature });
      }
      const groups = [];
      for (const items of buckets.values()) {
        if (items.length < 2) continue;
        items.sort((a, b) => a.signature.season - b.signature.season
          || a.signature.episode - b.signature.episode
          || (a.video.index || 0) - (b.video.index || 0));
        const members = items.map(item => item.video);
        groups.push({
          type: "series",
          label: formatGroupLabel(items[0].signature.base),
          reason: `Same channel and episode/title-number pattern`,
          members,
        });
      }
      return groups;
    }

    function buildDuplicateGroups(videos) {
      const buckets = new Map();
      for (const video of videos) {
        const fingerprint = normalizeDuplicateTitle(video.title);
        const tokens = fingerprint.split(" ").filter(Boolean);
        if (fingerprint.length < 8 || tokens.length < 2) continue;
        if (!buckets.has(fingerprint)) buckets.set(fingerprint, []);
        buckets.get(fingerprint).push(video);
      }
      return Array.from(buckets.entries())
        .filter(([, members]) => members.length >= 2)
        .map(([, members]) => {
          const channels = new Set(members.map(video => normalizeGroupingTitle(video.channel)).filter(Boolean));
          return {
            type: "duplicate",
            label: getRepresentativeTitle(members),
            reason: channels.size > 1
              ? `Same normalized title across ${channels.size} channels; possible reupload`
              : "Same normalized title; possible duplicate or reupload",
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
            reason: "Strong title-word overlap within the same channel",
            members,
          });
        }
      }
      return groups;
    }

    function buildVideoGroups(videos) {
      const uniqueVideos = dedupeVideos(Array.isArray(videos) ? videos : []).filter(video => video?.videoId);
      const candidates = [
        ...buildDuplicateGroups(uniqueVideos),
        ...buildSeriesGroups(uniqueVideos),
        ...buildSimilarTitleGroups(uniqueVideos),
      ];
      const typePriority = { duplicate: 0, series: 1, similar: 2 };
      const byMembers = new Map();
      for (const candidate of candidates) {
        const memberKey = candidate.members.map(video => video.videoId).sort().join("|");
        const existing = byMembers.get(memberKey);
        if (!existing || typePriority[candidate.type] < typePriority[existing.type]) byMembers.set(memberKey, candidate);
      }
      return Array.from(byMembers.values())
        .map(group => ({ ...group, id: createGroupId(group.type, group.members) }))
        .sort((a, b) => typePriority[a.type] - typePriority[b.type]
          || b.members.length - a.members.length
          || a.label.localeCompare(b.label));
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
      normalizeSeriesSyntax,
      removeGenericWrappers,
      getTitleInitialism,
      parseSeriesTitle,
      getSeriesSignature,
      getSimilarityTokens,
      calculateTitleSimilarity,
      createGroupId,
      getRepresentativeTitle,
      formatGroupLabel,
      getCommonTitleWords,
      buildSeriesGroups,
      buildDuplicateGroups,
      buildSimilarTitleGroups,
      buildVideoGroups,
      chooseGroupWinner,
  });
})(globalThis);
