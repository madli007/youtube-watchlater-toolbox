const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const modulePaths = [
  "docs/assets/js/config.js",
  "docs/assets/js/domain/decisions.js",
  "docs/assets/js/domain/import-comparison.js",
  "docs/assets/js/domain/filters.js",
  "docs/assets/js/domain/insights.js",
  "docs/assets/js/domain/grouping.js",
];
const sandbox = {};
vm.createContext(sandbox);
for (const relativePath of modulePaths) {
  vm.runInContext(
    fs.readFileSync(path.join(projectRoot, relativePath), "utf8"),
    sandbox,
    { filename: relativePath },
  );
}

const { grouping } = sandbox.WatchLaterApp.domain;

const tlouVideos = [
  {
    videoId: "tlou-1",
    title: "The Last of Us Season 1 Episode 1 Reaction",
    channel: "Reactors",
    channelUrl: "https://www.youtube.com/@reactors",
    index: 1,
  },
  {
    videoId: "tlou-2",
    title: "TLOU Episode 2 Reaction",
    channel: "Reactors renamed",
    channelUrl: "https://youtube.com/@reactors/",
    index: 2,
  },
  {
    videoId: "tlou-3",
    title: "The Last of Us 1x03",
    channel: "Reactors",
    channelUrl: "https://www.youtube.com/@reactors",
    index: 3,
  },
];
const tlouGroups = grouping.buildSeriesClusters(tlouVideos);
assert.equal(tlouGroups.length, 1, "an unambiguous initialism should join the full series name");
assert.deepEqual(
  [...tlouGroups[0].members].map(video => video.videoId).sort(),
  ["tlou-1", "tlou-2", "tlou-3"],
);
assert.ok(tlouGroups[0].confidence >= grouping.SERIES_AUTO_THRESHOLD);
assert.equal(tlouGroups[0].reviewRequired, false);
assert.ok(tlouGroups[0].reasons.includes("unambiguous initialism alias"));
assert.equal(tlouGroups[0].channelKey, "url:@reactors");

const ambiguousInitialismGroups = grouping.buildSeriesClusters([
  { videoId: "short", title: "TLOU Episode 1", channel: "One channel" },
  { videoId: "last-us", title: "The Last of Us Episode 2", channel: "One channel" },
  { videoId: "league", title: "The League of Unicorns Episode 3", channel: "One channel" },
]);
assert.equal(
  ambiguousInitialismGroups.some(group => group.members.some(video => video.videoId === "short")),
  false,
  "an initialism with multiple expansions must not be guessed",
);

const differentSeriesGroups = grouping.buildSeriesClusters([
  { videoId: "picard", title: "Star Trek Picard Episode 1", channel: "Trekkies" },
  { videoId: "discovery", title: "Star Trek Discovery Episode 2", channel: "Trekkies" },
]);
assert.equal(differentSeriesGroups.length, 0, "a shared franchise prefix is not enough to merge series");

const bridgeGroups = grouping.buildSeriesClusters([
  { videoId: "bridge-a", title: "Alpha Beta Episode 1", channel: "Bridge channel" },
  { videoId: "bridge-b", title: "Alpha Beta Gamma Episode 2", channel: "Bridge channel" },
  { videoId: "bridge-c", title: "Beta Gamma Episode 3", channel: "Bridge channel" },
]);
assert.equal(bridgeGroups.length, 1, "strong unequal bases should still produce a review group");
assert.equal(bridgeGroups[0].members.length, 2);
assert.equal(bridgeGroups[0].reviewRequired, true);
assert.ok(bridgeGroups[0].confidence >= grouping.SERIES_REVIEW_THRESHOLD);
assert.ok(bridgeGroups[0].confidence < grouping.SERIES_AUTO_THRESHOLD);
assert.equal(
  bridgeGroups.some(group => group.members.length === 3),
  false,
  "a transitive bridge must not join endpoints that fail the review threshold",
);

const crossChannelGroups = grouping.buildSeriesClusters([
  { videoId: "channel-a", title: "Shared Show Episode 1", channel: "Channel A" },
  { videoId: "channel-b", title: "Shared Show Episode 2", channel: "Channel B" },
]);
assert.equal(crossChannelGroups.length, 0, "series clustering must never cross channel identity");

const stargateGroups = grouping.buildSeriesClusters([
  {
    videoId: "sg1-901",
    title: "Stargate SG-1 9x01 - \"Avalon: Part 1\" Reaction",
    channel: "After Show Reacts",
    channelUrl: "https://youtube.com/@aftershowreacts",
  },
  {
    videoId: "sg1-902",
    title: "Stargate SG-1 9x02 - \"Avalon: Part 2\" Reaction",
    channel: "After Show Reacts",
    channelUrl: "https://youtube.com/@aftershowreacts",
  },
  {
    videoId: "sg1-1006",
    title: "Stargate SG-1 10x06 - \"200\" Reaction",
    channel: "After Show Reacts",
    channelUrl: "https://youtube.com/@aftershowreacts",
  },
  {
    videoId: "sg1-1016",
    title: "Stargate SG-1 10x16 - \"Bad Guys\" Reaction",
    channel: "After Show Reacts",
    channelUrl: "https://youtube.com/@aftershowreacts",
  },
]);
assert.equal(stargateGroups.length, 1, "episode subtitles must not fragment one show into small groups");
assert.equal(stargateGroups[0].label, "Stargate sg 1");
assert.equal(stargateGroups[0].members.length, 4);
assert.ok(
  stargateGroups[0].parsedMembers.every(item => item.base === "stargate sg 1"),
  "the series base should come from the title portion before SxE",
);

const duplicateCandidates = [
  {
    videoId: "trailer-a",
    title: "Venom: The Last Dance | Official Trailer Reaction",
    channel: "Blind Wave",
    channelUrl: "https://youtube.com/@blindwave",
  },
  {
    videoId: "trailer-b",
    title: "Venom: The Last Dance | Official Trailer Reaction",
    channel: "Heroes Reforged",
    channelUrl: "https://youtube.com/@heroesreforged",
  },
];
assert.equal(
  grouping.buildDuplicateGroups(duplicateCandidates).length,
  0,
  "matching reaction titles from different channels are not duplicates",
);
const sameChannelDuplicates = grouping.buildDuplicateGroups([
  duplicateCandidates[0],
  {
    ...duplicateCandidates[0],
    videoId: "trailer-a-copy",
    title: "Venom: The Last Dance | Trailer Reaction",
  },
]);
assert.equal(sameChannelDuplicates.length, 1, "same-channel normalized copies remain detectable");

const performanceVideos = [];
for (let channel = 0; channel < 50; channel++) {
  for (let series = 0; series < 50; series++) {
    for (let episode = 1; episode <= 2; episode++) {
      performanceVideos.push({
        videoId: `perf-${channel}-${series}-${episode}`,
        title: `Program topic${series} Episode ${episode}`,
        channel: `Performance ${channel}`,
        channelUrl: `https://youtube.com/@performance${channel}`,
        index: performanceVideos.length,
      });
    }
  }
}
const diagnostics = {};
const performanceGroups = grouping.buildSeriesClusters(performanceVideos, { diagnostics });
assert.equal(diagnostics.itemCount, 5000);
assert.equal(performanceGroups.length, 2500);
assert.ok(
  diagnostics.candidatePairCount <= diagnostics.itemCount,
  `candidate index should remain linear-ish, got ${diagnostics.candidatePairCount} pairs`,
);
assert.ok(
  diagnostics.candidatePairCount < diagnostics.totalPossiblePairs / 20,
  "candidate generation must not enumerate all same-channel pairs",
);
assert.ok(diagnostics.skippedHighFrequencyTokens > 0);

const cache = grouping.createEmptyGroupingCache();
const firstGroups = grouping.getMemoizedVideoGroups(cache, {
  videos: tlouVideos,
  datasetRevision: 1,
});
const cachedGroups = grouping.getMemoizedVideoGroups(cache, {
  videos: [],
  datasetRevision: 1,
});
assert.equal(cachedGroups, firstGroups, "unchanged dataset revisions should reuse the group array");
const refreshedGroups = grouping.getMemoizedVideoGroups(cache, {
  videos: crossChannelGroups,
  datasetRevision: 2,
});
assert.notEqual(refreshedGroups, firstGroups);
const overrideRefreshedGroups = grouping.getMemoizedVideoGroups(cache, {
  videos: crossChannelGroups,
  datasetRevision: 2,
  overrides: {
    aliases: [{
      id: "alias-cache",
      channelKey: "url:@reactors",
      fromBases: ["the last of us"],
      to: "last of us",
    }],
  },
  overrideRevision: 1,
});
assert.notEqual(
  overrideRefreshedGroups,
  refreshedGroups,
  "manual override revisions must invalidate the grouping cache",
);
assert.equal(cache.datasetRevision, 2);

console.log("grouping clustering test passed");
