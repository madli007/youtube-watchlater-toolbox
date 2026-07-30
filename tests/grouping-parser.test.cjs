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

const { config, domain } = sandbox.WatchLaterApp;
const { grouping } = domain;
const plain = value => JSON.parse(JSON.stringify(value));
const fixtures = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "tests/fixtures/grouping-titles.json"),
  "utf8",
));

assert.equal(Object.isFrozen(config.GROUPING_WRAPPER_TERMS), true);
assert.ok(config.GROUPING_WRAPPER_TERMS.includes("reacting to"));

for (const fixture of fixtures) {
  const originalVideo = plain(fixture.video);
  const parsed = grouping.parseSeriesTitle(fixture.video);
  assert.deepEqual(fixture.video, originalVideo, `${fixture.name}: parser must not mutate the video`);
  assert.equal(parsed.base, fixture.base, `${fixture.name}: base`);
  assert.equal(parsed.sequence?.format ?? null, fixture.format, `${fixture.name}: format`);
  if ("kind" in fixture) {
    assert.equal(parsed.sequence?.kind, fixture.kind, `${fixture.name}: kind`);
  }
  if ("season" in fixture) {
    assert.equal(parsed.sequence?.season, fixture.season, `${fixture.name}: season`);
  }
  if ("episodes" in fixture) {
    assert.deepEqual(plain(parsed.sequence?.episodes), fixture.episodes, `${fixture.name}: episodes`);
  }
  if ("parts" in fixture) {
    assert.deepEqual(plain(parsed.sequence?.parts), fixture.parts, `${fixture.name}: parts`);
  }
  if ("qualifier" in fixture) {
    assert.equal(parsed.sequence?.qualifier, fixture.qualifier, `${fixture.name}: qualifier`);
  }
  if ("range" in fixture) {
    assert.deepEqual(plain(parsed.sequence?.range), fixture.range, `${fixture.name}: range`);
  }
  if ("channelKey" in fixture) {
    assert.equal(parsed.channelKey, fixture.channelKey, `${fixture.name}: channel key`);
  }
  if ("wrappers" in fixture) {
    assert.deepEqual(plain(parsed.wrappers), fixture.wrappers, `${fixture.name}: wrappers`);
  }
  for (const warning of fixture.warnings || []) {
    assert.ok(parsed.warnings.includes(warning), `${fixture.name}: warning ${warning}`);
  }
  assert.ok(parsed.reasons.length >= 2, `${fixture.name}: explainable reasons`);
  assert.match(parsed.debugReason, /base:/, `${fixture.name}: debug reason`);
}

const parsedInitialism = grouping.parseSeriesTitle({
  title: "The Last of Us Episode 9",
  channel: "Reactors",
});
assert.equal(parsedInitialism.initialism, "tlou");
assert.deepEqual(plain(parsedInitialism.tokens), ["last", "us"]);

const grouped = grouping.buildSeriesGroups([
  { videoId: "one", title: "Reacting to The Last of Us S01E01", channel: "Reactors" },
  { videoId: "two", title: "The Last of Us 1x02 Full Reaction", channel: "Reactors" },
]);
assert.equal(grouped.length, 1);
assert.equal(grouped[0].label, "The last of us");

console.log("grouping parser test passed");
