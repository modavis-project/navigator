import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const modules = new Map();
const requests = [];
const api = { publicGetJson: async (url, signal) => { requests.push({ url, signal }); return {}; } };
function source(name) {
  const path = ["tsx", "ts"].map(extension => new URL(`../src/${name}.${extension}`, import.meta.url)).find(existsSync);
  return ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
}
function load(name) {
  if (name === "api") return api;
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  modules.set(name, exports);
  runInNewContext(source(name), { exports, URL, URLSearchParams, AbortController,
    require: id => id.endsWith(".css") ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id) });
  return exports;
}
const omaro = load("omaro");
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const meta = { snapshotSha256: "snapshot-pin", datasetVersion: "0.1.0", ontologyVersion: "0.1.0", releaseStatus: "github-release", releaseUrl: "https://github.com/modavis-project/omaro/releases/tag/v0.1.0", publicIdentifiersActive: false, license: "CC0-1.0", sourceCommit: "source-commit", counts: { instruments: 12, classifications: 3, languages: { de: 10, en: 12 } }, exports: { "ontology-ttl": { file: "omaro.ttl", mediaType: "text/turtle", bytes: 71767, sha256: "original-artifact-hash" } }, scope: "Separate reference snapshot; no classification of POD organs is inferred." };

test("unknown, repeated, empty and malformed human query operands fail without choosing a fallback", () => {
  for (const query of ["unknown=x", "q=one&q=two", "snapshot=", "uri=", "collection=", "collection=other", "resolution=", "resolution=other", "offset=-1", "offset=1.5", "offset=100001", "limit=0", "limit=101", "uri=not-an-absolute-uri", "uri=https%3A%2F%2Fuser%3Apass%40example.org%2Fterm", "language=zz", "q=" + "a".repeat(201)]) {
    assert.equal(typeof omaro.omaroQueryIssue(new URLSearchParams(query), meta), "string", query);
  }
  assert.equal(omaro.omaroQueryIssue(new URLSearchParams("q=%25_%5C&language=de&resolution=all&offset=30&limit=20&snapshot=snapshot-pin"), meta), undefined);
});

test("detail API requests contain only exact URI and snapshot while the human browse context remains intact", () => {
  const parameters = new URLSearchParams({ uri: "http://www.mimo-db.eu/InstrumentsKeywords/1", collection: "instruments", q: "Organ", language: "de", resolution: "all", offset: "30", limit: "15", snapshot: "snapshot-pin" });
  const before = parameters.toString();
  assert.equal(omaro.omaroQueryIssue(parameters, meta), undefined);
  const projected = omaro.omaroApiQuery(parameters);
  assert.deepEqual(Array.from(projected.keys()).sort(), ["snapshot", "uri"]);
  assert.equal(projected.get("uri"), parameters.get("uri"));
  assert.equal(parameters.toString(), before);
  const back = omaro.omaroNavigationQuery(`?${parameters}`, { uri: null });
  for (const key of ["collection", "q", "language", "resolution", "offset", "limit", "snapshot"]) assert.equal(back.get(key), parameters.get(key));
});

test("ontology search refuses inactive language/scope filters while concept All records remains explicit", () => {
  for (const query of ["collection=ontology&language=de", "collection=ontology&resolution=resolved", "collection=ontology&resolution=all"]) assert.ok(omaro.omaroQueryIssue(new URLSearchParams(query), meta));
  assert.equal(omaro.omaroQueryIssue(new URLSearchParams("collection=ontology&q=Assertion&snapshot=snapshot-pin"), meta), undefined);
  assert.equal(omaro.omaroApiQuery(new URLSearchParams("collection=ontology&q=Assertion")).has("resolution"), false);
  assert.equal(omaro.omaroApiQuery(new URLSearchParams("resolution=all")).has("resolution"), false);
  assert.equal(omaro.omaroApiQuery(new URLSearchParams()).get("resolution"), "resolved");
  assert.equal(omaro.omaroApiQuery(new URLSearchParams("resolution=unresolved")).get("resolution"), "unresolved");
});

test("collection transitions preserve exact pins and only an explicit recovery action replaces them", () => {
  assert.equal(omaro.omaroNavigationQuery("?q=organ&snapshot=older", { collection: "hs" }, true, "new").get("snapshot"), "older");
  assert.equal(omaro.omaroNavigationQuery("?snapshot=", { collection: "hs" }, true, "new").get("snapshot"), "");
  assert.deepEqual(Array.from(omaro.omaroNavigationQuery("?snapshot=one&snapshot=two", { collection: "hs" }, true, "new").getAll("snapshot")), ["one", "two"]);
  const recovered = omaro.omaroNavigationQuery("?q=organ&language=de&offset=30&snapshot=older", { snapshot: "new" }, false, "new");
  assert.equal(recovered.get("snapshot"), "new");
  assert.equal(recovered.get("q"), "organ");
  assert.equal(recovered.get("language"), "de");
  assert.equal(recovered.get("offset"), "30");
});

test("form identity excludes automatic pins and page changes, preserving unapplied drafts", () => {
  const before = new URLSearchParams("q=Organ&language=de&resolution=resolved");
  const after = new URLSearchParams(before); after.set("snapshot", "snapshot-pin"); after.set("offset", "30");
  assert.equal(omaro.omaroSearchFormKey(before), omaro.omaroSearchFormKey(after));
  after.set("q", "Trumpet");
  assert.notEqual(omaro.omaroSearchFormKey(before), omaro.omaroSearchFormKey(after));
});

test("release metadata and original artifact declarations remain separately attributed and every distribution stays pinned", () => {
  const badges = render(omaro.OmaroMetadataBadges, { meta });
  assert.match(badges, /Dataset 0.1.0/); assert.match(badges, /Ontology 0.1.0/); assert.match(badges, /GitHub release/); assert.match(badges, /CC0-1.0/);
  assert.doesNotMatch(badges, /Private|v1.0.0/);
  const html = render(omaro.OmaroDistributions, { meta });
  assert.match(html, /https:\/\/github.com\/modavis-project\/omaro\/releases\/tag\/v0.1.0/);
  assert.match(html, /separate source declarations and checksums/);
  assert.match(html, /original bytes are preserved/);
  assert.match(html, /Public identifier activation is not asserted/);
  assert.match(html, /original-artifact-hash/);
  assert.match(html, /\/api\/omaro\/download\/ontology-ttl\?snapshot=snapshot-pin/);
  assert.match(html, /\/api\/omaro\?snapshot=snapshot-pin/);
  assert.doesNotMatch(html, /Private GitHub|v1.0.0|publicly active DOI/);
});

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}
function harness(cells, runEffects = false) {
  const exports = {};
  let cursor = 0;
  const location = { search: cells[0] || "", pathname: "/vocab/omaro" };
  const navigate = (_state, _title, url) => { location.search = new URL(url, "https://example.test").search; };
  const react = { ...require("react"), useState(initial) { const slot = cursor++; if (!(slot in cells)) cells[slot] = typeof initial === "function" ? initial() : initial; return [cells[slot], value => { cells[slot] = typeof value === "function" ? value(cells[slot]) : value; }]; }, useEffect(effect) { if (runEffects) effect(); } };
  runInNewContext(source("omaro"), { exports, URL, URLSearchParams, AbortController, location, document: {}, window: { addEventListener() {}, removeEventListener() {} }, history: { replaceState: navigate, pushState: navigate }, require: id => id === "react" ? react : id.endsWith(".css") ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id) });
  return { render() { cursor = 0; return exports.OmaroExplorer(); }, card() { cursor = 0; return exports.OmaroCard({}); } };
}

test("real explorer waits for exact metadata before requesting records and refuses malformed links", () => {
  for (const query of ["?q=one&q=two", "?unknown=value", "?snapshot=", "?snapshot=one&snapshot=two", "?collection=ontology&language=en"]) {
    requests.length = 0;
    const cells = [query, 0, { url: "/api/omaro", data: meta }, "", 0, undefined];
    harness(cells, true).render();
    assert.deepEqual(requests, [], query);
  }
  requests.length = 0;
  harness(["?snapshot=older", 0, { url: "/api/omaro", data: meta }, "", 0, undefined], true).render();
  assert.deepEqual(requests.map(request => request.url), ["/api/omaro?snapshot=older"]);
  assert.ok(requests[0].signal instanceof AbortSignal);

  requests.length = 0;
  const parameters = new URLSearchParams({ uri: "http://www.mimo-db.eu/InstrumentsKeywords/1", q: "Organ", language: "de", resolution: "all", offset: "30", snapshot: "snapshot-pin" });
  harness([`?${parameters}`, 0, { url: "/api/omaro?snapshot=snapshot-pin", data: meta }, "", 0, undefined], true).render();
  assert.equal(requests[0].url, "/api/omaro?snapshot=snapshot-pin");
  const detail = requests.find(request => request.url.startsWith("/api/omaro/concept?"));
  assert.ok(detail);
  assert.deepEqual(Array.from(new URL(detail.url, "https://example.test").searchParams.keys()).sort(), ["snapshot", "uri"]);
});

test("unknown metadata pins preserve the old URL until the user explicitly requests the current snapshot", () => {
  const search = "?q=Organ&snapshot=missing";
  const cells = [search, 0, { url: "/api/omaro?snapshot=missing", error: "Requested snapshot unavailable", status: 409 }, "", 0, undefined];
  const tree = harness(cells).render();
  assert.equal(cells[0], search);
  const recovery = find(tree, node => node.type === "button" && node.props.children === "Open this selection on the available snapshot");
  assert.ok(recovery);
  recovery.props.onClick();
  assert.equal(cells[0], "?q=Organ");
});

test("metadata hydration keeps the selected language option identity and form key for explicit and default language", () => {
  for (const [search, language, label] of [["?q=Organ&language=de", "de", "Deutsch · de"], ["?q=Organ", "en", "English · en"]]) {
    const cells = [search, 0, undefined, "", 0, undefined];
    const view = harness(cells);
    const firstForm = find(view.render(), node => node.type === "form");
    const firstSelect = find(firstForm, node => node.type === "select" && node.props.name === "language");
    const firstOption = find(firstSelect, node => node.type === "option" && node.props.value === language);
    assert.equal(firstOption.key, language);
    assert.equal(firstSelect.props.children[0], firstOption);
    assert.equal(firstOption.props.children, label);
    cells[0] += "&snapshot=snapshot-pin";
    cells[2] = { url: "/api/omaro?snapshot=snapshot-pin", data: { ...meta, counts: { ...meta.counts, languages: { ca: 5, ...meta.counts.languages } } } };
    const secondForm = find(view.render(), node => node.type === "form");
    const secondSelect = find(secondForm, node => node.type === "select" && node.props.name === "language");
    const secondOption = find(secondSelect, node => node.type === "option" && node.props.value === language);
    assert.equal(secondForm.key, firstForm.key);
    assert.equal(secondOption.key, firstOption.key);
    assert.equal(secondOption.type, firstOption.type);
    assert.equal(secondSelect.props.children[0], secondOption);
    assert.equal(secondOption.props.children, label);
    const html = renderToStaticMarkup(secondForm);
    assert.equal((html.match(new RegExp(`<option value="${language}"`, "g")) || []).length, 1);
    assert.match(html, new RegExp(`<option value="${language}" selected="">${label}</option>`));
    assert.match(html, /Català · ca/);
    assert.match(html, /value="Organ"/);
  }
});

test("OMARO entry card derives its language count and release status from the snapshot", () => {
  const html = renderToStaticMarkup(harness([0, { url: "/api/omaro", data: meta }]).card());
  assert.match(html, /2 recorded label languages/);
  assert.match(html, /GitHub release/);
  assert.doesNotMatch(html, /13 languages|Private release/);
});

test("a runtime snapshot refusal checks metadata only after explicit action without rewriting the kept selection", () => {
  const search = "?collection=instruments&q=Organ&snapshot=snapshot-pin";
  const request = "/api/omaro/concepts?" + omaro.omaroApiQuery(new URLSearchParams(search));
  const cells = [search, 0, { url: "/api/omaro?snapshot=snapshot-pin", data: meta }, "", 0, { url: request, error: "The requested snapshot is unavailable.", status: 409 }];
  const tree = harness(cells).render();
  const recovery = find(tree, node => node.type === "button" && node.props.children === "Check the available snapshot");
  assert.ok(recovery);
  assert.equal(find(tree, node => node.type === "button" && node.props.children === "Retry this reference"), undefined);
  recovery.props.onClick();
  assert.equal(cells[0], search);
  assert.equal(cells[1], 1);
  assert.equal(cells[2], undefined);
  assert.equal(cells[4], 0);
});
