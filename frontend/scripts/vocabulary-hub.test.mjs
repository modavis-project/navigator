import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createIntl } from "react-intl";
import ts from "typescript";

const require = createRequire(import.meta.url);
const modules = new Map();
const browserLocation = { pathname: "/vocab/usage/stops", search: "", origin: "https://example.test" };
function source(name) {
  const path = ["tsx", "ts"].map(extension => new URL(`../src/${name}.${extension}`, import.meta.url)).find(existsSync);
  return ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
}
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  modules.set(name, exports);
  runInNewContext(source(name), { exports, URL, URLSearchParams, location: browserLocation,
    require: id => id.endsWith(".css") ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id) });
  return exports;
}
const hub = load("vocabularyHub");
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const noAction = () => {};
const collections = [
  { id: "activities", title: "Activity concepts", recordKind: "controlled", href: "/vocab/modavis_activity_types", count: 70, countUnit: "controlled concepts" },
  { id: "entities", title: "Entity categories", recordKind: "schema_categories", href: "/vocab/modavis_entity_types", count: 2, countUnit: "schema categories" },
  { id: "action", title: "Action designations", recordKind: "candidate", href: "/vocab/registry?scheme=urn%3Aaction&snapshot=registry-pin", count: 4, countUnit: "candidate concepts", description: "Accepted lexical mappings do not promote a candidate." },
  ...["activities", "stops", "divisions", "key_action", "stop_action", "windchests"].map(family => ({ id: `wording:${family}`, title: family, recordKind: "source_wording", href: `/vocab/usage/${family}?snapshot=core-pin`, count: 12, countUnit: "source wordings", group: "designations" })),
  { id: "omaro", title: "OMARO", recordKind: "external_reference", href: "/vocab/omaro", count: null, availability: "unavailable" },
];

test("catalogue renders controlled, schema, candidate and reference status with independent count units", () => {
  const html = render(hub.VocabularyDirectory, { collections });
  for (const text of ["70", "controlled concepts", "2", "schema categories", "4", "candidate concepts", "Unpublished candidates", "Separate reference dataset"]) assert.ok(html.includes(text), text);
  assert.match(html, /More source fields/);
  assert.match(html, /key_action/);
  assert.match(html, /stop_action/);
  assert.match(html, /windchests/);
  assert.match(html, /Currently unavailable in this runtime/);
  assert.doesNotMatch(html, /81 controlled|0 instrument/);
  const zero = render(hub.VocabularyCollectionCard, { collection: { ...collections[1], count: 0 } });
  assert.match(zero, /<strong>0<\/strong> schema categories/);
});

test("source previews stay bounded to the established three or one explicitly selected field", () => {
  const many = [...collections, ...Array.from({ length: 25 }, (_, index) => ({ id: `fixture-${index}`, title: `Fixture field ${index}`, recordKind: "source_wording", href: `/vocab/usage/fixture_${index}` }))];
  assert.deepEqual(Array.from(hub.sourcePreviewCollections(many, ""), item => item.id), ["wording:activities", "wording:stops", "wording:divisions"]);
  assert.deepEqual(Array.from(hub.sourcePreviewCollections(many, "key_action"), item => item.id), ["wording:key_action"]);
  assert.equal(hub.sourcePreviewCollections(many, "missing").length, 0);
  const html = render(hub.VocabularyCollectionCard, { collection: collections[6], query: "Mechanical" });
  assert.match(html, /snapshot=core-pin&amp;q=Mechanical/);
});

test("technical and division occurrence cards retain source record evidence without invented pitch or account links", () => {
  const item = { id: "fact-1", label: "Mechanical", href: "/source/source-1", sourceHref: "/source/source-1", source: "source-1", source_key: "orgbase", organHref: "/organs/organ-1", organLabel: "Fixture organ", description: null, year: null, date_kind: "source_listing", source_path: "specifications.key_action", sourceEvidence: { source_url: "https://example.org/source", source_revision_sha256: "source-pin" } };
  const technical = render(hub.UsageOccurrence, { item, family: "key_action" });
  assert.match(technical, /href="\/source\/source-1"/);
  assert.match(technical, /source-pin/);
  assert.match(technical, /specifications.key_action/);
  assert.doesNotMatch(technical, /Pitch wording|Division wording|description=|Open source account/);
  const division = render(hub.UsageOccurrence, { item: { ...item, description: "account-1", label: "Swell" }, family: "divisions" });
  assert.doesNotMatch(division, /Pitch wording|Division wording/);
  const stop = render(hub.UsageOccurrence, { item: { ...item, pitch: "8", division: "Great" }, family: "stops" });
  assert.match(stop, /Pitch wording/);
  assert.match(stop, /Division wording/);
});

test("snapshot and server failures never offer broader matching; explicit snapshot recovery uses the known binding", () => {
  const parameters = new URLSearchParams("term=Principal&source=orgbase&snapshot=old");
  const stale = render(hub.UsageError, { error: { status: 409, message: "Unavailable snapshot" }, parameters, go: noAction, retry: noAction, availableSnapshot: "new" });
  assert.doesNotMatch(stale, /Search wording containing|Include all sources/);
  assert.match(stale, /Open this selection on the available snapshot/);
  const server = render(hub.UsageError, { error: { status: 503, message: "Unavailable" }, parameters, go: noAction, retry: noAction });
  assert.match(server, /Retry this selection/);
  assert.doesNotMatch(server, /Search wording containing|Include all sources/);
  const missing = render(hub.UsageError, { error: { status: 404, message: "No occurrences" }, parameters, go: noAction, retry: noAction });
  assert.match(missing, /Search wording containing this text/);
});

test("usage API strips only presentation controls and collection links retain source and snapshot scope", () => {
  const parameters = new URLSearchParams("term=Principal&match=exact&source=orgbase&snapshot=core&section=organs&page=3&view=distribution&groupBy=country&distributionPage=2&zeros=yes&analysis=analysis-pin&dimension=country&bucket=s%3ADE");
  const api = hub.usageApiParameters(parameters);
  for (const key of ["term", "match", "source", "snapshot", "section", "page", "dimension", "bucket"]) assert.equal(api.get(key), parameters.get(key));
  for (const key of ["view", "groupBy", "distributionPage", "zeros", "analysis"]) assert.equal(api.has(key), false);
  const back = new URL(hub.usageCollectionLink("stops", parameters), "https://example.test");
  assert.equal(back.searchParams.get("source"), "orgbase");
  assert.equal(back.searchParams.get("snapshot"), "core");
  assert.equal(back.searchParams.has("term"), false);
  assert.equal(back.searchParams.has("dimension"), false);
  assert.equal(hub.usageQueryIssue(new URLSearchParams("snapshot=" )).status, 400);
  assert.equal(hub.usageQueryIssue(new URLSearchParams("source=one&source=two")).status, 400);
  assert.equal(hub.usageApiParameters(new URLSearchParams("snapshot=one&snapshot=two")).getAll("snapshot").length, 2);
});

test("automatic snapshot binding reuses only an exactly matching immutable response", () => {
  const before = "/api/vocab/usage/stops?term=Principal&source=orgbase";
  assert.equal(hub.sameBoundVocabularyResponse(before, `${before}&snapshot=core`, { publicCoreSha256: "core" }), true);
  for (const after of [`${before}&snapshot=old`, `${before}&snapshot=core&snapshot=core`, `${before}&snapshot=core&page=1`, "/api/vocab/usage/divisions?term=Principal&source=orgbase&snapshot=core"]) assert.equal(hub.sameBoundVocabularyResponse(before, after, { publicCoreSha256: "core" }), false);
  assert.equal(hub.sameBoundVocabularyResponse("/api/vocab/registry?q=mechanical", "/api/vocab/registry?q=mechanical&snapshot=registry", { registrySha256: "registry", publicCoreSha256: "core" }), true);
  assert.equal(hub.sameBoundVocabularyResponse("/api/vocab/registry?q=mechanical", "/api/vocab/registry?q=mechanical&snapshot=core", { registrySha256: "registry", publicCoreSha256: "core" }), false);
});

test("candidate detail requests preserve the exact URN and registry pin without leaking collection filters", () => {
  const parameters = new URLSearchParams({ concept: "urn:modavis:terminology-seed:key-mechanical", scheme: "urn:modavis:terminology-seed:action", q: "Mechanical", language: "en", offset: "4", limit: "2", snapshot: "registry-pin" });
  const api = hub.registryApiQuery(parameters);
  assert.deepEqual(Array.from(api.keys()).sort(), ["snapshot", "uri"]);
  assert.equal(api.get("uri"), parameters.get("concept"));
  assert.equal(api.get("snapshot"), "registry-pin");
  const back = new URL(hub.registryListLink(parameters), "https://example.test").searchParams;
  assert.equal(back.get("q"), "Mechanical"); assert.equal(back.get("offset"), "4"); assert.equal(back.get("scheme"), parameters.get("scheme"));
  const download = new URL(hub.registryExportLink(parameters, "jsonld"), "https://example.test").searchParams;
  assert.equal(download.get("snapshot"), "registry-pin"); assert.equal(download.get("scheme"), parameters.get("scheme"));
  for (const key of ["offset", "limit", "concept"]) assert.equal(download.has(key), false);
  assert.equal(download.get("format"), "jsonld");
  assert.equal(hub.registryQueryIssue(new URLSearchParams("concept=")).status, 400);
  assert.equal(hub.registryQueryIssue(new URLSearchParams("concept=one&concept=two")).status, 400);
  assert.equal(hub.registryQueryIssue(new URLSearchParams("unknown=one")).status, 400);
});

test("candidate record preserves authored definitions, labels, identifiers and separate action-field mappings", () => {
  const candidate = { id: "urn:modavis:terminology-seed:fixture", scheme: "urn:modavis:terminology-seed:action", label: { en: "Mechanical", de: "Mechanisch" }, definition: "Fixture definition with original qualification.", lifecycle: "candidate", mappingPurpose: "source_designation_search", canonicalPromotion: false,
    evidence: ["https://example.org/glossary"], usageLinks: ["key_action", "stop_action"].map(family => ({ family, familyTitle: family, status: "accepted_lexical_mapping", wordings: [{ label: "Mechanical", href: `/vocab/usage/${family}?term=Mechanical&match=exact&snapshot=core-pin` }], researchHref: `/use-cases/research-workbench?view=terms&mode=${family}&concept=urn%3Afixture&snapshot=core-pin` })) };
  const html = render(hub.CandidateRecord, { candidate, language: "de" });
  for (const text of [candidate.definition, candidate.id, candidate.scheme, "Mechanical", "Mechanisch", "Unpublished candidate", "accepted lexical mapping"]) assert.ok(html.includes(text), text);
  assert.match(html, /lang="de"/);
  assert.match(html, /usage\/key_action\?term=Mechanical&amp;match=exact&amp;snapshot=core-pin/);
  assert.match(html, /usage\/stop_action\?term=Mechanical&amp;match=exact&amp;snapshot=core-pin/);
  assert.match(html, /The language of a source occurrence is not inferred/);
  assert.equal(hub.candidateLabel(candidate, "de"), "Mechanisch");
});

test("out-of-range usage pages do not report impossible result ranges", () => {
  const html = render(hub.UsagePager, { data: { offset: 90, limit: 30, items: [], total: 14, hasMore: false }, term: true, parameters: new URLSearchParams("section=organs"), go: noAction });
  assert.match(html, /0–0 of 14 organs/);
  assert.doesNotMatch(html, /91–14/);
});

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}

test("actual usage form survives automatic pin hydration with unchanged draft key and selection controls", () => {
  const exports = {};
  const query = "?term=Principal&organ_q=Leipzig";
  const data = { publicCoreSha256: "core", title: "Stops", counts: { occurrences: 0, organs: 0, sourceRecords: 0, wordings: 0, accounts: 0 }, sourceOptions: [], mappings: [], variants: [], items: [], total: 0, offset: 0, limit: 30, match: "exact", capabilities: { distributions: false } };
  const cells = [query, "", 0, { url: "/api/vocab/catalogue", data: { collections } }, 0, { url: "/api/vocab/usage/stops?term=Principal&organ_q=Leipzig", data }];
  let cursor = 0;
  const react = { ...require("react"), useState(initial) { const slot = cursor++; if (!(slot in cells)) cells[slot] = typeof initial === "function" ? initial() : initial; return [cells[slot], value => { cells[slot] = value; }]; }, useEffect() {}, useRef: value => ({ current: value }) };
  let locale = "en";
  const presentation = {
    en: createIntl({ locale: "en-GB" }),
    de: createIntl({ locale: "de-DE" }),
  };
  const uiLocale = { useUiLocale: () => ({
    formatNumber: presentation[locale].formatNumber,
    t: (id, en, de, values) => presentation[locale].formatMessage({ id, defaultMessage: locale === "de" ? de : en }, values),
  }) };
  runInNewContext(source("vocabularyHub"), { exports, URL, URLSearchParams, location: browserLocation, require: id => id === "react" ? react : id === "./uiLocale" ? uiLocale : id.endsWith(".css") ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id) });
  const before = exports.VocabularyUsage({ family: "stops" });
  const firstForm = find(before, node => node.type === "form" && node.props["aria-label"] === "Search related organs");
  assert.ok(firstForm);
  cells[0] = `${query}&snapshot=core`; cursor = 0;
  const after = exports.VocabularyUsage({ family: "stops" });
  const secondForm = find(after, node => node.type === "form" && node.props["aria-label"] === "Search related organs");
  assert.ok(secondForm);
  assert.equal(secondForm.key, firstForm.key);
  assert.equal(find(secondForm, node => node.type === "input").props.defaultValue, "Leipzig");
  const share = find(after, node => node.type === "a" && node.props.children === "Snapshot-bound term link");
  assert.match(share.props.href, /term=Principal&organ_q=Leipzig&snapshot=core/);
  locale = "de"; cursor = 0;
  const german = exports.VocabularyUsage({ family: "stops" });
  const germanForm = find(german, node => node.type === "form" && node.props["aria-label"] === "Zugehörige Orgeln suchen");
  assert.equal(germanForm.key, firstForm.key);
  assert.equal(find(germanForm, node => node.type === "input").props.defaultValue, "Leipzig");
  const germanLink = find(german, node => node.type === "a" && node.props.children === "Link zum Wortlaut mit festem Datenstand");
  assert.equal(germanLink.props.href, share.props.href);
});


test("candidate selected options retain their identity and position while async facets arrive", () => {
  const selected = "urn:modavis:terminology-seed:action";
  const before = hub.registrySchemeOptions(undefined, selected);
  const after = hub.registrySchemeOptions([{ id: "urn:other", title: "Other" }, { id: selected, title: "Action", conceptCount: 4 }], selected);
  assert.equal(before[0].id, selected); assert.equal(after[0].id, selected);
  assert.equal(after.filter(item => item.id === selected).length, 1);
  assert.equal(after[0].title, "Action");
  assert.deepEqual(Array.from(hub.registryLanguageOptions(undefined, "de")), ["de"]);
  assert.deepEqual(Array.from(hub.registryLanguageOptions(["en", "de"], "de")), ["de", "en"]);
});


test("all advertised source-field routes reach the usage reader rather than discovery", () => {
  const { vocabularyUsageFamily } = load("vocabularyRoutes");
  for (const family of ["activities", "stops", "divisions", "key_action", "stop_action", "windchests", "wind_pressure", "source_note", "functional_pipe_position"])
    assert.equal(vocabularyUsageFamily(`/vocab/usage/${family}`), family);
  assert.equal(vocabularyUsageFamily("/vocab/usage/windchests/"), "windchests");
  for (const path of ["/vocab/registry", "/vocab/usage", "/vocab/usage/key_action/extra", "/vocab/usage/../admin"])
    assert.equal(vocabularyUsageFamily(path), null);
});
