import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import test from "node:test";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import { testUiLocale } from "./ui-locale-test-support.mjs";

const require = createRequire(import.meta.url);
function load(name, modules = {}, globals = {}) {
  const context = {exports: {}, require: id => id.endsWith(".css") ? {} : modules[id] || require(id), ...globals};
  const source = readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText, context);
  return context.exports;
}
const helpers = load("sourceComparisonPresentation.ts");
const labels = load("specificationLabels.ts", {"./sourceComparisonPresentation": helpers});
const comparisonDependencies = {"./sourceComparisonPresentation": helpers, "./specificationLabels": labels};
const ui = load("technicalSourceComparisons.tsx", {...comparisonDependencies, "./uiLocale": {useUiLocale: testUiLocale}});
const assertion = (id, sourceRecordId, value) => ({factId: id, sourceRecordId, source: "Provider", displayValue: value, sourceWording: value, sourcePath: `field.${id}`, sourceUrl: `https://example.org/${id}`});
const group = {id: "technical-field:stop_total", family: "stop_total", label: "Stops", status: "different_values", scope: "source_record_assertions", sameConfigurationEstablished: false,
  withinSourceDifferences: true, crossSourceDifferences: true,
  assertions: [assertion("a", "record-1", "100"), assertion("b", "record-1", "105"), assertion("c", "record-2", "100"), assertion("d", "record-3", "110")],
  valueGroups: [{key: "100", value: "100", factIds: ["a", "c"], sourceRecordIds: ["record-1", "record-2"]}, {key: "105", value: "105", factIds: ["b"], sourceRecordIds: ["record-1"]}, {key: "110", value: "110", factIds: ["d"], sourceRecordIds: ["record-3"]}], missingSourceRecordIds: ["record-4"]};

test("German technical comparisons preserve source attribution, missing coverage and literal values", () => {
  const german = load("technicalSourceComparisons.tsx", {...comparisonDependencies, "./uiLocale": {useUiLocale: () => testUiLocale("de")}});
  const html = renderToStaticMarkup(React.createElement(german.TechnicalSourceComparisons, {groups: [group]}));
  assert.match(html, /Registerzahl/);
  assert.match(html, /Werte laut Quelle weichen ab · 4 Angaben · 3 Quelldatensätze/);
  assert.match(html, /Keine Angabe erfasst in 1 weiteren Quelldatensatz/);
  assert.match(html, /<strong>105<\/strong>/);
  assert.match(html, /Provider<code>record-1<\/code>/);
  assert.match(html, /href="https:\/\/example.org\/b"/);
});

test("multi-way field comparison retains all claims, exact records, values and missing coverage", () => {
  const html = renderToStaticMarkup(React.createElement(ui.TechnicalSourceComparisons, {groups: [group]}));
  assert.match(html, /Reported values differ · 4 assertions · 3 source records/);
  assert.match(html, /different assertions within the same source record/);
  for (const id of ["a", "b", "c", "d"]) assert.match(html, new RegExp(`field\\.${id}`));
  for (const value of ["100", "105", "110"]) assert.match(html, new RegExp(`<strong>${value}</strong>`));
  assert.match(html, /No captured assertion in 1 other source record/);
  assert.match(html, /record-4/);
  assert.match(html, /Matching values do not establish the same configuration/);
  assert.doesNotMatch(html, /majority|most authoritative|same component/i);
});

test("zero, unknown and qualified evidence remain separate in displayed comparisons", () => {
  assert.equal(helpers.capturedRowsLabel("manual_total"), "Captured manual/keyboard rows");
  assert.equal(helpers.capturedRowsLabel("stop_total"), "Captured stop rows");
  assert.equal(helpers.comparisonValue(0), "0");
  assert.equal(helpers.comparisonValue(false), "false");
  assert.equal(helpers.comparisonValue(null), "Not stated");
  assert.equal(helpers.comparisonValue(""), "Not stated");
  const qualified = {...group, status: "single_source", assertions: [assertion("z", "zero", "0"), {...assertion("q", "qualified", "about 5"), valueKind: "qualified", qualificationGuidance: "Uncertain source total"}, {...assertion("m", "missing", ""), valueKind: "missing"}], valueGroups: [{key: "0", value: "0", factIds: ["z"], sourceRecordIds: ["zero"]}, {key: "q", kind: "qualified", value: "about 5", factIds: ["q"], sourceRecordIds: ["qualified"]}]};
  const html = renderToStaticMarkup(React.createElement(ui.TechnicalSourceComparisons, {groups: [qualified]}));
  assert.match(html, /One comparable source record · 3 assertions · 3 source records/);
  assert.match(html, /<strong>0<\/strong>/);
  assert.match(html, /No value captured/);
  assert.match(html, /Qualified; retained separately/);
  assert.match(html, /Uncertain source total/);
});

test("capture mismatch and differing source wording have precise labels", () => {
  assert.equal(helpers.technicalFactDifferenceLabel({comparisonKind: "source_summary_vs_captured_rows", comparisonState: "single_source", conflictState: "material_technical_disagreement"}), "Summary and captured list differ");
  assert.equal(helpers.technicalFactDifferenceLabel({comparisonState: "different_wording", conflictState: "none"}), "Source wording differs");
  assert.equal(helpers.technicalComparisonLabel({status: "different_values", withinSourceDifferences: true, crossSourceDifferences: false}), "Values differ within a source record");
  assert.equal(helpers.technicalComparisonLabel({status: "not_comparable"}), "Different kinds of evidence");
});

test("the organ tuning panel preserves raw codes without offering unverified catalogue searches", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const panel = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "OrganTuningEvidencePanel");
  const context = { exports: {}, require, useUiLocale: testUiLocale, friendlyLabel: value => value, Info: () => null, ExternalLink: () => null };
  vm.runInNewContext(ts.transpileModule(panel.getText(parsed), { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText, context);
  const renderPanel = temperament => renderToStaticMarkup(React.createElement(context.OrganTuningEvidencePanel, {
    organ: {technicalEvidence: {pitch: {assertions: []}, temperament}},
  }));
  const code = {source: "ohs", sourcePath: "specifications.temperament", value: "2", valueKind: "source_code"};
  const opaque = renderPanel({
    status: "source_code_only", assertions: [code],
    catalogRelation: {state: "source_code_only", targetUrl: "/temperaments", guidance: "The source code is unresolved."},
  });
  assert.match(opaque, /<strong>2<\/strong>/);
  assert.match(opaque, /Source code with no verified temperament label/);
  assert.doesNotMatch(opaque, /href="\/temperaments/);

  const safeLink = "/temperaments?q=Equal&scope=evidence";
  const equivalent = renderPanel({
    status: "equivalent_wording", preferredValue: "Equal",
    assertions: [{...code, value: "Equal", valueKind: "wording", catalogUrl: safeLink}],
    catalogRelation: {state: "candidate_set", targetUrl: safeLink, matchingRecordCount: 2, guidance: "Related catalogue entries."},
  });
  assert.match(equivalent, /Equivalent source wording/);
  assert.match(equivalent, /href="\/temperaments\?q=Equal&amp;scope=evidence"/);

  const sourceEntry = "https://bund-deutscher-orgelbaumeister.de/stimmungen/template.htm?label=2hKi2";
  const panelInput = {
    status: "single_source", preferredValue: "Kirnberger II",
    assertions: [{...code, value: "Kirnberger II", valueKind: "wording"}],
  };
  const exact = renderPanel({...panelInput, catalogRelation: {
    state: "exact_record", targetUrl: "/temperaments/2hKi2", exactRecordSourceUrl: sourceEntry,
  }});
  assert.match(exact, /href="\/temperaments\/2hKi2"/);
  assert.ok(exact.includes(`href="${sourceEntry}"`));
  assert.match(exact, /Open the BDO source entry/);

  const related = renderPanel({...panelInput, catalogRelation: {
    state: "candidate_set", targetUrl: safeLink, exactRecordSourceUrl: sourceEntry, matchingRecordCount: 2,
  }});
  assert.doesNotMatch(related, /bund-deutscher-orgelbaumeister|Open the BDO source entry/);
  assert.doesNotMatch(renderPanel({...panelInput, catalogRelation: {
    state: "exact_record", targetUrl: "/temperaments/2hKi2",
    exactRecordSourceUrl: "https://bund-deutscher-orgelbaumeister.de.example.org/stimmungen/",
  }}), /example\.org|Open the BDO source entry/);
});

test("component markers attach only to the supplied field or explicit presentation alias", () => {
  const fields = [{field: "pitch", status: "conflicting"}, {field: "ranks", status: "variant", variantKind: "equivalent_notation"}, {field: "name", status: "corroborated"}, {field: "pipe_count", status: "conflicting"}];
  assert.equal(helpers.comparisonsForComponentField(fields, "length")[0], fields[0]);
  assert.equal(helpers.comparisonsForComponentField(fields, "ranks")[0], fields[1]);
  assert.equal(helpers.comparisonsForComponentField(fields, "unrelated").length, 0);
  assert.equal(helpers.comparisonsForComponentField(fields, "name").length, 0);
  assert.equal(helpers.componentVariantKind([{status: "variant", variantKind: "equivalent_notation"}, {status: "variant", variantKind: "name_variant"}]), "source_wording");
});

test("record reference links open published schemes or exact reference concepts", () => {
  const { vocabularyReferenceLinks } = load("vocabularyReferenceLinks.ts", {}, { URLSearchParams });
  const base = "https://navigator.modavis.org";
  for (const [key, scheme] of [["evidenceRoles", "evidence-role"], ["heritageRecognition", "heritage-recognition-status"]]) {
    const link = new URL(vocabularyReferenceLinks[key], base);
    assert.equal(link.pathname, "/vocab/reference");
    assert.equal(link.searchParams.get("collection"), "network");
    assert.equal(link.searchParams.get("scheme"), `https://w3id.org/modavis/vocab/${scheme}`);
    assert.equal(link.searchParams.has("uri"), false);
  }
  const organ = new URL(vocabularyReferenceLinks.pipeOrgan, base);
  assert.equal(organ.pathname, "/vocab/reference");
  assert.equal(organ.searchParams.get("uri"), "https://w3id.org/modavis/vocab/instrument-type/pipe-organ");
  const omaro = new URL(vocabularyReferenceLinks.omaroOrgan, base);
  assert.equal(omaro.pathname, "/vocab/omaro");
  assert.equal(omaro.searchParams.get("uri"), "http://www.mimo-db.eu/InstrumentsKeywords/2266");
});

test("a value-local comparison opens enclosing disclosures and focuses the exact field", () => {
  const events = [];
  class Details { constructor(parentElement) { this.parentElement = parentElement; this.open = false; } querySelector() { return {focus: () => events.push("focus")}; } scrollIntoView() { events.push("scroll"); } }
  const parent = new Details(null), target = new Details(parent);
  const runtime = load("technicalSourceComparisons.tsx", {...comparisonDependencies, "./uiLocale": {useUiLocale: testUiLocale}}, {HTMLDetailsElement: Details, document: {getElementById: id => id === "technical-comparison-stop_total" ? target : null}});
  runtime.revealTechnicalComparison("stop_total");
  assert.equal(parent.open, true); assert.equal(target.open, true);
  assert.deepEqual(events, ["focus", "scroll"]);
  runtime.revealTechnicalComparison("missing");
  assert.equal(events.length, 2);
});

test("summary/list comparison includes capture coverage without making it another reported value", () => {
  const capture = {...group, withinSourceDifferences: false, crossSourceDifferences: false, status: "single_source", assertions: [{...assertion("total", "source-a", "105"), comparisonKind: "source_summary_vs_captured_rows", capturedComponentCount: 107}], valueGroups: [{key: "105", value: "105", factIds: ["total"], sourceRecordIds: ["source-a"]}], missingSourceRecordIds: []};
  const html = renderToStaticMarkup(React.createElement(ui.TechnicalSourceComparisons, {groups: [capture]}));
  assert.match(html, /Captured stop rows: 107/);
  assert.match(html, /Summary and captured list differ within this source record/);
  assert.match(html, /row count is capture coverage, not another reported organ total/);
  assert.match(html, /1 assertion · 1 source record/);
});

test("related action scopes are signposted without inventing a shared field conflict", () => {
  const general = {...group, id: "action", family: "action_system", label: "Action system", status: "single_source", assertions: [assertion("fr", "source-fr", "Transmission mécanique des claviers et des jeux")]};
  const keys = {...group, id: "key", family: "key_action", label: "Key action", status: "single_source", assertions: [assertion("key", "source-ob", "Electrical")]};
  const stops = {...keys, id: "stop", family: "stop_action", label: "Stop action"};
  assert.equal(helpers.relatedActionGroups([general, keys]).length, 2);
  assert.equal(helpers.relatedActionGroups([general, {...keys, assertions: [assertion("key", "source-fr", "Electrical")]}]).length, 2);
  assert.equal(helpers.relatedActionGroups([keys, stops]).length, 0);
  assert.equal(helpers.relatedActionGroups([{...general, assertions: [assertion("blank", "source-fr", " ")]}, keys, stops]).length, 0);
  const html = renderToStaticMarkup(React.createElement(ui.TechnicalSourceComparisons, {groups: [general, keys]}));
  assert.match(html, /Action descriptions need comparison/);
  assert.match(html, /General transmission wording and specific key\/stop action fields have different scopes/);
  assert.match(html, /Transmission mécanique des claviers et des jeux/);
  assert.match(html, /Electrical/);
  assert.match(html, /Compare related action descriptions/);
  assert.equal(general.status, "single_source");
});

test("actual component details mark every differing field and comparison retains repeated provider claims", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ["visibleComponentDetailEntries", "ComponentDetail", "ComponentFieldDifference", "ComponentSourceComparisonModal", "componentSourceComparisonState", "componentSourceVariantPresentation"];
  const declarations = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(parsed)).join("\n");
  const context = {exports: {}, require, ...helpers, useState: React.useState, useId: React.useId, useRef: React.useRef, useEffect: React.useEffect,
    friendlyLabel: value => value, formatFieldValue: value => String(value), sourceEvidenceLinks: () => [], evidenceTargetFromPayload: () => null,
    Pill: ({children}) => React.createElement("span", null, children), PublicModal: ({title, children}) => React.createElement("section", {"aria-label": title}, children),
    AlertCircle: () => null, Quote: () => null, ExternalLink: () => null};
  vm.runInNewContext(ts.transpileModule(declarations, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText, context);
  const field = key => ({field: key, label: key, status: "conflicting", sourceCount: 3,
    valueGroups: [{displayValue: "0", sources: ["Provider"], displayed: true}, {displayValue: "2", sources: ["Provider"]}, {displayValue: "3", sources: ["Other"]}],
    assertions: [0, 2, 3].map((value, index) => ({assertionId: key + index, source: index === 2 ? "Other" : "Provider", sourceRecordId: "record-" + index, sourcePath: "path." + key + index, displayValue: String(value), rawValue: String(value), displayed: index === 0}))});
  const comparison = {displayPolicy: {baselineSource: "Provider", description: "Source assertions retained"}, status: "conflicting", conflictingFieldCount: 3, variantFieldCount: 0, corroboratedFieldCount: 0, fields: [field("pitch"), field("ranks"), field("pipe_count")]};
  const component = {id: "stop-1", kind: "stop", label: "Principal", detail: {length: "8", ranks: 2, pipe_count: 0}, sourceComparison: comparison};
  const detail = renderToStaticMarkup(React.createElement(context.ComponentDetail, {component, organ: {id: "organ", mdvsId: "ORG", title: "Organ"}, staffMode: false}));
  assert.equal((detail.match(/class="component-conflict-preview"/g) || []).length, 3);
  for (const field of ["pitch", "ranks", "pipe_count"]) assert.match(detail, new RegExp(`compare ${field}`));
  const modal = renderToStaticMarkup(React.createElement(context.ComponentSourceComparisonModal, {comparison, component, onClose() {}}));
  assert.equal((modal.match(/<tr class=/g) || []).length, 9);
  assert.match(modal, /<strong>0<\/strong>/);
  for (const path of ["path.pitch0", "path.ranks1", "path.pipe_count2"]) assert.ok(modal.includes(path));
  for (const record of ["record-0", "record-1", "record-2"]) assert.ok(modal.includes(record));
});
