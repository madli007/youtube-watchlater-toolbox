const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const ENTRY_PATH = path.join(PROJECT_ROOT, "docs", "index.html");

function getAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? match[2] : "";
}

function isLocalAsset(reference) {
  return reference
    && !reference.startsWith("#")
    && !/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(reference)
    && !/^(?:data|blob|mailto|javascript):/i.test(reference);
}

function resolveLocalAsset(entryPath, reference) {
  const pathOnly = reference.split(/[?#]/, 1)[0];
  return path.resolve(path.dirname(entryPath), decodeURIComponent(pathOnly));
}

function getLinkedAssets(html, entryPath) {
  const assets = [];

  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = match[1];
    const rel = getAttribute(attributes, "rel").toLowerCase().split(/\s+/);
    const href = getAttribute(attributes, "href");
    if (isLocalAsset(href)) {
      const type = rel.includes("stylesheet") ? "CSS" : "linked";
      assets.push({ type, reference: href, path: resolveLocalAsset(entryPath, href) });
    }
  }

  for (const match of html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/gi)) {
    const src = getAttribute(match[1], "src");
    if (isLocalAsset(src)) {
      assets.push({ type: "JavaScript", reference: src, path: resolveLocalAsset(entryPath, src) });
    }
  }

  for (const match of html.matchAll(/<(?:img|source|video|audio)\b([^>]*)>/gi)) {
    const src = getAttribute(match[1], "src");
    if (isLocalAsset(src)) {
      assets.push({ type: "media", reference: src, path: resolveLocalAsset(entryPath, src) });
    }
  }

  return assets;
}

function assertLinkedAssetsExist(html, entryPath) {
  for (const asset of getLinkedAssets(html, entryPath)) {
    assert.ok(
      fs.existsSync(asset.path),
      `Missing ${asset.type} asset "${asset.reference}" referenced by ${entryPath}`,
    );
  }
}

function loadScriptSources(html, entryPath) {
  const scripts = [];

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = getAttribute(match[1], "src");
    if (src) {
      if (!isLocalAsset(src)) {
        continue;
      }
      const scriptPath = resolveLocalAsset(entryPath, src);
      assert.ok(
        fs.existsSync(scriptPath),
        `Missing JavaScript asset "${src}" referenced by ${entryPath}`,
      );
      scripts.push({
        kind: "external",
        path: scriptPath,
        source: fs.readFileSync(scriptPath, "utf8"),
      });
    } else if (match[2].trim()) {
      scripts.push({
        kind: "inline",
        path: entryPath,
        source: match[2],
      });
    }
  }

  assert.ok(scripts.length > 0, `No application scripts found in ${entryPath}`);
  return scripts;
}

function assertDomContract(html, scriptSources) {
  const idMatches = Array.from(
    html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi),
    match => match[2],
  );
  const declaredIds = new Set(idMatches);
  assert.equal(declaredIds.size, idMatches.length, "DOM IDs must be unique");

  const referencedIds = scriptSources.flatMap(({ source }) => Array.from(
    source.matchAll(/document\.getElementById\(\s*(["'])(.*?)\1\s*\)/g),
    match => match[2],
  ));
  assert.deepEqual(
    referencedIds.filter(id => !declaredIds.has(id)),
    [],
    "all referenced DOM IDs must exist",
  );
}

function resolveTriageEntry() {
  assert.ok(
    fs.existsSync(ENTRY_PATH),
    `Triage entry HTML not found: ${ENTRY_PATH}`,
  );
  return ENTRY_PATH;
}

function loadTriageApp() {
  const entryPath = resolveTriageEntry();
  const html = fs.readFileSync(entryPath, "utf8");
  assertLinkedAssetsExist(html, entryPath);
  const scripts = loadScriptSources(html, entryPath);
  assertDomContract(html, scripts);

  return {
    entryPath,
    html,
    scripts,
    source: scripts.map(script => script.source).join("\n;\n"),
  };
}

module.exports = {
  assertDomContract,
  assertLinkedAssetsExist,
  getLinkedAssets,
  loadScriptSources,
  loadTriageApp,
  resolveTriageEntry,
};
