(function registerDomainModule(root) {
  "use strict";

  const app = root.WatchLaterApp ||= {};
  app.domain ||= {};
    const { GROUPING_STOP_WORDS } = app.config;
    const { dedupeVideos } = app.domain.importComparison;
    const { finiteNumberOrNull, parseApproximateAgeDays, parseApproximateViewCount } = app.domain.filters;

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
    
    function getSeriesSignature(video) {
      const title = normalizeGroupingTitle(video?.title);
      if (!title) return null;
      const patterns = [
        { regex: /\bs(?:eason)?\s*0*(\d{1,3})\s*e(?:p(?:isode)?)?\s*0*(\d{1,4})\b/u, season: 1, episode: 2 },
        { regex: /\b0*(\d{1,3})\s*x\s*0*(\d{1,4})\b/u, season: 1, episode: 2 },
        { regex: /\bseason\s*0*(\d{1,3})\s*(?:episode|ep)\s*0*(\d{1,4})\b/u, season: 1, episode: 2 },
        { regex: /\b(?:episode|ep|part|pt|chapter)\s*#?\s*0*(\d{1,4})\b/u, episode: 1 },
        { regex: /(?:^|\s)#\s*0*(\d{1,4})\b/u, episode: 1 },
      ];
    
      let match = null;
      let pattern = null;
      for (const candidate of patterns) {
        match = title.match(candidate.regex);
        if (match) {
          pattern = candidate;
          break;
        }
      }
    
      if (!match) {
        const trailing = title.match(/\b0*(\d{1,3})\s*$/u);
        const number = trailing ? Number(trailing[1]) : null;
        if (!trailing || (number >= 1900 && number <= 2099)) return null;
        match = trailing;
        pattern = { regex: /\b0*(\d{1,3})\s*$/u, episode: 1 };
      }
    
      const base = title.replace(pattern.regex, " ").replace(/\s+/g, " ").trim();
      const meaningful = getSimilarityTokens(base);
      if (!base || !meaningful.length || base.length < 3) return null;
      const channel = normalizeGroupingTitle(video?.channel) || "unknown channel";
      return {
        key: `${channel}|${base}`,
        base,
        season: pattern.season ? Number(match[pattern.season]) : 0,
        episode: pattern.episode ? Number(match[pattern.episode]) : 0,
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
