import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { testUiLocale } from "./ui-locale-test-support.mjs";

const require = createRequire(import.meta.url);
const browser = { location: { search: "" } };
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  modules.set(name, exports);
  const path = ["tsx", "ts"].map(extension => new URL(`../src/${name}.${extension}`, import.meta.url)).find(existsSync);
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    exports, window: browser, URLSearchParams,
    require: id => id.endsWith(".css") ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id),
  });
  return exports;
}
const {
  ConfigurationChronology, DescriptionEvidence, DescriptionStoplist, OrganSpecificationDescriptions,
  SourceAccountQualification, SourceAccountTotals, SourceReportedTotals, StopCountDifference, filterDescriptionStops,
  preferredSpecificationDescription, sourceAccountLabel,
} = load("organSpecificationDescriptions");
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const description = (overrides = {}) => ({
  id: "account-primary-a1b2c3d4", kind: "main", periodLabel: "Undated account", sourceHeading: "Main listing",
  timeKind: "source_listing", timeRelation: "unspecified", sortYear: null, subjectKind: "record_context",
  realization: "reported", coverage: "captured_source", stateId: null,
  revision: "exact-description-revision-001", sourceRevision: "exact-source-revision-002",
  sourcePaths: ["source.specification[1]"], normalizationProfile: "fixture/v1", stopCount: 2, componentCount: 3,
  source: { id: "source-record-1", source: "orgbase", url: "https://example.org/source" },
  groups: [{ label: "Hauptwerk", compass: "C–g³", entries: [
    { id: "stop-1", kind: "stop", label: "Flûte harmonique", pitch: "8", wording: "Flûte harmonique 8", sourcePaths: ["stops[0]"], dates: [], recoveredFromHeading: false },
    { id: "stop-2", kind: "stop", label: "Quinte_%", pitch: "2 2/3′", wording: "Quinte_% 2 2/3′", sourcePaths: ["stops[1]"], dates: [], recoveredFromHeading: false },
    { id: "control-1", kind: "coupler", label: "Manual coupling", pitch: null },
  ] }], technicalFacts: [], otherComponents: [], ...overrides,
});
const chronology = (overrides = {}) => ({
  contract: "modavis.source-account-recovery/v1", configurationDateState: "not_established", claims: [],
  sourceObservations: [{ kind: "source_retrieval", expression: "2026-09-12T11:25:00Z" }],
  eventAssociations: [{ eventId: "event/1", relation: "qualified_context", causalRelationshipEstablished: false }],
  eventAssociationState: "qualified", ...overrides,
});
const organ = accounts => ({ id: "MDVS:ENTY:FIXTURE", specificationDescriptions: accounts, componentHierarchy: [], sourceSpecifications: [] });
function renderWorkspace(accounts, query = "") {
  browser.location.search = query;
  return render(OrganSpecificationDescriptions, { organ: organ(accounts), components: createElement("p", null, "Existing component evidence") });
}

test("single source account has a primary account view without an empty chooser or dead comparison", () => {
  const html = renderWorkspace([description()]);
  assert.match(html, /Source accounts/);
  assert.doesNotMatch(html, /aria-label="Source accounts"|id="organ-description"|Compare accounts/);
  assert.match(html, /description-single-account/);
  assert.match(html, /Its complete survey date and present condition are not established/);
});

test("same source and undated period remain distinguishable by heading and stable identity fallback", () => {
  const first = description();
  const second = description({ id: "account-second-87654321", sourceHeading: "Later unnumbered listing" });
  assert.notEqual(sourceAccountLabel(first, [first, second]), sourceAccountLabel(second, [first, second]));
  const html = renderWorkspace([first, second], `?description=${second.id}&descriptionRevision=${second.revision}`);
  assert.match(html, /<option value="account-second-87654321" selected="">Undated account · orgbase · Later unnumbered listing/);
  const duplicate = description({ id: "account-second-a1b2c3d4" });
  assert.notEqual(sourceAccountLabel(first, [first, duplicate]), sourceAccountLabel(duplicate, [first, duplicate]));
  assert.equal(preferredSpecificationDescription([first, second], second.id).id, second.id);
});

test("unavailable and self comparison links produce an explicit notice without replacing the loaded URL", () => {
  const first = description();
  const query = `?description=${first.id}&descriptionRevision=${first.revision}&compare=missing&compareRevision=old`;
  assert.match(renderWorkspace([first], query), /linked comparison account is unavailable/);
  assert.equal(browser.location.search, query);
  assert.match(renderWorkspace([first], `?compare=${first.id}`), /same source account twice/);
  assert.match(renderWorkspace([first], "?compare="), /Clear comparison/);
});

test("exact revision and explicit retained-transfer links still select their intended accounts", () => {
  const recovered = description();
  const retained = description({ id: "retained-transfer", coverage: "retained_source_transfer", sourceHeading: "Transferred rows" });
  assert.equal(preferredSpecificationDescription([retained, recovered], null).id, recovered.id);
  const html = renderWorkspace([retained, recovered], `?description=${retained.id}&descriptionRevision=${retained.revision}`);
  assert.match(html, /<option value="retained-transfer" selected="">/);
  assert.match(html, /original transferred rows remain available/);
  assert.doesNotMatch(html, /linked revision is unavailable/);
  assert.match(renderWorkspace([recovered], "?descriptionRevision=older-revision"), /pins a description revision without identifying/);
});

test("invalid account or comparison pins refuse both source and component views without changing the URL", () => {
  const first = description();
  const second = description({ id: "second-account", revision: "exact-second-revision" });
  const invalid = [
    "description=missing", "description=", `description=${first.id}&descriptionRevision=stale`,
    `description=${first.id}&descriptionRevision=`, "descriptionRevision=orphan", "compareRevision=orphan",
    `description=${first.id}&compare=${second.id}&compareRevision=stale`,
    `description=${first.id}&compare=${second.id}&compareRevision=`,
    "compare=missing", `compare=${first.id}`, "description=first&description=second",
    "descriptionRevision=a&descriptionRevision=b", "compareRevision=a&compareRevision=b",
    "specificationSource=first&specificationSource=second", "component=first&component=second",
    "pipe=first&pipe=second", "tab=specification&tab=history", "specificationView=components&specificationView=descriptions",
  ];
  for (const query of invalid) for (const view of ["", "&specificationView=components"]) {
    const url = `?${query}${view}`;
    const html = renderWorkspace([first, second], url);
    assert.match(html, /role="alert"/, query);
    assert.doesNotMatch(html, /Loading source description|Existing component evidence|description-sidebar|description-stoplist/, query);
    assert.equal(browser.location.search, url);
  }
  const valid = `?description=${first.id}&descriptionRevision=${first.revision}&compare=${second.id}&compareRevision=${second.revision}`;
  assert.doesNotMatch(renderWorkspace([first, second], valid), /role="alert"/);
  assert.match(renderWorkspace([first, second], `${valid}&specificationView=components`), /Existing component evidence/);
});

test("refusal gate prevents description fetches; valid exact pairs retain the two requested revisions", () => {
  const first = description();
  const second = description({ id: "second-account", revision: "exact-second-revision" });
  function invoke(query) {
    const calls = [];
    const exports = {};
    const code = ts.transpileModule(readFileSync(new URL("../src/organSpecificationDescriptions.tsx", import.meta.url), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const react = { ...require("react"), useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }), useEffect: effect => effect() };
    runInNewContext(code, {
      exports, URLSearchParams,
      window: { location: { search: query }, addEventListener() {}, removeEventListener() {} },
      require: id => id === "react" ? react : id === "./uiLocale" ? {useUiLocale: testUiLocale} : id === "./api" ? { fetchSpecificationDescription: async (organId, account) => { calls.push({ organId, id: account.id, revision: account.revision }); return account; } }
        : id.endsWith(".css") ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id),
    });
    exports.OrganSpecificationDescriptions({ organ: organ([first, second]), components: null });
    return calls;
  }
  for (const query of ["?description=missing", `?description=${first.id}&descriptionRevision=stale`, "?compare=missing", "?compareRevision=orphan", "?description=first&description=second"]) {
    assert.equal(invoke(query).length, 0, query);
    assert.equal(invoke(`${query}&specificationView=components`).length, 0, query);
  }
  const calls = invoke(`?description=${first.id}&descriptionRevision=${first.revision}&compare=${second.id}&compareRevision=${second.revision}`);
  assert.deepEqual(calls, [
    { organId: "MDVS:ENTY:FIXTURE", id: first.id, revision: first.revision },
    { organId: "MDVS:ENTY:FIXTURE", id: second.id, revision: second.revision },
  ]);
});

test("critical source, partial recovery, proposed and relative-date qualifications stay outside disclosures", () => {
  const account = description({ realization: "proposed", coverage: "partial_structured_stops", chronology: chronology({
    unresolvedStoplistRowCount: 3, sourceRelativeContext: { temporalRelation: "before", boundaryYear: 1862 },
  }) });
  const html = render(SourceAccountQualification, { description: account });
  assert.doesNotMatch(html, /<details/);
  assert.match(html, /does not establish that the design was built/);
  assert.match(html, /3 source rows could not be interpreted/);
  assert.match(html, /not a complete register total/);
  assert.match(html, /before 1862/);
  assert.match(html, /not an exact configuration year/);
});

test("advanced evidence is closed initially while exact revisions, paths, source URLs and event limits remain accessible", () => {
  const account = description({ chronology: chronology() });
  const html = render(DescriptionEvidence, { description: account });
  assert.match(html, /^<details class="description-disclosure description-account-evidence"><summary>/);
  assert.doesNotMatch(html, /<details[^>]*\bopen[= >]/);
  for (const text of [account.revision, account.sourceRevision, account.id, account.source.id, account.sourcePaths[0]]) assert.ok(html.includes(text));
  assert.match(html, /href="https:\/\/example.org\/source"/);
  assert.match(html, /href="\/events\/event%2F1"/);
  assert.match(html, /does not establish that the event caused this configuration/);
  const compact = render(ConfigurationChronology, { description: account });
  assert.ok(compact.indexOf("configuration date for this description is not established") < compact.indexOf("<details"));
  assert.ok(compact.indexOf("Latest recorded source capture") > compact.indexOf("<details"));
  assert.match(compact, /access date, not an organ survey date/);
});

test("source totals stay visible with qualifications and non-additive register/transmission wording", () => {
  const html = render(SourceReportedTotals, { facts: [
    { id: "total", family: "stop_total", label: "Stops", value: "about 23", qualificationGuidance: "Qualified source expression; no usable numeric total.", summaryEvidence: { evidence: [{ wording: "about 23", sourcePath: "summary.stops" }] } },
    { id: "availability", family: "stoplist_availability", label: "Stoplist", value: "Explicitly unavailable" },
  ] });
  assert.ok(html.indexOf("about 23") < html.indexOf("<details"));
  assert.ok(html.indexOf("Qualified source expression") < html.indexOf("<details"));
  assert.match(html, /Explicitly unavailable/);
  const account = description({ chronology: chronology({ accountSourceFacts: [
    { family: "register_total", label: "Registers", value: "12", wording: "12 Register" },
    { family: "transmission_total", label: "Transmissions", value: "3", wording: "3 Transmissionen" },
  ] }) });
  const totals = render(SourceAccountTotals, { description: account });
  assert.match(totals, /not added to each other/);
  assert.match(totals, /12 Register/);
  assert.match(totals, /3 Transmissionen/);
  assert.doesNotMatch(totals, />15</);
});

test("captured and source-reported stop discrepancies stay separate without interpreting qualified totals", () => {
  const fact = { id: "source-stop-total", family: "stop_total", label: "Stops / registers", value: "105", sourcePath: "specifications.stop_count", revision: "fact-revision" };
  const account = description({ stopCount: 107, technicalFacts: [fact] });
  const html = render(StopCountDifference, { description: account });
  assert.match(html, /105 stops \/ registers/);
  assert.match(html, /107 captured stop rows/);
  assert.match(html, /retained separately/);
  for (const value of ["about 105", "105 + 2 transmissions", "105–107", "105.5", "unknown", "9007199254740993"]) {
    assert.equal(render(StopCountDifference, { description: description({ technicalFacts: [{ ...fact, value }] }) }), "");
  }
  assert.equal(render(StopCountDifference, { description: description({ stopCount: 105, technicalFacts: [fact] }) }), "");
  assert.equal(render(StopCountDifference, { description: description({ technicalFacts: [{ ...fact, qualificationGuidance: "Questionable source value." }] }) }), "");
  const evidence = render(SourceReportedTotals, { facts: [fact] });
  assert.match(evidence, /Source field: <code>specifications.stop_count<\/code>/);
  assert.match(evidence, /Fact revision: <code>fact-revision<\/code>/);
});

test("local stop filtering preserves source wording, order, groups, non-stop exclusions and original counts", () => {
  const account = description();
  const frozen = JSON.stringify(account);
  assert.equal(filterDescriptionStops(account.groups, "FLU\u0302TE")[0].entries[0].label, "Flûte harmonique");
  assert.equal(filterDescriptionStops(account.groups, "_%")[0].entries[0].id, "stop-2");
  assert.equal(filterDescriptionStops(account.groups, "2 2/3′")[0].entries[0].pitch, "2 2/3′");
  assert.equal(filterDescriptionStops(account.groups, "Manual coupling").length, 0);
  assert.equal(filterDescriptionStops(account.groups, "missing").length, 0);
  assert.deepEqual(Array.from(filterDescriptionStops(account.groups, "")[0].entries, entry => entry.id), ["stop-1", "stop-2"]);
  assert.equal(JSON.stringify(account), frozen);
});

test("rendered stoplist starts expanded, labels its local filter and never presents unavailable detail as zero stops", () => {
  const renderEntries = (_, group) => createElement("ul", null, group.entries.map(entry => createElement("li", { key: entry.id }, entry.label)));
  const html = render(DescriptionStoplist, { organId: "MDVS:ENTY:FIXTURE", description: description(), renderEntries });
  assert.match(html, /<label for="description-stop-search">Find a stop in this account/);
  assert.match(html, /aria-controls="description-stoplist-results"/);
  assert.match(html, /id="source-account-stoplist" tabindex="-1" aria-label="Stoplist from this source account"/);
  assert.match(html, /Flûte harmonique/);
  assert.match(html, /Source compass · C–g³/);
  assert.doesNotMatch(html, /<details|Manual coupling/);
  const empty = render(DescriptionStoplist, { organId: "MDVS:ENTY:FIXTURE", description: description({ stopCount: 0, groups: [] }), renderEntries });
  assert.match(empty, /does not mean the organ has no stops/);
  assert.doesNotMatch(empty, /type="search"|>0 stops/);
});

function stoplistInteractionHarness() {
  const exports = {};
  let active;
  const react = {
    ...require("react"),
    useState(initial) {
      const instance = active;
      const slot = instance.cursor++;
      if (!(slot in instance.cells)) instance.cells[slot] = typeof initial === "function" ? initial() : initial;
      return [instance.cells[slot], next => { instance.cells[slot] = typeof next === "function" ? next(instance.cells[slot]) : next; }];
    },
    useRef(initial) {
      const slot = active.cursor++;
      return active.cells[slot] ??= { current: initial };
    },
  };
  const code = ts.transpileModule(readFileSync(new URL("../src/organSpecificationDescriptions.tsx", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, URLSearchParams, require: id => id === "react" ? react : id === "./uiLocale" ? {useUiLocale: testUiLocale}
    : id.endsWith(".css") ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id) });
  function find(node, predicate) {
    if (!node || typeof node !== "object") return undefined;
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    return predicate(node) ? node : find(node.props?.children, predicate);
  }
  return {
    mount(props) {
      const instance = { cells: [], cursor: 0 };
      let tree;
      let focusCount = 0;
      function rerender() {
        active = instance;
        instance.cursor = 0;
        tree = exports.DescriptionStoplist(props);
        active = undefined;
        const input = find(tree, node => node.type === "input");
        if (input) input.props.ref.current = { focus() { focusCount++; } };
      }
      rerender();
      return {
        query: () => find(tree, node => node.type === "input").props.value,
        html: () => renderToStaticMarkup(tree),
        change(value) { find(tree, node => node.type === "input").props.onChange({ target: { value } }); rerender(); },
        click(text) { const button = find(tree, node => node.type === "button" && node.props.children === text); assert.ok(button, `Missing ${text} button`); button.props.onClick(); rerender(); },
        focusCount: () => focusCount,
      };
    },
  };
}

test("stop filter survives component navigation and remount only for the exact organ, account and revision", () => {
  const harness = stoplistInteractionHarness();
  let destination = "account";
  const account = description({ groups: [{ label: "Hauptwerk", compass: "C–g³", entries: [
    { id: "trichter", kind: "stop", label: "Trichterregal", pitch: "8" },
    { id: "flute", kind: "stop", label: "Flöte", pitch: "4" },
  ] }] });
  const renderEntries = (_, group) => createElement("ul", null, group.entries.map(entry => createElement("li", { key: entry.id },
    createElement("button", { onClick: () => { destination = "component"; } }, entry.label))));
  const props = { organId: "MDVS:ENTY:HAMBURG", description: account, renderEntries };
  let page = harness.mount(props);
  page.change("Trichter");
  assert.match(page.html(), /1 of 2 listed entries shown/);
  assert.doesNotMatch(page.html(), /Flöte/);
  page.click("Trichterregal");
  assert.equal(destination, "component");
  page = null; // The organ section unmounts on its component route.
  destination = "account"; // Browser Back remounts the same immutable account.
  page = harness.mount(props);
  assert.equal(page.query(), "Trichter");
  assert.match(page.html(), /1 of 2 listed entries shown/);
  assert.equal(harness.mount({ ...props, organId: "MDVS:ENTY:OTHER" }).query(), "");
  assert.equal(harness.mount({ ...props, description: { ...account, id: "different-account" } }).query(), "");
  assert.equal(harness.mount({ ...props, description: { ...account, revision: "different-revision" } }).query(), "");
  assert.equal(harness.mount(props).query(), "Trichter");
});

test("Clear removes the saved stop filter and returns keyboard focus to its input", () => {
  const harness = stoplistInteractionHarness();
  const props = { organId: "MDVS:ENTY:FIXTURE", description: description(), renderEntries: () => null };
  const page = harness.mount(props);
  page.change("Flûte");
  assert.equal(harness.mount(props).query(), "Flûte");
  page.click("Clear");
  assert.equal(page.query(), "");
  assert.equal(page.focusCount(), 1);
  assert.equal(harness.mount(props).query(), "");
  page.change("Quinte");
  page.change(""); // Native search-field clearing follows the same path.
  assert.equal(harness.mount(props).query(), "");
});

test("stop filter memory retains at most twenty recently used exact accounts", () => {
  const harness = stoplistInteractionHarness();
  const props = index => ({ organId: "MDVS:ENTY:FIXTURE", description: description({ id: `account-${index}` }), renderEntries: () => null });
  for (let index = 0; index < 20; index++) harness.mount(props(index)).change(`filter-${index}`);
  assert.equal(harness.mount(props(0)).query(), "filter-0"); // Revisited account is recent.
  harness.mount(props(20)).change("filter-20");
  assert.equal(harness.mount(props(1)).query(), "");
  assert.equal(harness.mount(props(0)).query(), "filter-0");
  for (let index = 2; index <= 20; index++) assert.equal(harness.mount(props(index)).query(), `filter-${index}`);
  harness.mount(props(5)).click("Clear");
  harness.mount(props(21)).change("filter-21");
  assert.equal(harness.mount(props(0)).query(), "filter-0"); // Clear freed a slot.
  assert.equal(harness.mount(props(5)).query(), "");
});
