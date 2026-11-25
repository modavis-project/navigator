import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/vocabularyRecords.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
class PublicReadError extends Error { constructor(message, status) { super(message); this.status = status; } }
const pin = "a".repeat(64);
function load(react = React) {
  const shared = {URL, URLSearchParams, AbortController, DOMException, Error,
    window: { location: { origin: "https://navigator.test", pathname: "/vocab/activities", search: "" } }};
  const modules = new Map();
  let readerContext;
  function local(name) {
    if (modules.has(name)) return modules.get(name);
    const exports = {}; modules.set(name, exports);
    const file = ["tsx", "ts"].map(extension => new URL(`../src/${name}.${extension}`, import.meta.url)).find(existsSync);
    const code = name === "vocabularyRecords" ? compiled : ts.transpileModule(readFileSync(file, "utf8"), {compilerOptions: {target: ts.ScriptTarget.ES2022,module: ts.ModuleKind.CommonJS,jsx: ts.JsxEmit.ReactJSX}}).outputText;
    const context = {...shared, exports,
      require: id => id === "react" ? react : id === "./requestCache" ? {PublicReadError}
        : id === "./api" ? {publicGetJson: () => {throw new Error("Unexpected request");}}
        : id.endsWith(".css") ? {} : id.startsWith("./") ? local(id.slice(2)) : require(id)};
    vm.runInNewContext(code, context);
    if (name === "vocabularyRecords") readerContext = context;
    return exports;
  }
  local("vocabularyRecords");
  return readerContext;
}

const context = load();
const api = context.exports;
const query = { q: "", offset: 0, limit: 30 };
const scheme = { code: "activities", name: "Activities", version: "2026-08-06", recordKind: "governed_scheme", conceptCount: 70, mappingCount: 0, snapshot: { metadataUrl: "/api/vocab/snapshots/activities", downloadBase: "/api/vocab/snapshots/activities" } };
const concept = {
  code: "activitype:repair", mdvsId: "MDVS:VOCB:EXAMPLE", preferredLabel: "Repair", definition: "Original definition;  spacing\nand a second line.",
  recordKind: "governed_concept", publicProjection: true, datasetVersion: "1.6.0", scheme,
  labels: [{ label: "Repair", languageCode: "en", languageName: "English", labelTypeId: 4 }, { label: "Reparatur", languageCode: "de", languageEndonym: "Deutsch", labelTypeId: 4 }],
  sourceMappingCount: 0, externalMappingCount: null, parentId: null,
};
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const links = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs)].map(match => ({ href: match[1].replaceAll("&amp;", "&"), text: match[2].replace(/<[^>]+>/g, "") }));

test("URL search, paging, recorded language and exact snapshot are retained", () => {
  const parsed = api.parseVocabularyReadingQuery(`?q=organ%20work&offset=30&limit=15&language_code=de&snapshot=${pin}`);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), { q: "organ work", offset: 30, limit: 15, language: "de", snapshot: pin });
  const url = new URL(api.vocabularyReadingHref("/vocab/activities", parsed, { offset: 0 }), "https://navigator.test");
  assert.equal(url.searchParams.get("q"), "organ work");
  assert.equal(url.searchParams.get("offset"), null);
  assert.equal(url.searchParams.get("snapshot"), pin);
  assert.equal(url.searchParams.get("language_code"), "de");
});

test("malformed, repeated, empty pins and unsupported query operands refuse explicitly", () => {
  for (const search of ["?snapshot=", "?snapshot=wrong", `?snapshot=${pin}&snapshot=${pin}`, "?offset=-1", "?offset=", "?limit=501", "?limit=0", "?q=a&q=b", "?language_code=", "?unknown=value"]) {
    assert.throws(() => api.parseVocabularyReadingQuery(search), error => error.status === 400, search);
  }
});

test("scheme loader resolves exact scheme before fetching the requested bounded view", async () => {
  const requests = [];
  const controller = new AbortController();
  const result = await api.loadVocabularyRecord({ schemeId: "activities" }, { ...query, q: "Reparatur", offset: 15, limit: 15, language: "de", snapshot: pin }, controller.signal,
    async (url, signal) => { requests.push({ url, signal }); return requests.length === 1 ? { items: [scheme] } : { items: [concept], total: 31, offset: 15, limit: 15, contentSha256: pin }; });
  assert.equal(result.kind, "scheme");
  const params = new URL(requests[1].url, "https://navigator.test").searchParams;
  assert.equal(params.get("scheme_code"), "activities");
  assert.equal(params.get("q"), "Reparatur");
  assert.equal(params.get("offset"), "15");
  assert.equal(params.get("language"), "de");
  assert.equal(params.has("language_code"), false, "human URL language_code is projected to the public API language operand");
  assert.equal(params.get("snapshot"), pin);
  assert.ok(requests.every(request => request.signal === controller.signal));
});

test("an unknown scheme and an aborted metadata read never broaden into an unfiltered catalogue", async () => {
  let calls = 0;
  await assert.rejects(api.loadVocabularyRecord({ schemeId: "missing" }, query, new AbortController().signal, async () => { calls++; return { items: [scheme] }; }), error => error.status === 404);
  assert.equal(calls, 1);
  const controller = new AbortController();
  calls = 0;
  await assert.rejects(api.loadVocabularyRecord({ schemeId: "activities" }, query, controller.signal, async () => { calls++; controller.abort(); return { items: [scheme] }; }), error => error.name === "AbortError");
  assert.equal(calls, 1);
});

test("concept requests carry the expected scheme and refuse wrong-scheme or unverified snapshot responses", async () => {
  let requested;
  const get = async url => { requested = url; return { concept, contentSha256: pin }; };
  await api.loadVocabularyRecord({ conceptId: concept.code, expectedSchemeId: "activities" }, { ...query, snapshot: pin }, new AbortController().signal, get);
  assert.match(requested, /scheme_code=activities&snapshot=/);
  await assert.rejects(api.loadVocabularyRecord({ conceptId: concept.code, expectedSchemeId: "wrong" }, query, new AbortController().signal, get), error => error.status === 404);
  await assert.rejects(api.loadVocabularyRecord({ conceptId: concept.code }, { ...query, snapshot: pin }, new AbortController().signal, async () => ({ concept })), error => error.status === 409);
});

test("scheme pagination and concept links retain query and exact displayed snapshot", () => {
  const html = render(api.VocabularySchemeReading, { scheme, list: { items: [concept], total: 70, offset: 30, limit: 30 }, query: { ...query, q: "repair", offset: 30 }, contentSha256: pin });
  assert.match(html, /70 governed concepts · whole scheme/);
  assert.match(html, /70 matching governed concepts/);
  for (const link of links(html).filter(link => ["Previous page", "Next page", "Repair"].includes(link.text))) {
    const url = new URL(link.href, "https://navigator.test");
    assert.equal(url.searchParams.get("q"), "repair");
    assert.equal(url.searchParams.get("snapshot"), pin);
  }
  assert.equal(links(html).filter(link => ["Previous page", "Next page"].includes(link.text)).length, 2);
});

test("an out-of-range page offers first-page recovery without claiming zero matches", () => {
  const html = render(api.VocabularySchemeReading, { scheme, list: { items: [], total: 70, offset: 90, limit: 30 }, query: { ...query, q: "repair", offset: 90, snapshot: pin } });
  assert.match(html, /This page is beyond the results/);
  assert.match(html, /70 matching governed concepts/);
  assert.doesNotMatch(html, /No concepts match/);
  const href = links(html).find(link => link.text === "Go to first page").href;
  assert.equal(new URL(href, "https://navigator.test").searchParams.get("offset"), null);
  assert.equal(new URL(href, "https://navigator.test").searchParams.get("snapshot"), pin);
});

test("a genuine empty search offers scheme-scoped recovery and retains snapshot", () => {
  const html = render(api.VocabularySchemeReading, { scheme, list: { items: [], total: 0, offset: 0, limit: 30 }, query: { ...query, q: "missing", snapshot: pin } });
  assert.match(html, /No concepts match this view/);
  const href = links(html).find(link => link.text === "Show all records in this scheme").href;
  assert.equal(new URL(href, "https://navigator.test").pathname, "/vocab/activities");
  assert.equal(new URL(href, "https://navigator.test").searchParams.get("q"), null);
  assert.equal(new URL(href, "https://navigator.test").searchParams.get("snapshot"), pin);
});

test("recorded definitions, labels and identity stay verbatim without invented hierarchy or preferred-label roles", () => {
  const html = render(api.VocabularyConceptReading, { concept, query, contentSha256: pin });
  assert.ok(html.includes(concept.definition));
  assert.ok(html.includes("Reparatur"));
  assert.ok(html.includes(concept.mdvsId));
  assert.match(html, /Recorded full label/);
  assert.match(html, /No parent relation is included in this snapshot/);
  assert.doesNotMatch(html, /Top-level concept|SKOS preferred label/);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.match(html, /<h1[^>]*>Repair<\/h1>/);
  assert.match(html, /Metadata JSON/);
  assert.ok(links(html).some(link => link.href === `/api/vocab/snapshots/activities.ttl?snapshot=${pin}`));
});

test("source mappings, public event assertions and reverse evidence retain distinct counts and full destinations", () => {
  const item = { ...concept, sourceMappingCount: 1, sourceTermMappings: [{ mdvsId: "MAP:1", mappingKind: "exact", reviewStatus: "accepted", scopeNote: "Source scope retained.", sourceTerm: { mdvsId: "TERM:A/B", rawTerm: "Original term", sourceKey: "source-a", sourceTable: "events", sourceField: "type", termClass: "event" } }],
    publicEventUsage: { scope: "Processing assertions; separate from registry mappings.", occurrenceCount: 8, groupCount: 2, groupsLimited: true, groups: [{ sourceKey: "source-a", sourceWording: "Original event wording", mappingKind: "source mapping", occurrenceCount: 8, sourceRecordCount: 3, eventUrls: ["/events/EVENT%3A1"] }] },
    reverseLinkedGroupTotal: 4, reverseLinkedGroupsLimited: true, reverseLinkedGroups: [{ itemKind: "documented_event", sourceGroup: "source-a", itemCount: 9, sourceRecordCount: 3, subjectCount: 2 }] };
  const html = render(api.VocabularyConceptReading, { concept: item, query });
  assert.ok(links(html).some(link => link.href === "/vocab/source-terms/TERM%3AA%2FB"));
  assert.ok(links(html).some(link => link.href === "/events/EVENT%3A1"));
  assert.match(html, /events.type/);
  assert.match(html, /Source scope retained/);
  assert.match(html, /8 event assertions/);
  assert.match(html, /Showing 1 of 2 groups/);
  assert.match(html, /the reported total is 4/);
});

test("schema categories are never advertised as controlled concepts or downloadable vocabulary snapshots", () => {
  const category = { code: "person", preferredLabel: "Person", definition: "A retained schema category.", recordKind: "schema_category", scheme: { code: "modavis_entity_types", name: "Public entity types", version: "1.6.0" }, labels: [] };
  const html = render(api.VocabularyConceptReading, { concept: category, query });
  assert.match(html, /Schema category/);
  assert.match(html, /Copy category code/);
  assert.doesNotMatch(html, /Controlled vocabulary concept|SKOS \/ Turtle|Source-term registry mappings/);
  assert.ok(links(html).some(link => link.href === "/persons"));
  const list = render(api.VocabularySchemeReading, { scheme: { ...category.scheme, recordKind: "schema_categories", categoryCount: 2, conceptCount: 0 }, list: { items: [category], total: 2, offset: 0, limit: 30 }, query });
  assert.match(list, /2 schema categories · whole category set/);
  assert.doesNotMatch(list, /0 governed concepts|Cite and download/);
});

test("loading never announces a measured zero, while refused pins offer explicit recovery without blind retry", () => {
  const pending = render(api.PublicVocabularyRecords, { schemeId: "activities" });
  assert.match(pending, /role="status"/);
  assert.match(pending, /Loading the requested vocabulary/);
  assert.doesNotMatch(pending, /0 matching|No concepts/);
  for (const status of [400, 409]) {
    const html = render(api.VocabularyReadingFailure, { error: { status, message: "Requested vocabulary snapshot is unavailable" }, path: "/vocab/activities", onRetry: () => {} });
    assert.match(html, /role="alert"/);
    assert.match(html, /tabindex="-1"/);
    assert.doesNotMatch(html, /Try again/);
    assert.ok(links(html).some(link => link.href === "/vocab/activities" && link.text.includes("without view parameters")));
  }
});

test("external links preserve ordinary HTTPS references and refuse executable or protocol-relative URLs", () => {
  assert.equal(api.safeVocabularyHref("https://example.org/concept/a"), "https://example.org/concept/a");
  for (const unsafe of ["javascript:alert(1)", "data:text/html,a", "//outside.test/a", "/\\outside.test/a"]) assert.equal(api.safeVocabularyHref(unsafe), null);
  const html = render(api.VocabularyConceptReading, { concept: { ...concept, externalMappings: [{ externalUri: "javascript:alert(1)", mappingKind: "related" }] }, query });
  assert.doesNotMatch(html, /href="javascript:/);
});

test("request replacement aborts the owned reader and late completion cannot replace newer data", async () => {
  let cursor = 0;
  const values = [];
  const effects = [];
  const local = load({ ...React, useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], value => { values[index] = typeof value === "function" ? value(values[index]) : value; }]; }, useEffect(effect) { effects.push(effect); } });
  const renderHook = (key, reader) => { cursor = 0; return local.useReading(key, reader); };
  let finishOld, oldSignal;
  renderHook("old", signal => { oldSignal = signal; return new Promise(resolve => { finishOld = resolve; }); });
  const cleanup = effects.shift()();
  cleanup();
  renderHook("new", async () => ({ title: "Current" }));
  effects.shift()();
  await Promise.resolve();
  finishOld({ title: "Stale" });
  await Promise.resolve();
  assert.equal(oldSignal.aborted, true);
  const result = renderHook("new", async () => ({}));
  assert.equal(result.data.title, "Current");
});

test("query navigation creates a native Back entry and modifier clicks retain browser behavior", () => {
  const local = load();
  const calls = [];
  local.window.history = { state: { retained: "state" }, pushState: (...args) => calls.push(args) };
  local.PopStateEvent = class { constructor(type) { this.type = type; } };
  local.window.dispatchEvent = event => calls.push(event.type);
  let prevented = 0;
  const event = { button: 0, preventDefault: () => prevented++, currentTarget: { getAttribute: () => "/vocab/activities?q=repair&offset=30" } };
  local.followQuery({ ...event, ctrlKey: true });
  assert.equal(prevented, 0);
  assert.equal(calls.length, 0);
  local.followQuery(event);
  assert.equal(prevented, 1);
  assert.equal(calls[0][0].retained, "state");
  assert.equal(calls[0][0].vocabularyResultsFocus, true);
  assert.equal(calls[0][2], "/vocab/activities?q=repair&offset=30");
  assert.equal(calls[1], "popstate");
});
