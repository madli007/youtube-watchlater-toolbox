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
  "docs/assets/js/domain/import-history.js",
];
const sandbox = {};
vm.createContext(sandbox);
for (const relativePath of modulePaths) {
  const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
  assert.doesNotMatch(
    source,
    /\b(?:document|localStorage|sessionStorage)\b/,
    `${relativePath} must remain independent of DOM and browser persistence`,
  );
  vm.runInContext(source, sandbox, { filename: relativePath });
}

const {
  config,
  domain: { importComparison, importHistory },
} = sandbox.WatchLaterApp;
const plain = value => JSON.parse(JSON.stringify(value));
const exportedAt = "2026-07-30T12:00:00.000Z";
const videos = [
  {
    videoId: "two",
    title: "Second",
    channel: "Renamed Channel",
    channelUrl: "https://www.youtube.com/@stable",
    durationSeconds: 180,
  },
  {
    videoId: "one",
    title: "First",
    channel: "Original Channel",
    channelUrl: "https://www.youtube.com/@stable",
    durationSeconds: 120,
  },
  {
    videoId: "one",
    title: "First duplicate",
    channel: "Original Channel",
    channelUrl: "https://www.youtube.com/@stable",
    durationSeconds: 120,
  },
  {
    videoId: "unknown-duration",
    channel: "Other",
    durationSeconds: null,
  },
];
const importContext = {
  fileName: "watchlater.json",
  importedAt: "2026-07-30T12:05:00.000Z",
  sourceSchemaVersion: 1,
  sourceExportedAt: exportedAt,
  sourceMode: "",
  ageAnchorAt: exportedAt,
};

assert.equal(config.DEFAULT_IMPORT_HISTORY_LIMIT, 6);
assert.equal(config.MAX_IMPORT_HISTORY_LIMIT, 12);
assert.equal(
  importComparison.createDatasetFingerprint(videos),
  importComparison.createDatasetFingerprint([...videos].reverse()),
  "dataset fingerprints must not depend on input order",
);
assert.notEqual(
  importComparison.createDatasetFingerprint(videos),
  importComparison.createDatasetFingerprint(videos.map(video => (
    video.videoId === "two" ? { ...video, durationSeconds: 181 } : video
  ))),
  "stable metadata changes must alter the dataset fingerprint",
);

const snapshot = importHistory.createImportSnapshot(videos, importContext);
assert.equal(snapshot.schemaVersion, 1);
assert.match(snapshot.id, /^import-[a-f0-9]{16}$/);
assert.equal(snapshot.videoCount, 3);
assert.equal(snapshot.knownDurationCount, 2);
assert.equal(snapshot.totalDurationSeconds, 300);
assert.deepEqual(
  [...snapshot.videos].map(video => video.videoId),
  ["one", "two", "unknown-duration"],
);
assert.equal(snapshot.videos[0].channelKey, "url:@stable");
assert.equal(snapshot.source.exportedAt, exportedAt);
assert.equal(Object.hasOwn(snapshot.videos[0], "title"), false);
assert.equal(
  importHistory.createImportSnapshot([], { fileName: "legacy.json" }).source.schemaVersion,
  null,
);

const firstAppend = importHistory.appendImportSnapshot([], videos, importContext);
assert.equal(firstAppend.added, true);
assert.equal(firstAppend.duplicate, false);
assert.equal(firstAppend.history.length, 1);
const duplicateAppend = importHistory.appendImportSnapshot(
  firstAppend.history,
  [...videos].reverse(),
  { ...importContext, importedAt: "2026-07-30T13:00:00.000Z" },
);
assert.equal(duplicateAppend.added, false);
assert.equal(duplicateAppend.duplicate, true);
assert.equal(duplicateAppend.history.length, 1);

const nextSourceAppend = importHistory.appendImportSnapshot(
  duplicateAppend.history,
  videos,
  {
    ...importContext,
    importedAt: "2026-07-31T12:05:00.000Z",
    sourceExportedAt: "2026-07-31T12:00:00.000Z",
  },
);
assert.equal(nextSourceAppend.added, true);
assert.equal(nextSourceAppend.history.length, 2);

let cappedHistory = [];
for (let index = 0; index < 8; index++) {
  cappedHistory = importHistory.appendImportSnapshot(
    cappedHistory,
    [{ videoId: `video-${index}`, channel: "Channel", durationSeconds: index }],
    {
      fileName: `watchlater-${index}.json`,
      importedAt: `2026-07-${String(20 + index).padStart(2, "0")}T12:00:00.000Z`,
    },
  ).history;
}
assert.equal(cappedHistory.length, 6);
assert.equal(cappedHistory[0].videos[0].videoId, "video-2");
assert.equal(cappedHistory[5].videos[0].videoId, "video-7");

const twelve = importHistory.normalizeImportHistory(
  Array.from({ length: 14 }, (_, index) => importHistory.createImportSnapshot(
    [{ videoId: `hard-cap-${index}` }],
    { fileName: `hard-cap-${index}.json` },
  )),
  99,
);
assert.equal(twelve.length, 12, "the configurable limit must never exceed the hard cap");
assert.deepEqual(plain(importHistory.normalizeImportHistory([
  null,
  {},
  { schemaVersion: 2, id: "bad", videos: [] },
  snapshot,
  snapshot,
])), [plain(snapshot)], "corrupt entries are skipped and duplicate IDs collapse");
assert.deepEqual(plain(importHistory.normalizeImportHistory("{broken")), []);

const oldChannelImport = importHistory.createImportSnapshot([
  {
    videoId: "persisted",
    channel: "Original channel name",
    channelUrl: "https://youtube.com/@stable",
    durationSeconds: 120,
  },
  {
    videoId: "removed",
    channel: "Original channel name",
    channelUrl: "https://youtube.com/@stable",
    durationSeconds: null,
  },
], {
  fileName: "history-1.json",
  importedAt: "2026-07-01T12:00:00.000Z",
});
const newChannelImport = importHistory.createImportSnapshot([
  {
    videoId: "persisted",
    channel: "Renamed channel",
    channelUrl: "https://youtube.com/@stable",
    durationSeconds: 120,
  },
  {
    videoId: "current-new",
    channel: "Renamed channel",
    channelUrl: "https://youtube.com/@stable",
    durationSeconds: 60,
  },
], {
  fileName: "history-2.json",
  importedAt: "2026-07-15T15:30:00.000Z",
});
const oneSnapshotTrend = importHistory.buildImportTrend(
  [oldChannelImport],
  {
    channelKey: "url:@stable",
    currentVideoIds: ["persisted", "current-new"],
  },
);
assert.equal(oneSnapshotTrend.available, false);
assert.equal(oneSnapshotTrend.totalSnapshots, 1);
assert.equal(oneSnapshotTrend.minimumSnapshots, 2);

const renamedChannelTrend = importHistory.buildImportTrend(
  [oldChannelImport, newChannelImport],
  {
    channelKey: "url:@stable",
    currentVideoIds: ["persisted", "current-new"],
  },
);
assert.equal(renamedChannelTrend.available, true);
assert.equal(renamedChannelTrend.presentSnapshots, 2);
assert.equal(renamedChannelTrend.totalSnapshots, 2);
assert.equal(renamedChannelTrend.intervalStartAt, "2026-07-01T12:00:00.000Z");
assert.equal(renamedChannelTrend.intervalEndAt, "2026-07-15T15:30:00.000Z");
assert.equal(renamedChannelTrend.points[0].channelName, "Original channel name");
assert.equal(renamedChannelTrend.points[1].channelName, "Renamed channel");
assert.equal(renamedChannelTrend.points[0].knownDurationCount, 1);
assert.equal(renamedChannelTrend.points[0].totalDurationSeconds, 120);
assert.equal(renamedChannelTrend.points[0].durationCoveragePercent, 50);
assert.equal(renamedChannelTrend.points[0].newCount, null);
assert.equal(renamedChannelTrend.points[1].newCount, 1);
assert.equal(renamedChannelTrend.points[1].removedCount, 1);
assert.equal(renamedChannelTrend.points[0].currentVideoSurvivalCount, 1);
assert.equal(renamedChannelTrend.points[0].currentVideoSurvivalPercent, 50);
assert.equal(renamedChannelTrend.points[1].currentVideoSurvivalCount, 2);
assert.equal(renamedChannelTrend.points[1].currentVideoSurvivalPercent, 100);
assert.deepEqual(
  plain(renamedChannelTrend.currentVideoSurvivalRates.map(rate => [
    rate.numerator,
    rate.denominator,
    rate.percent,
  ])),
  [[1, 2, 50], [2, 2, 100]],
);

const sixSnapshotTrend = importHistory.buildImportTrend(
  Array.from({ length: 6 }, (_, index) => importHistory.createImportSnapshot(
    Array.from({ length: index + 1 }, (__, videoIndex) => ({
      videoId: `six-${videoIndex}`,
      channel: "Six imports",
      durationSeconds: videoIndex % 2 ? null : 60,
    })),
    {
      fileName: `six-${index}.json`,
      importedAt: `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    },
  )),
  {
    channelKey: "name:six imports",
    currentVideoIds: Array.from({ length: 6 }, (_, index) => `six-${index}`),
  },
);
assert.equal(sixSnapshotTrend.available, true);
assert.equal(sixSnapshotTrend.totalSnapshots, 6);
assert.equal(sixSnapshotTrend.presentSnapshots, 6);
assert.equal(sixSnapshotTrend.points[5].videoCount, 6);
assert.equal(sixSnapshotTrend.points[5].knownDurationCount, 3);
assert.equal(sixSnapshotTrend.points[5].newCount, 1);
assert.equal(sixSnapshotTrend.points[5].removedCount, 0);

console.log("import history test passed");
