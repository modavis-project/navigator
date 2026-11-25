import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import test from "node:test";
import vm from "node:vm";
import {createElement, useEffect, useMemo, useState} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, {compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
}}).outputText;
const helpers = {exports: {}, require, URLSearchParams};
for (const name of ["specificationNavigation", "organSpecificationWorkflow"]) {
  vm.runInNewContext(compile(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), "utf8")), helpers);
}
const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "SpecificationTab");
assert.ok(component, "Load the actual component renderer, not a copy of its presentation logic");
function render(organ, search = "") {
  const context = {
    exports: {}, require, URLSearchParams, useEffect, useMemo, useState,
    window: {location: {search}},
    ...helpers.exports,
    actorValue: value => value == null ? "" : String(value),
    componentSourceComparisonState: () => null,
    componentMetricValue: value => value ?? "Not recorded",
    reportedManualCount: () => null,
    friendlyLabel: value => value,
    groupStopsByDivision: items => [{label: "Manual", items}],
    Metric: ({label, value}) => createElement("span", null, `${label}: ${value}`),
    Pill: ({children}) => createElement("span", null, children),
    SpecificationStopDivisionGroup: ({division}) => createElement("div", null, division.items.map(item => createElement("span", {key: item.id}, item.label))),
    ComponentDetail: ({component}) => createElement("div", {"data-open-component": component.id}, "Selected component evidence"),
    SourceReportedTotals: ({facts}) => createElement("div", {"data-source-totals": facts.map(fact => fact.id).join(",")}),
    ConfigurationChronology: () => null,
    OrganTuningEvidencePanel: () => createElement("p", null, "Tuning evidence across sources"),
    OrganParityTechnicalFactsPanel: () => createElement("p", null, "All retained technical assertions"),
    PipeworkEvidencePanel: () => null,
    ExternalLink: () => null,
    Info: () => null,
    AlertCircle: () => null,
  };
  vm.runInNewContext(compile(component.getText(parsed)), context);
  return renderToStaticMarkup(createElement(context.SpecificationTab, {
    organ, actorId: "", staffMode: false, onActorIdChange() {}, onOrganRefresh() {},
  }));
}
const stop = {id: "stop-A", kind: "stop", label: "Principal", normalizerEvidence: []};
const specification = {rows: [], summary: {coverageState: "structured_components"}};
const sourceA = {id: "source-A", preferred: true, source: {id: "record-A", source: "Account A", title: "Account A"},
  specification, componentHierarchy: [{id: "stops", label: "Stops", count: 1, items: [stop]}]};
const sourceB = {id: "source-B", source: {id: "record-B", source: "Account B", title: "Account B"},
  specification: {rows: [], summary: {coverageState: "not_documented_in_current_public_sources"}}, componentHierarchy: []};
const organ = {
  id: "ORGAN", sources: [], specificationDescriptions: [], specification,
  componentHierarchy: sourceA.componentHierarchy, sourceSpecifications: [sourceA, sourceB],
  technicalEvidence: {facts: [
    {id: "fact-A", sourceRecordId: "record-A", summaryEvidence: {}, displayValue: "One"},
    {id: "fact-other-1", sourceRecordId: "record-other"},
    {id: "fact-other-2", sourceRecordId: "record-other"},
  ], pitch: {}, temperament: {}},
};

test("component coverage counts only technical facts belonging to the selected source", () => {
  const html = render(organ);
  assert.match(html, /1 captured component row · 1 technical fact from this source/);
  assert.match(html, /data-source-totals="fact-A"/);
  assert.doesNotMatch(html, /data-source-totals="[^"]*fact-other/);
  assert.match(html, /<details[^>]*specification-all-source-evidence[^>]*><summary>Technical evidence across all source accounts · 3 assertions/);
  assert.match(html, /These statements do not all belong to the component source selected above/);
});

test("an empty selected source does not claim that the organ itself has no components", () => {
  const html = render(organ, "?specificationSource=source-B");
  assert.match(html, /0 captured component rows · 0 technical facts from this source/);
  assert.match(html, /No structured component rows are available in this source account/);
  assert.doesNotMatch(html, /for this organ in the current public sources/);
  assert.match(html, /All retained technical assertions/);
});

test("component evidence opens on explicit selection while the public initial view offers a clear next step", () => {
  const initial = render(organ);
  assert.match(initial, /Inspect a component/);
  assert.doesNotMatch(initial, /data-open-component/);
  const selected = render(organ, "?component=stop-A");
  assert.match(selected, /data-open-component="stop-A"/);
  assert.doesNotMatch(selected, /Inspect a component/);
});

test("an unavailable component link remains explicit rather than substituting the first component", () => {
  const html = render(organ, "?component=missing");
  assert.match(html, /The linked component is unavailable in this source set/);
  assert.doesNotMatch(html, /data-open-component/);
});

test("an unavailable source or account is not silently replaced with another successful selection", () => {
  for (const search of ["?specificationSource=missing", "?description=missing", "?descriptionRevision=orphan", "?component=stop-A&component=other"]) {
    const html = render(organ, search);
    assert.match(html, /role="alert" aria-label="Specification link unavailable"/);
    assert.match(html, /requested URL has been retained/);
    assert.match(html, /Browse available component evidence/);
    assert.doesNotMatch(html, /captured component rows|data-open-component|Inspect a component/);
  }
});

test("a component deep link explains when its owning source differs from the requested source", () => {
  const html = render(organ, "?specificationSource=source-B&component=stop-A");
  assert.match(html, /linked component belongs to Account A/);
  assert.match(html, /1 technical fact from this source/);
  assert.match(html, /data-open-component="stop-A"/);
});
