import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shared = readFileSync(new URL("../src/entityExport.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const places = readFileSync(new URL("../src/publicRecords.tsx", import.meta.url), "utf8");
const virtualInstruments = readFileSync(new URL("../src/virtualInstruments.tsx", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("supported entity pages use one accessible export tab", () => {
  assert.match(shared, /role="tablist"/);
  assert.match(shared, /aria-controls=\{tabIdentifier/);
  assert.match(shared, /role="tabpanel"/);
  assert.match(shared, /Native MODAVIS formats/);
  assert.match(shared, /Semantic profiles/);
  assert.match(shared, /Source-dependent structured data/);

  assert.match(app, /StructuredNamePage[\s\S]*?<EntityPageTabs[\s\S]*?<EntityExportPanel manifest=\{name\.export\}/);
  assert.match(app, /CanonicalActorPage[\s\S]*?<EntityPageTabs[\s\S]*?<EntityExportPanel manifest=\{actor\.export\}/);
  assert.match(app, /function ExportTab[\s\S]*?<EntityExportPanel manifest=\{organ\.export\}/);
  assert.match(places, /PublicPlacePage[\s\S]*?<EntityPageTabs[\s\S]*?<EntityExportPanel manifest=\{place\.export\}/);
  assert.match(virtualInstruments, /PublicVirtualInstrumentDetail[\s\S]*?<EntityPageTabs[\s\S]*?<EntityExportPanel manifest=\{instrument\.export\}/);
});

test("entity export tabs preserve browser history and canonical overview URLs", () => {
  assert.match(shared, /window\.addEventListener\("popstate", handlePopState\)/);
  assert.match(shared, /url\.searchParams\.delete\("tab"\)/);
  assert.match(shared, /url\.searchParams\.set\("tab", tab\)/);
  assert.match(shared, /window\.history\[replace \? "replaceState" : "pushState"\]/);
});

test("legacy embedded export panels are removed", () => {
  assert.doesNotMatch(places, /PublicExportPanel/);
  assert.doesNotMatch(virtualInstruments, /vpi-export/);
  assert.doesNotMatch(app, /actor-export-section/);
});

test("local export downloads are forwarded to the Navigator backend", () => {
  assert.match(viteConfig, /"\/dataset": navigatorBackendUrl/);
});
