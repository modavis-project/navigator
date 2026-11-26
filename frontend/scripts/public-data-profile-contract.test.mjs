import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../src/api.ts", import.meta.url), "utf8");
const requestCache = await readFile(new URL("../src/requestCache.ts", import.meta.url), "utf8");
const surfaces = await readFile(new URL("../src/surfaces.ts", import.meta.url), "utf8");
const releaseGuide = await readFile(new URL("../src/releaseGuide.tsx", import.meta.url), "utf8");
const temperaments = await readFile(new URL("../src/Temperaments.tsx", import.meta.url), "utf8");

test("instance discovery revalidates a previous deployment's browser cache", async () => {
  const current = { capabilities: ["catalog", "entity_exports"], readSnapshot: "new" };
  const stale = { capabilities: ["catalog"] };
  const requests = [];
  const shared = { AbortSignal, AbortController, DOMException, setTimeout, clearTimeout, fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, text: async () => JSON.stringify(options.cache === "no-cache" ? current : stale) };
  } };
  const cacheContext = { exports: {}, ...shared };
  vm.runInNewContext(ts.transpileModule(requestCache, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, cacheContext);
  const context = { exports: {}, ...shared, require: name => {
    assert.equal(name, "./requestCache");
    return cacheContext.exports;
  } };
  vm.runInNewContext(ts.transpileModule(api, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const result = await context.exports.fetchReleaseContext();
  assert.equal(requests[0].url, "/api/release-context");
  assert.equal(requests[0].options.cache, "no-cache");
  assert.equal(requests[0].options.signal.aborted, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), current);
  await context.exports.publicGetJson("/api/temperaments");
  assert.equal(requests[1].options.headers["X-MODAVIS-POD-Snapshot"], current.readSnapshot);
});

test("release context carries the public data profile and capability contract", () => {
  assert.match(api, /dataProfile\?: string/);
  assert.match(api, /capabilities\?: string\[\]/);
  assert.match(surfaces, /surfaceAvailableForCapabilities/);
  assert.match(surfaces, /contribute: "contributions"/);
  assert.match(surfaces, /vmi: "virtual_instruments"/);
});

test("public profile removes unsupported navigation and actor controls", () => {
  assert.match(app, /PUBLIC_PRIMARY_SURFACES\.filter\(\(item\) => surfaceAvailableForCapabilities/);
  assert.match(app, /PUBLIC_COLLECTION_SURFACES\.filter\(\(item\) => surfaceAvailableForCapabilities/);
  assert.match(app, /publicCapabilities\.includes\("authentication"\)/);
  assert.match(app, /publicCapabilities\.includes\("vocabulary"\)/);
  assert.match(app, /capabilities\.includes\("contributions"\)/);
  assert.match(app, /capabilities\.includes\("research"\)/);
  assert.match(app, /capabilities\.includes\("media"\)/);
  assert.match(app, /mediaCapabilityAvailable/);
  assert.match(app, /publicProjection=\{publicDatasetProfile\}/);
  assert.match(app, /<option value="stops">\{t\("organs.filters.mostStops", "Most documented stops", "Meiste dokumentierte Register"\)\}<\/option>/);
  assert.match(app, /Stop count indicates instrument scale, but it is not a pipe count/);
  assert.match(app, /!publicProjection && <option key="recent" value="recent"/);
  assert.match(app, /publicDatasetProfile \? datasetPublicationLabel : "Closed alpha"/);
  assert.match(app, /publicDatasetProfile \? t\("explore.about", "About the data", "Über die Daten"\) : "How to use the alpha"/);
  assert.match(app, /releaseContext && !publicDatasetProfile && activeSection !== "release-guide"/);
  assert.match(releaseGuide, /context\.dataProfile === "pod-1\.5-public"/);
  assert.match(releaseGuide, /What the public Navigator includes/);
  assert.match(releaseGuide, /Dataset and reproducibility details/);
  assert.match(releaseGuide, /What is not shown publicly/);
  assert.doesNotMatch(app, /Choose a reliable starting point for this alpha release/);
});

test("catalogue route synchronization uses requested filters and sort", () => {
  assert.match(app, /normalizeOrganCatalogFilters\(requestedOrganFilters, publicDatasetProfile, mediaCapabilityAvailable\)/);
  assert.match(app, /normalizeOrganCatalogSort\(requestedOrganSort, publicDatasetProfile, mediaCapabilityAvailable\)/);
  assert.match(app, /!sameOrganFilters\(nextOrganFilters, requestedOrganFilters\)\) setRequestedOrganFilters\(nextOrganFilters\)/);
  assert.match(app, /nextOrganSort !== requestedOrganSort\) setRequestedOrganSort\(nextOrganSort\)/);
});

test("unsupported direct routes return to Explore after capability discovery", () => {
  assert.match(app, /surfaceAvailableForCapabilities\(activeSection, publicCapabilities\)/);
  assert.match(app, /window\.history\.replaceState\(null, "", SECTION_PATHS\.explore\)/);
});

test("public literature and tuning systems remain linked without reviewer evidence", () => {
  assert.match(surfaces, /id: "literature"[\s\S]*?label: "Literature"/);
  assert.match(surfaces, /id: "temperaments"[\s\S]*?label: "Tuning systems"/);
  assert.match(temperaments, /function CentVectorSparkline/);
  assert.match(temperaments, /function TemperamentFingerprint/);
  assert.match(temperaments, /Equal temperament is the reference circle/);
  assert.match(temperaments, /!publicProjection && record\.sourceRecordId/);
  assert.match(temperaments, /activeTab === "overview" && !publicProjection/);
  assert.match(temperaments, /!publicProjection && <section className="panel-block">[\s\S]*?Provenance documents and entity refs/);
});

test("public media and literature actions remain bounded and human-readable", () => {
  assert.match(app, /const pageSize = 24/);
  assert.match(app, /aria-label=\{t\("organ\.media\.grid\.pages", "Media pages", "Medienseiten"\)\}/);
  assert.match(app, /item\.publicAccessLinks\?\.\[0\]/);
  assert.doesNotMatch(app, />IIIF manifest<\/a>/);
});
