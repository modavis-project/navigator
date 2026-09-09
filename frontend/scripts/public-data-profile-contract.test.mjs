import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../src/api.ts", import.meta.url), "utf8");
const surfaces = await readFile(new URL("../src/surfaces.ts", import.meta.url), "utf8");
const releaseGuide = await readFile(new URL("../src/releaseGuide.tsx", import.meta.url), "utf8");

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
  assert.match(app, /<option value="stops">Most documented stops<\/option>/);
  assert.match(app, /organSort === "stops" \|\| organSort === "label"/);
  assert.match(app, /value\.dataProfile === "pod-1\.5-public"[\s\S]*?setOrganSort\("stops"\)[\s\S]*?setReleaseContextResolved\(true\)/);
  assert.match(app, /Stop count indicates instrument scale, but it is not a pipe count/);
  assert.match(app, /!publicProjection && <option key="recent" value="recent"/);
  assert.match(app, /publicDatasetProfile \? datasetPublicationLabel : "Closed alpha"/);
  assert.match(app, /publicDatasetProfile \? "About the data" : "How to use the alpha"/);
  assert.match(app, /releaseContext && !publicDatasetProfile && activeSection !== "release-guide"/);
  assert.match(releaseGuide, /context\.dataProfile === "pod-1\.5-public"/);
  assert.match(releaseGuide, /What the public Navigator includes/);
  assert.match(releaseGuide, /Dataset and reproducibility details/);
  assert.match(releaseGuide, /What is not shown publicly/);
  assert.doesNotMatch(app, /Choose a reliable starting point for this alpha release/);
});

test("unsupported direct routes return to Explore after capability discovery", () => {
  assert.match(app, /surfaceAvailableForCapabilities\(activeSection, publicCapabilities\)/);
  assert.match(app, /window\.history\.replaceState\(null, "", SECTION_PATHS\.explore\)/);
});

test("public literature and tuning systems remain linked without reviewer evidence", () => {
  assert.match(surfaces, /id: "literature"[\s\S]*?label: "Literature"/);
  assert.match(surfaces, /id: "temperaments"[\s\S]*?label: "Tuning systems"/);
  assert.match(app, /function CentVectorSparkline/);
  assert.match(app, /function TemperamentFingerprint/);
  assert.match(app, /Equal temperament is the reference circle/);
  assert.match(app, /!publicProjection && record\.sourceRecordId/);
  assert.match(app, /activeTab === "overview" && !publicProjection/);
  assert.match(app, /!publicProjection && <section className="panel-block">[\s\S]*?Provenance documents and entity refs/);
});

test("public media and literature actions remain bounded and human-readable", () => {
  assert.match(app, /const pageSize = 24/);
  assert.match(app, /aria-label="Media pages"/);
  assert.match(app, /item\.publicAccessLinks\?\.\[0\]/);
  assert.doesNotMatch(app, />IIIF manifest<\/a>/);
});
