import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  modules.set(name, exports);
  const path = ["tsx", "ts"].map(extension => new URL(`../src/${name}.${extension}`, import.meta.url)).find(existsSync);
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, URLSearchParams, window: { location: { search: "" } },
    require: id => id.endsWith(".css") ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id) });
  return exports;
}
const { accountRelatedReviews, accountStopSummary, buildAccountComparison, unmatchedStopEntryIds } = load("specificationAccountComparison");
const { SpecificationAccountComparison, AccountFactDifference } = load("SpecificationAccountComparisonPanel");
const { SourceReportedTotals, SourceAccountQualification, StopCountDifference } = load("organSpecificationDescriptions");
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const fact = (id, family, value, number = null, extra = {}) => ({
  id, family, label: family === "stop_total" ? "Stops / registers" : family === "manual_total" ? "Manuals" : family,
  value, normalizedNumber: number, sourcePath: `specification.${id}`, revision: `revision-${id}`,
  sourceWording: `Original wording ${value}`, ...extra,
});
const account = (id, facts = [], extra = {}) => ({
  id, kind: "main", periodLabel: `Account ${id}`, sourceHeading: `Specification ${id}`,
  timeKind: "source_listing", timeRelation: "unspecified", sortYear: null, subjectKind: "record_context",
  realization: "reported", coverage: "captured_source", stateId: null,
  revision: `account-revision-${id}`, sourceRevision: `source-revision-${id}`,
  sourcePaths: ["source.specification"], normalizationProfile: "fixture/v1", stopCount: 107, componentCount: 137,
  source: { id: `source-record-${id}`, source: `provider-${id}`, url: `https://example.org/${id}` },
  technicalFacts: facts, groups: [], otherComponents: [], ...extra,
});

test("three source records with multiple differing fields retain every value and repeated same-source claim", () => {
  const accounts = [
    account("A", [fact("A-stop1", "stop_total", "105", 105), fact("A-stop2", "stop_total", "106", 106), fact("A-manual", "manual_total", "5", 5)]),
    account("B", [fact("B-stop", "stop_total", "105", 105), fact("B-manual", "manual_total", "4", 4)]),
    account("C", [fact("C-stop", "stop_total", "102", 102), fact("C-manual", "manual_total", "3", 3)]),
    account("historical", [], { kind: "alternative", sortYear: 1862, stopCount: 87 }),
  ];
  const untouched = JSON.stringify(accounts);
  const fields = buildAccountComparison(accounts);
  const stops = fields.find(field => field.family === "stop_total");
  assert.equal(stops.valueGroups.length, 3);
  assert.equal(stops.assertionCount, 4);
  assert.equal(stops.sourceCount, 3);
  assert.equal(stops.cells[0].facts.length, 2);
  assert.equal(stops.cells[3].facts.length, 0);
  assert.equal(fields.find(field => field.family === "manual_total").valueGroups.length, 3);
  assert.equal(fields.filter(field => field.differing).length, 2);
  assert.equal(JSON.stringify(accounts), untouched);
});

test("missing values and zero captured rows never create a reported zero or a false value difference", () => {
  const missing = account("missing", [fact("blank", "stop_total", "  ")], { stopCount: 0, componentCount: 15 });
  const fields = buildAccountComparison([account("known", [fact("known", "stop_total", "105", 105)]), missing]);
  assert.equal(fields[0].differing, false);
  assert.equal(fields[0].valueGroups.length, 1);
  assert.equal(fields[0].assertionCount, 1);
  assert.equal(fields[0].cells[1].facts.length, 1); // Retain the empty claim's provenance.
  assert.equal(accountStopSummary(missing), "No captured stop rows");
  assert.match(render(SourceAccountQualification, { description: missing }), /does not mean the organ has zero stops/);
  assert.equal(render(StopCountDifference, { description: account("empty-list", [fact("total", "stop_total", "105", 105)], { stopCount: 0 }) }), "");
  const zero = buildAccountComparison([account("zero", [fact("zero", "stop_total", "0", 0)], { stopCount: 0 }), account("known", [fact("known", "stop_total", "105", 105)])])[0];
  assert.equal(zero.valueGroups.length, 2);
  assert.equal(zero.valueGroups.find(group => group.key === "number:0").value, "0");
});

test("qualified and mixed evidence expressions are not promoted to comparable numeric totals", () => {
  const qualified = fact("qualified", "stop_total", "105", 105, { aggregateQualification: { status: "uncertain", headlineEligible: false } });
  const field = buildAccountComparison([account("A", [fact("numeric", "stop_total", "105", 105)]), account("B", [qualified]), account("C", [fact("expression", "stop_total", "105 + 3 transmissions")])])[0];
  assert.equal(field.valueGroups.length, 3);
  assert.equal(field.qualifiedAssertionCount, 1);
  assert.equal(field.differenceLabel, "Different kinds of evidence");
  assert.equal(field.valueGroups.find(group => group.facts[0].fact.id === "qualified").key.startsWith("qualified:"), true);
});

test("equivalent temperament wording and opaque source codes remain visible without a false difference", () => {
  const accounts = [
    account("A", [fact("short", "temperament", "Equal", null, { temperamentComparisonKey: "class:equal" })]),
    account("B", [fact("long", "temperament", "Equal temperament", null, { temperamentComparisonKey: "class:equal" })]),
    account("C", [fact("raw-code", "temperament", "2", 2, { valueKind: "source_code" })]),
  ];
  const fields = buildAccountComparison(accounts);
  assert.equal(fields[0].differing, false);
  assert.equal(fields[0].valueGroups.length, 1);
  assert.equal(fields[0].assertionCount, 3);
  assert.equal(fields[0].sourceCount, 3);
  const html = render(SpecificationAccountComparison, {
    accounts, fields, selectedId: "A", accountLabel: item => item.periodLabel,
    focusFamily: null, open: true, onClose() {}, onAccount() {}, onStoplists() {},
  });
  assert.match(html, /<strong>Equal<\/strong>/);
  assert.match(html, /<strong>Equal temperament<\/strong>/);
  assert.match(html, /<strong>2<\/strong><small>Source code with no verified temperament label/);
});

test("dated account-specific totals retain each original wording without main-account inheritance", () => {
  const historical = account("1862", [], { kind: "alternative", chronology: {
    configurationDateState: "explicit_source_account", claims: [], sourceObservations: [], eventAssociations: [],
    accountSourceFacts: [
      { family: "register_total", label: "Registers", value: "12", normalizedNumber: 12, wording: "12 Register" },
      { family: "register_total", label: "Registers", value: "12", normalizedNumber: 12, wording: "zwölf Register laut Nachtrag" },
      { family: "transmission_total", label: "Transmissions", value: "3", normalizedNumber: 3, wording: "3 Transmissionen" },
    ],
  } });
  const fields = buildAccountComparison([account("main", [fact("stops", "stop_total", "105", 105)]), historical]);
  assert.equal(fields.find(field => field.family === "stop_total").cells[1].facts.length, 0);
  const registers = fields.find(field => field.family === "register_total");
  assert.equal(registers.assertionCount, 2);
  assert.equal(registers.sourceCount, 1);
  assert.equal(registers.valueGroups.length, 1);
  assert.equal(registers.cells[1].facts[1].sourceWording, "zwölf Register laut Nachtrag");
  assert.equal(fields.some(field => field.valueGroups.some(group => group.value === "15")), false);
});

test("stop wording comparison preserves duplicate occurrences, capitalization and pitch differences", () => {
  const entry = (id, label = "Principal", pitch = "8") => ({ id, kind: "stop", label, pitch });
  const first = [entry("one"), entry("two"), entry("three", "Octave", "4"), entry("control", "Coupler", null)];
  first[3].kind = "coupler";
  const other = [entry("other"), entry("octave", "Octave", "2")];
  assert.deepEqual(Array.from(unmatchedStopEntryIds(first, other)), ["two", "three"]);
  assert.deepEqual(Array.from(unmatchedStopEntryIds([entry("case", "principal")], other)), ["case"]);
  assert.equal(unmatchedStopEntryIds([entry("unicode", "Flu\u0302te")], [entry("nfc", "Flûte")]).size, 0);
});

test("all-account comparison renders three sources, every conflicting assertion and separate missing coverage", () => {
  const accounts = [
    account("A", [fact("A-105", "stop_total", "105", 105), fact("A-106", "stop_total", "106", 106), fact("A-5", "manual_total", "5", 5)]),
    account("B", [fact("B-102", "stop_total", "102", 102), fact("B-4", "manual_total", "4", 4)]),
    account("C", [fact("C-summary", "source_summary", "105 jeux - 5 claviers")], { stopCount: 0, componentCount: 15 }),
  ];
  const fields = buildAccountComparison(accounts);
  const html = render(SpecificationAccountComparison, {
    accounts, fields, selectedId: "A", accountLabel: item => `${item.periodLabel} · ${item.source.source}`,
    focusFamily: null, open: true, onClose() {}, onAccount() {}, onStoplists() {},
  });
  for (const value of ["provider-A", "provider-B", "provider-C", "105", "106", "102", "revision-A-105", "specification.A-106", "account-revision-C"]) assert.ok(html.includes(value), value);
  assert.match(html, /3 accounts · 3 source records · 2 same-field assertion differences/);
  assert.match(html, /No assertion for this account/);
  assert.match(html, /No captured stop rows/);
  assert.match(html, /15 captured component rows/);
  assert.doesNotMatch(html, />0 (stops|listed stops)</);
  assert.match(html, /role="region" aria-label="Source account comparison table" tabindex="0"/);
  assert.match(html, /scope="row"/);
  assert.equal(render(SpecificationAccountComparison, { accounts, fields, open: false }), "");
});

test("difference actions sit beside the diverging source value before its evidence disclosure", () => {
  const accounts = [account("A", [fact("A", "stop_total", "105", 105)]), account("B", [fact("B", "stop_total", "106", 106)]), account("C", [fact("C", "stop_total", "102", 102)])];
  const fields = buildAccountComparison(accounts);
  const html = render(SourceReportedTotals, { facts: accounts[0].technicalFacts, comparisonFields: fields, onCompare() {} });
  assert.match(html, /Compare Stops \/ registers: 3 value groups across source accounts/);
  assert.ok(html.indexOf("Reported values differ") > html.indexOf(">105</span>"));
  assert.ok(html.indexOf("Reported values differ") < html.indexOf("<details"));
  assert.equal(render(AccountFactDifference, { field: buildAccountComparison([accounts[0]])[0], onCompare() {} }), "");
});

test("general and function-specific action claims create a scope review without merging fields or translating values", () => {
  const wording = "Transmission mécanique des claviers et des jeux";
  const accounts = [account("France", [fact("general-action", "action_system", wording)]),
    account("orgbase", [fact("key", "key_action", "Electrical"), fact("stop", "stop_action", "Electrical")]),
    account("third", [fact("total", "stop_total", "105", 105)])];
  const before = JSON.stringify(accounts);
  const reviews = accountRelatedReviews(accounts);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].sourceCount, 2);
  assert.equal(reviews[0].assertionCount, 3);
  assert.deepEqual(Array.from(reviews[0].families).sort(), ["action_system", "key_action", "stop_action"]);
  const fields = buildAccountComparison(accounts);
  assert.equal(fields.filter(field => field.differing).length, 0);
  const html = render(SpecificationAccountComparison, { accounts, fields, selectedId: "France",
    accountLabel: item => `${item.periodLabel} · ${item.source.source}`, focusFamily: reviews[0].id,
    open: true, onClose() {}, onAccount() {}, onStoplists() {}, onFocusFamily() {} });
  assert.match(html, /0 same-field assertion differences · 1 related-scope review/);
  assert.match(html, /Action descriptions need comparison/);
  assert.match(html, /General action description/);
  assert.match(html, /Function-specific action assertion/);
  assert.match(html, /a contradiction or shared configuration is not established/);
  assert.ok(html.includes(wording));
  assert.match(html, />Electrical</);
  for (const family of ["action_system", "key_action", "stop_action"]) assert.ok(html.includes(`id="account-comparison-field-${family}"`));
  assert.doesNotMatch(html, /id="account-comparison-field-stop_total"/); // Focus shows related fields only.
  const marker = render(AccountFactDifference, { field: fields.find(field => field.family === "action_system"), relatedReview: reviews[0], onCompare() {} });
  assert.match(marker, /Action descriptions need comparison/);
  assert.doesNotMatch(marker, /Reported values differ|Source values conflict/);
  assert.equal(JSON.stringify(accounts), before);
});

test("key and stop action alone, or empty general/specific claims, do not trigger a related-scope review", () => {
  const keysAndStops = [account("keys", [fact("key", "key_action", "Mechanical")]), account("stops", [fact("stop", "stop_action", "Electrical")])];
  assert.equal(accountRelatedReviews(keysAndStops).length, 0);
  assert.equal(accountRelatedReviews([...keysAndStops, account("blank", [fact("general", "action_system", "  ")])]).length, 0);
  assert.equal(accountRelatedReviews([account("general-A", [fact("general-A", "action_system", "Mechanical")]),
    account("general-B", [fact("general-B", "action_system", "Electrical")]), account("empty-key", [fact("blank-key", "key_action", "")])]).length, 0);
});

test("one source record's general and function-specific claims remain eligible for a qualified scope review", () => {
  const accounts = [account("same-source", [fact("general", "action_system", "Original general wording"), fact("key", "key_action", "Original key-action wording")])];
  const reviews = accountRelatedReviews(accounts);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].sourceCount, 1);
  assert.equal(reviews[0].assertionCount, 2);
  assert.equal(buildAccountComparison(accounts).some(field => field.differing), false);
});
