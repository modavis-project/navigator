import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import { testUiLocale } from "./ui-locale-test-support.mjs";
import { LoadingContent } from "./loading-content-test-support.mjs";

const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, {compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
}}).outputText;
const helpers = {exports: {}};
vm.runInNewContext(compile(readFileSync(new URL("../src/organSpecificationWorkflow.ts", import.meta.url), "utf8")), helpers);
const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "OrganPage");
assert.ok(declaration, "Exercise the actual OrganPage header and routing gate with isolated child slots");
const slot = name => () => React.createElement("div", {"data-slot": name});
const icon = () => null;

function load(runtime = {}) {
  const context = {
    exports: {}, require, ...helpers.exports,
    useUiLocale: testUiLocale, publicOrganTabLabel: (_t, _tab, label) => label,
    LoadingContent,
    useState: React.useState, useEffect: React.useEffect, useRef: React.useRef, Suspense: React.Suspense,
    ORGAN_TABS: ["overview", "history", "activities", "specification", "media", "export", "identifiers", "related", "contributions", "research"],
    organInstitutionLabel: organ => organ.title,
    organStatusLabel: () => "Reviewed", publicStatusClass: () => "reviewed",
    tabLabel: tab => tab,
    IdentifierCopy: ({id, url}) => React.createElement("a", {href: url, "data-slot": "identifier"}, id),
    Pill: ({children}) => React.createElement("span", null, children),
    BuilderAttribution: slot("builder-qualification"), OrganHeroMedia: slot("hero-media"),
    OrganSectionState: ({children}) => children,
    OverviewTab: slot("overview"), SpecificationTab: slot("components"), OrganTuningEvidencePanel: slot("tuning-evidence"),
    OrganSpecificationDescriptions: ({organ, components, tuningEvidence}) => React.createElement("section", {
      "data-slot": "source-accounts", "data-account-count": organ.specificationDescriptions.length,
    }, components, tuningEvidence),
    HistoryTab: slot("history"), ActivitiesTab: slot("activities"), MediaTab: slot("media"),
    ExportTab: slot("exports"), IdentifiersTab: slot("identifiers"), RelatedTab: slot("related"),
    PodRelatedResources: slot("pod-relations"), ContributionsTab: slot("contributions"), ResearchTab: slot("research"),
    Quote: icon, Library: icon, MessageSquarePlus: icon, ChevronRight: icon, MapIcon: icon,
    preloadMapRuntime() {},
    ...runtime,
  };
  vm.runInNewContext(compile(declaration.getText(parsed)), context);
  return context.OrganPage;
}
const OrganPage = load();
const organ = {
  id: "record-example", mdvsId: "EXAMPLE-ID", title: "Example Church",
  pageUrl: "/organs/EXAMPLE-ID", builder: "Attributed Builder", builderUrl: "/persons/builder-example",
  dateLabel: "Account dated 1894", location: "Example Town", placeUrl: "/places/place-example",
  relatedEntities: [], sourceCount: 7, sourceSummary: {sourceRecords: 7, collections: 3}, mediaCount: 4,
  documentedStateSummary: {assertionCount: 5, yearLabel: "1862–2000", guidance: "Dates describe source assertions."},
  citation: {canonicalUrl: "https://example.org/organs/EXAMPLE-ID", provenanceContext: {release: "fixture"}},
  specificationDescriptions: [{id: "main-account", kind: "main", revision: "a".repeat(64)}],
};
const props = {
  organ, actorId: "", activeTab: "overview", publicProjection: true, capabilities: ["media", "entity_exports"],
  sectionLoads: {}, research: null, onActorIdChange() {}, onContributionSubmitted() {},
  onOrganRefresh: async () => {}, onResearchRefresh: async () => {}, onSectionRetry: async () => {}, onTabChange() {},
};
const render = overrides => renderToStaticMarkup(React.createElement(OrganPage, {...props, ...overrides}));
const header = html => html.slice(html.indexOf("<header"), html.indexOf("</header>") + 9);

test("the public overview keeps the full qualified summary, identity and preview visible", () => {
  const html = render({});
  const top = header(html);
  assert.match(top, /<h1>Example Church<\/h1>/);
  assert.match(top, /data-slot="identifier">EXAMPLE-ID/);
  assert.match(top, /Attributed Builder<\/a><\/strong> Builder association/);
  assert.match(top, /Account dated 1894<\/strong> Source date/);
  assert.match(top, /5<\/strong> event assertions · 1862–2000/);
  assert.match(top, /7<\/strong> source records · 3 collections/);
  assert.match(top, /data-slot="hero-media"/);
  assert.doesNotMatch(top, /<details|organ-hero-compact/);
  assert.match(html, /data-slot="builder-qualification"/);
  assert.match(html, /data-slot="overview"/);
});

test("a public specification has a closed native summary with identity and record actions outside it", () => {
  const html = render({activeTab: "specification"});
  const top = header(html);
  assert.match(top, /class="organ-hero organ-hero-compact"/);
  const disclosure = top.match(/<details class="organ-record-summary">([\s\S]*?)<\/details>/)?.[0];
  assert.ok(disclosure, "The summary must be a native, initially closed disclosure");
  assert.match(disclosure, /<summary>Record summary · builder, history and sources<\/summary>/);
  assert.match(disclosure, /Builder association/);
  assert.match(disclosure, /Source date/);
  assert.match(disclosure, /source records · 3 collections/);
  assert.doesNotMatch(disclosure, /Keep in workspace|> Cite<|data-slot="identifier"/);
  const outside = top.replace(disclosure, "");
  assert.match(outside, /<h1>Example Church<\/h1>/);
  assert.match(outside, /data-slot="identifier">EXAMPLE-ID/);
  assert.match(outside, /href="\/places\/place-example"/);
  assert.match(outside, /> Cite<\/button>/);
  assert.match(outside, /> Keep in workspace<\/button>/);
  assert.doesNotMatch(top, /data-slot="hero-media"/);
  assert.match(html, /data-slot="builder-qualification"/);
  assert.match(html, /id="organ-tab-media"/);
  assert.match(html, /role="tabpanel" aria-labelledby="organ-tab-specification"/);
});

test("single and multiple main accounts use the account interface without requiring an alternative-period account", () => {
  for (const accounts of [organ.specificationDescriptions, [...organ.specificationDescriptions, {id: "second-main", kind: "main"}]]) {
    const html = render({activeTab: "specification", organ: {...organ, specificationDescriptions: accounts}});
    assert.match(html, new RegExp(`data-slot="source-accounts" data-account-count="${accounts.length}"`));
    assert.match(html, /data-slot="components"/, "The full component interface remains reachable as a child slot");
    assert.match(html, /data-slot="tuning-evidence"/, "The source-account interface receives the organ-wide tuning evidence");
  }
});

test("an organ without account metadata retains the component interface", () => {
  for (const specificationDescriptions of [[], undefined]) {
    const html = render({activeTab: "specification", organ: {...organ, specificationDescriptions}});
    assert.match(html, /data-slot="components"/);
    assert.doesNotMatch(html, /data-slot="source-accounts"/);
  }
});

test("staff pages retain the expanded summary while media capability gates remain respected", () => {
  const staff = header(render({activeTab: "specification", actorId: "reviewer-example"}));
  assert.match(staff, /Builder association/);
  assert.match(staff, /Source date/);
  assert.match(staff, /data-slot="hero-media"/);
  assert.doesNotMatch(staff, /organ-hero-compact|organ-record-summary|Keep in workspace/);
  const withoutMedia = render({capabilities: ["entity_exports"]});
  assert.doesNotMatch(withoutMedia, /data-slot="hero-media"|id="organ-tab-media"|4<\/strong> Media/);
  assert.match(withoutMedia, /Keep in workspace/);
});

test("compact-header Cite and Keep actions still open citation state and retain the exact organ identity", () => {
  const stateChanges = [], events = [];
  class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init.detail; }
  }
  const PurePage = load({
    useState: initial => [initial, value => stateChanges.push(value)],
    useEffect() {}, useRef: current => ({current}),
    window: {dispatchEvent: event => events.push(event)}, CustomEvent,
  });
  function* elements(value) {
    if (Array.isArray(value)) { for (const child of value) yield* elements(child); return; }
    if (!React.isValidElement(value)) return;
    yield value;
    yield* elements(value.props.children);
  }
  const tree = PurePage({...props, activeTab: "specification"});
  const buttons = [...elements(tree)].filter(element => element.type === "button");
  const action = text => buttons.find(button => React.Children.toArray(button.props.children).some(child => typeof child === "string" && child.trim() === text));
  action("Cite").props.onClick();
  assert.deepEqual(stateChanges, ["citation"]);
  action("Keep in workspace").props.onClick();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "modavis:workspace-add");
  assert.deepEqual(JSON.parse(JSON.stringify(events[0].detail)), {
    kind: "organ", id: "EXAMPLE-ID", title: "Example Church", url: "/organs/EXAMPLE-ID",
  });
});
