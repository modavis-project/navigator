import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { testUiLocale } from "./ui-locale-test-support.mjs";

const require = createRequire(import.meta.url);
function compile(source, additions = {}) {
  const context = { exports: {}, useUiLocale: testUiLocale, require: name => name.endsWith(".css") ? {} : name === "./eventParticipation" ? { ParticipantIdentityNote: () => null } : name === "./uiLocale" ? { useUiLocale: testUiLocale } : require(name), ...additions };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context;
}
const experience = compile(readFileSync(new URL("../src/publicExperience.tsx", import.meta.url), "utf8")).exports;
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const organ = {
  mdvsId: "MDVS:ENTY:TEST-0001-A", title: "Example organ", canonicalUrl: "/organs/TEST-0001-A", sourceCount: 14,
  sources: [{ id: "s1", source: "src:Example catalogue" }], sourceSummary: { sourceRecords: 14, collections: 3 },
  timeline: [], deferredSections: { history: "/api/history" }, loadedSections: { history: false },
  documentedStateSummary: { assertionCount: 29 },
  specificationDescriptions: [1, 2].map(id => ({ id: String(id), kind: "alternative", periodLabel: "Undated account", sourceHeading: "Source specification", source: { id: "s1", source: "src:Example catalogue" }, chronology: { contract: "modavis.source-account-recovery/v1" } })),
};

test("the account disclosure details recovered specifications and sources without repeating overview totals", () => {
  const html = render(experience.OrganLanding, { organ, onOpenTab: () => {} });
  assert.match(html, /2 recovered specification accounts/);
  assert.match(html, /Example catalogue/);
  assert.match(html, /tab=identifiers/);
  assert.match(html, /different periods or instruments/);
  assert.doesNotMatch(html, /14 source records|14 collections|29 assertions|No dated activities/);
});

test("legacy source counts and unloaded history do not become invented collection totals or absence claims", () => {
  const html = render(experience.OrganLanding, { organ: { ...organ, sourceSummary: undefined }, onOpenTab: () => {} });
  assert.match(html, /Sources and identifiers/);
  assert.match(html, /Open the history/);
  assert.doesNotMatch(html, /14 collections|No dated activities/);
});

test("builder summary retains attribution and leaves unestablished role and time explicit", () => {
  const html = render(experience.BuilderAttribution, { organ: { ...organ, builder: "Example workshop", builderSummary: { label: "Example workshop", documentedActorCount: 3, assertionCount: 7, qualification: "Most documented association; consult each source claim.", claimsUrl: "/use-cases/research-workbench?view=claims", role: null, period: null } } });
  assert.match(html, /Most documented association/);
  assert.match(html, /Associated actor records/);
  assert.match(html, /Supporting source assertions/);
  assert.match(html, /No single role established/);
  assert.match(html, /See the dated source evidence/);
  assert.match(html, /href="\/use-cases\/research-workbench\?view=claims"/);
});

test("unavailable source and builder aggregates remain unavailable instead of becoming zero or crashing", () => {
  const sparse = { ...organ, sourceSummary: { sourceRecords: null, collections: null }, builder: "Example workshop", builderSummary: { label: "Example workshop", documentedActorCount: null, assertionCount: null, qualification: "Documented association", claimsUrl: "/use-cases/research-workbench", role: null, period: null } };
  const html = render(experience.OrganLanding, { organ: sparse, onOpenTab: () => {} });
  assert.match(html, /Example catalogue/);
  assert.doesNotMatch(html, /0 source records/);
  assert.match(render(experience.BuilderAttribution, { organ: sparse }), /Not recorded/);
});

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const explore = app.slice(app.indexOf("function ExploreSection("), app.indexOf("function PublicEntityGateway("));
const noop = () => null;
const context = compile(explore, {
  buildEntitySearchSuggestions: () => [], Metric: ({ label, value }) => createElement("div", null, label, " ", value),
  PublicEntityGateway: ({ organTotal }) => createElement("p", null, "Matching records: ", organTotal),
  SearchAssistPanel: noop, EntitySearchPanel: noop, OrganCardButton: noop, MapPreview: noop, ApplicationsPreview: noop,
  Search: noop, MapIcon: noop, ChevronRight: noop, Layers3: noop, ListChecks: noop, Library: noop, mapSearchHref: () => "/map",
});

test("discovery metrics stay dataset-wide while the query result count changes", () => {
  const props = { active: true, capabilities: [], entitySearch: null, error: null, loading: false, organFacets: null, publicDatasetProfile: false, query: "chapel", datasetCounts: { organs: 215769, sourceEvidence: 300000, mapped: 100000, withMedia: 1200 }, explore: { query: "chapel", counts: { organs: 5 }, featuredOrgans: [], mapItems: [] } };
  const html = render(context.ExploreSection, props);
  assert.match(html, /Organ records · whole dataset 215,769/);
  assert.match(html, /Source records · whole dataset 300,000/);
  assert.match(html, /Matching records: 5/);
  const next = render(context.ExploreSection, { ...props, query: "new query" });
  assert.match(next, /Organ records · whole dataset 215,769/);
  assert.doesNotMatch(next, /Matching records: 5/);
});
