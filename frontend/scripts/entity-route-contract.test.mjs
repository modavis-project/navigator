import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { testUiLocale } from "./ui-locale-test-support.mjs";
import { LoadingContent } from "./loading-content-test-support.mjs";

const appUrl = new URL("../src/App.tsx", import.meta.url);
const temperamentRoutesUrl = new URL("../src/temperamentOccurrences.ts", import.meta.url);

async function temperamentRoutes() {
  const source = await readFile(temperamentRoutesUrl, "utf8");
  const context = { exports: {}, URLSearchParams };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}

test("temperament catalogue detail links round trip the supported filter and page context", async () => {
  const { temperamentCatalogueHref, temperamentDetailHref, temperamentOrganHref } = await temperamentRoutes();
  const filters = new URLSearchParams({
    q: "Werckmeister III (modified)", scope: "evidence", group_key: "gruppe_5", precise_variant: "false",
    commentary_available: "true", commentary_q: "Example", sort: "occurrences_desc", occurrence_scope: "family",
    min_occurrences: "0", max_occurrences: "100", offset: "6",
  });
  const catalogue = `/temperaments?${filters}`;
  const detail = new URL(temperamentOrganHref("example/record", "family", `${catalogue}&unknown=discard`), "https://navigator.test");
  assert.equal(detail.pathname, "/temperaments/example%2Frecord");
  assert.equal(detail.searchParams.get("tab"), "organs");
  assert.equal(detail.searchParams.get("match"), "family");
  assert.equal(temperamentCatalogueHref(detail.searchParams.get("return_to")), catalogue);
  assert.equal(temperamentDetailHref("example"), "/temperaments/example");
  assert.equal(temperamentOrganHref("example"), "/temperaments/example?tab=organs");
  for (const value of [null, "//example.invalid/temperaments?q=wrong", "https://navigator.test/temperaments?q=wrong", "/temperaments/example?q=wrong", "/temperaments/../organs"]) {
    assert.equal(temperamentCatalogueHref(value), "/temperaments");
  }
});

test("a shared temperament comparison retains up to four distinct catalogue IDs through a detail return", async () => {
  const { readTemperamentComparison, temperamentCatalogueHref, temperamentDetailHref } = await temperamentRoutes();
  const query = new URLSearchParams({q: "Werckmeister", offset: "6", compare: "5hWe3,5hWe3,5hWe6Du,bad/path,7hRm,7hgl,other"});
  const catalogue = temperamentCatalogueHref(`/temperaments?${query}`);
  const detail = new URL(temperamentDetailHref("5hWe3", catalogue), "https://navigator.test");
  const returned = new URL(detail.searchParams.get("return_to"), "https://navigator.test");
  assert.equal(returned.searchParams.get("q"), "Werckmeister");
  assert.equal(returned.searchParams.get("offset"), "6");
  assert.deepEqual(Array.from(readTemperamentComparison(returned.searchParams)), ["5hWe3", "5hWe6Du", "7hRm", "7hgl"]);
  assert.deepEqual(Array.from(readTemperamentComparison(new URLSearchParams("compare=5hWe3&compare=5hWe6Du"))), []);
});

test("temperament detail provides a labelled panel and keyboard focus for each tab", async () => {
  const [source, routes] = await Promise.all([readFile(appUrl, "utf8"), temperamentRoutes()]);
  const start = source.indexOf("const TEMPERAMENT_DETAIL_TABS =");
  const end = source.indexOf("function TemperamentOrgansPanel(", start);
  const url = new URL("https://navigator.test/temperaments/example?tab=organs&match=family");
  let focused, destination, prevented;
  const context = {
    exports: {}, require: createRequire(import.meta.url), URL, URLSearchParams, ...routes,
    useUiLocale: testUiLocale,
    LoadingContent,
    useState: initial => [typeof initial === "function" ? initial() : initial, () => {}],
    useRef: () => ({ current: null }), useEffect: () => {}, positiveRouteInt: () => 0,
    window: { location: url, history: { pushState: (_state, _title, next) => { destination = next; } } },
    document: { getElementById: id => ({ focus: () => { focused = id; } }) },
  };
  vm.runInNewContext(ts.transpileModule(source.slice(start, end), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, context);
  const nodes = [];
  function collect(node) {
    if (Array.isArray(node)) return node.forEach(collect);
    if (!node?.props) return;
    nodes.push(node.props);
    collect(node.props.children);
  }
  collect(context.TemperamentDetailPage({ tuningId: "example" }));
  const tabs = nodes.filter(node => node.role === "tab");
  const panels = nodes.filter(node => node.role === "tabpanel");
  assert.equal(tabs.length, 3);
  assert.equal(panels.length, 3);
  for (const tab of tabs) {
    const panel = panels.find(panel => panel.id === tab["aria-controls"]);
    assert.equal(panel["aria-labelledby"], tab.id);
    assert.equal(panel.hidden, !tab["aria-selected"]);
    assert.equal(tab.tabIndex, tab["aria-selected"] ? 0 : -1);
  }
  const active = tabs.find(tab => tab["aria-selected"]);
  assert.equal(active.id, "temperament-tab-organs");
  active.onKeyDown({ key: "ArrowRight", preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(focused, "temperament-tab-overview");
  assert.equal(destination.searchParams.get("tab"), "overview");
  assert.equal(destination.searchParams.get("match"), "family");
});

test("event detail URLs retain the events section", async () => {
  const app = await readFile(appUrl, "utf8");
  const start = app.indexOf("function sectionFromPath(");
  const end = app.indexOf("function initialQuery(", start);
  const context = { SECTION_PATHS: { events: "/events", organs: "/organs" } };
  vm.runInNewContext(ts.transpileModule(app.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  assert.equal(context.sectionFromPath("/events/fixture%3Aevent%3Aconstruction"), "events");
  assert.equal(context.sectionFromPath("/events/MDVS%3AACTI%3ATEST-0001-A/"), "events");
  assert.equal(context.sectionFromPath("/events"), "events");
});

test("person and organization record URLs retain the public people section", async () => {
  const app = await readFile(appUrl, "utf8");
  const start = app.indexOf("function sectionFromPath(");
  const end = app.indexOf("function initialQuery(", start);
  const context = { SECTION_PATHS: { persons: "/persons", places: "/moderation/places" } };
  vm.runInNewContext(ts.transpileModule(app.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  for (const url of ["/people/TEST-0001-A", "/organizations/TEST-0002-B/", "/entity/people/TEST-0001-A", "/actors/actor%3Ar13%3Aexample", "/entity/source-actors/actor%3Ar13%3Aexample"]) {
    assert.equal(context.sectionFromPath(url), "persons");
  }
  assert.equal(context.sectionFromPath("/places/TEST-0003-C"), "pod-explorer");
  assert.equal(context.sectionFromPath("/areas/locadmin%3Aexample"), "map");
  assert.equal(context.sectionFromPath("/source/sr%3Aorgbase%3Aexample"), "pod-explorer");
});

test("primary organ navigation leaves an open specification and returns to the catalogue", async () => {
  const app = await readFile(appUrl, "utf8");
  const start = app.indexOf("  function navigate(");
  const end = app.indexOf("  function openResearchRoute(", start);
  assert(start > 0 && end > start);
  const state = { selectedOrgan: { id: "TEST-0001-A" }, activeTab: "specification", activeSection: "organs", mobileNavOpen: true };
  const context = { ...state, route: null, focused: null, organNavigationGeneration: { current: 0 } };
  for (const name of ["MobileNavOpen", "ActiveSection", "EvidenceRoute", "ResearchRoute", "PublicVocabRoute", "ShowMapQueue", "Query", "SelectedOrgan", "OrganSectionLoads", "ActiveTab", "DiscoveryOrganFailure"]) {
    const key = name[0].toLowerCase() + name.slice(1);
    context[`set${name}`] = (value) => { state[key] = value; };
  }
  context.updateRoute = (...values) => { context.route = values; };
  context.focusSection = (value) => { context.focused = value; };
  vm.runInNewContext(ts.transpileModule(app.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  context.navigate("organs");
  assert.equal(state.selectedOrgan, null);
  assert.equal(state.activeTab, "overview");
  assert.equal(state.mobileNavOpen, false);
  assert.deepEqual(context.route, ["organs", null]);
  assert.equal(context.focused, "organs");
});

test("a delayed organ response cannot reopen a record after primary navigation", async () => {
  const app = await readFile(appUrl, "utf8");
  const openStart = app.indexOf("  async function openOrgan(");
  const openEnd = app.indexOf("  async function openContributionOrgan(", openStart);
  const navStart = app.indexOf("  function navigate(");
  const navEnd = app.indexOf("  function openResearchRoute(", navStart);
  let resolveOrgan;
  let selected = null;
  const context = {
    activeSection: "organs", organNavigationGeneration: { current: 0 },
    currentCatalogReturnPath: () => null,
    fetchOrgan: () => new Promise((resolve) => { resolveOrgan = resolve; }),
    setSelectedOrgan: (value) => { selected = value; },
    updateRoute: () => {}, focusSection: () => {},
  };
  for (const name of ["MobileNavOpen", "ActiveSection", "EvidenceRoute", "ResearchRoute", "PublicVocabRoute", "ShowMapQueue", "Query", "OrganSectionLoads", "ActiveTab", "Error", "Research", "DiscoveryOrganFailure"]) {
    context[`set${name}`] = () => {};
  }
  vm.runInNewContext(ts.transpileModule(app.slice(openStart, openEnd) + app.slice(navStart, navEnd), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const pending = context.openOrgan("MDVS:ENTY:TEST-0001-A");
  context.navigate("organs");
  resolveOrgan({ id: "TEST-0001-A" });
  await pending;
  assert.equal(selected, null);
});

test("canonical identifier redirects preserve account and component context on canonical and legacy organ routes", async () => {
  const app = await readFile(appUrl, "utf8");
  const start = app.indexOf("function identifierResolutionDestination(");
  const end = app.indexOf("function routeOrganSort(", start);
  const parameters = new URLSearchParams({ tab: "specification", description: "specdesc:account-a",
    descriptionRevision: "a".repeat(64), compare: "specdesc:account-b", compareRevision: "b".repeat(64),
    specificationSource: "sr:example:record/17", specificationView: "components", component: "MDVS:COMP:EXAMPLE", pipe: "position:1", q: "unrelated search", token: "do-not-forward" });
  const context = { URL, URLSearchParams, SECTION_PATHS: { organs: "/organs" }, ORGAN_TABS: ["overview", "specification"],
    window: { location: { origin: "https://navigator.test", search: `?${parameters}` } } };
  vm.runInNewContext(ts.transpileModule(app.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  for (const path of ["/organs/7PDZ-MDM0-0", "/organs/MDVS%3AENTY%3A7PDZ-MDM0-0", "/organs?organ=MDVS%3AENTY%3A7PDZ-MDM0-0"]) {
    const result = new URL(context.identifierResolutionDestination(path), context.window.location.origin);
    for (const key of ["tab", "description", "descriptionRevision", "compare", "compareRevision", "specificationSource", "specificationView", "component", "pipe"]) {
      assert.equal(result.searchParams.get(key), parameters.get(key), `${path}: ${key}`);
    }
    assert.equal(result.searchParams.has("q"), false);
    assert.equal(result.searchParams.has("token"), false);
    assert.equal(result.origin, context.window.location.origin);
  }
  assert.match(
    app,
    /const destination = identifierResolutionDestination\(data\.pageUrl\)[\s\S]*?window\.location\.replace\(destination\)/,
    "identifier resolution must redirect through the tab-preserving destination helper",
  );
});

test("identifier view context refuses malformed or duplicate pins instead of downgrading the linked account", async () => {
  const app = await readFile(appUrl, "utf8");
  const start = app.indexOf("function identifierResolutionDestination(");
  const end = app.indexOf("function routeOrganSort(", start);
  const context = { URL, URLSearchParams, SECTION_PATHS: { organs: "/organs" }, ORGAN_TABS: ["overview", "specification"],
    window: { location: { origin: "https://navigator.test", search: "" } } };
  vm.runInNewContext(ts.transpileModule(app.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  for (const search of [
    "?description=a&descriptionRevision=invalid",
    "?compare=b&compareRevision=invalid",
    "?descriptionRevision=" + "a".repeat(64),
    "?compareRevision=" + "b".repeat(64),
    "?description=a&description=b&descriptionRevision=" + "a".repeat(64),
    "?description=a&descriptionRevision=" + "a".repeat(64) + "&descriptionRevision=" + "a".repeat(64),
    "?compare=", "?component=%0Ainvalid", "?tab=unsupported", "?specificationView=unsupported",
    "?specificationSource=one&specificationSource=two", "?component=one&component=two", "?pipe=" + "x".repeat(2049),
  ]) {
    context.window.location.search = search;
    assert.throws(() => context.identifierResolutionDestination("/organs/EXAMPLE"), /organ link/, search.slice(0, 100));
  }
  context.window.location.search = "?tab=specification&description=a&descriptionRevision=" + "a".repeat(64);
  for (const path of ["https://other.test/organs/EXAMPLE", "https://user:pass@navigator.test/organs/EXAMPLE", "/persons/EXAMPLE", "/organs", "/organs/EXAMPLE/extra", "/organs/EXAMPLE%2Fextra"]) {
    const destination = new URL(context.identifierResolutionDestination(path), context.window.location.origin);
    assert.equal(destination.searchParams.has("tab"), false, path);
    assert.equal(destination.searchParams.has("description"), false, path);
    assert.equal(destination.origin, context.window.location.origin);
  }
  assert.throws(() => context.identifierResolutionDestination("/organs/EXAMPLE?description=server-account"), /conflicts with the resolved destination/);
  assert.throws(() => context.identifierResolutionDestination("/organs/EXAMPLE?description=a&descriptionRevision=" + "b".repeat(64)), /conflicts with the resolved destination/);
  const pinned = new URL(context.identifierResolutionDestination("/organs/EXAMPLE?description=a&tab=overview"), context.window.location.origin);
  assert.equal(pinned.searchParams.get("description"), "a");
  assert.equal(pinned.searchParams.get("tab"), "overview");
  assert.equal(pinned.searchParams.get("descriptionRevision"), "a".repeat(64));
});

test("browser history closes an organ detail when it returns to the catalog route", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /const nextOrganId = routeOrganId\(\);[\s\S]*?else if \(!nextOrganId && nextSection === "organs" && selectedOrgan\) \{[\s\S]*?setSelectedOrgan\(null\)[\s\S]*?setOrganSectionLoads\(\{\}\)[\s\S]*?setActiveTab\("overview"\)/,
    "a popstate to the organ catalogue must clear the selected detail instead of leaving the old page mounted",
  );
});

test("source-scoped place identifiers use the canonical entity page", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /function isCanonicalEntityRoute[\s\S]*?normalizedId\.startsWith\("MDVS:ENTY:"\)[\s\S]*?\["places", "buildings"\]\.includes\(normalizedCategory\) && normalizedId\.startsWith\("MDVS:LOCN:"\)/,
    "MDVS:LOCN identifiers must be canonical for place and building routes",
  );
  assert.match(
    app,
    /if \(isCanonicalEntityRoute\(category, id\)\) \{\s*return \{ kind: "canonical_actor", category, id \}/,
    "decoded place routes must select the canonical actor dossier",
  );
});

test("source-scoped place pages expose established coordinates and organ links", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /const isPlace = actor\.entityType === "place" \|\| actor\.category === "places"/,
    "place dossiers must use their place-specific public presentation",
  );
  assert.match(
    app,
    /<span>Coordinates<\/span>[\s\S]*?\{coordinates\.lat\}, \{coordinates\.lon\}[\s\S]*?<a href="\/map">Open map<\/a>/,
    "established canonical coordinates must be visible and linked to the map",
  );
  assert.match(
    app,
    /function ActorRelationshipGroups[\s\S]*?const relatedUrl = relationship\.relatedUrl \|\| relationship\.entityPageUrl[\s\S]*?relatedKind === "Organ" \|\| relatedKind === "organ"/,
    "place-to-organ relationships must use their canonical organ URL and label",
  );
});

test("canonical relationships use bounded progressive groups", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /const key = `\$\{direction\}:\$\{relationType\.toLocaleLowerCase\(\)\}`[\s\S]*?targets: new Map/,
    "relationship links must be grouped by relation type and direction, then deduplicated by target",
  );
  assert.match(
    app,
    /const visibleItems = group\.items\.slice\(0, visibleCount\)[\s\S]*?aria-expanded=\{open\}/,
    "relationship groups must be collapsible and render only the current progressive window",
  );
  assert.match(
    app,
    /const ACTOR_RELATIONSHIP_BATCH_SIZE = 12[\s\S]*?visibleCounts\[group\.key\] \|\| ACTOR_RELATIONSHIP_BATCH_SIZE/,
    "large relationship groups must reveal links in bounded batches",
  );
  assert.match(
    app,
    /actorRelationshipMatches[\s\S]*?Search relationships[\s\S]*?Person, organization, place, organ, city, country/,
    "relationship search must cover connected entities and their geographical context",
  );
  assert.match(
    app,
    /actorRelationshipLocationSections[\s\S]*?actor-relationship-country[\s\S]*?actor-relationship-city/,
    "place-backed relationships must be grouped by country and city",
  );
  assert.match(
    app,
    /<ActorRelationshipGroups[\s\S]*?relationships=\{relationships\}[\s\S]*?staffMode=\{staffMode\}/,
    "canonical actor pages must render the grouped relationship component",
  );
  assert.match(
    app,
    /setMentionsOpen\(true\)[\s\S]*?Inspect \$\{formatNumber\(actor\.sourceRecordCount\)\} documented mentions[\s\S]*?actor\.collectionDelivery\?\.scope \? "Builder source records" : "Mentions"/,
    "actor support counts must retain inspection and qualify the bounded builder collection",
  );
  assert.match(
    app,
    /function ActorMentionsModal[\s\S]*?distinct supporting record[\s\S]*?It is not a separate data provider[\s\S]*?Search mentions/,
    "the mentions action must explain, group, and search supporting source records",
  );
});

test("organ history and activities provide distinct chronological and analytical views", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(
    app,
    /Chronological history[\s\S]*?history attached to this organ record[\s\S]*?do not by themselves prove uninterrupted material identity/,
    "history must explain its source-scoped chronological and material-identity limits",
  );
  assert.match(
    app,
    /Work and participants[\s\S]*?organized by controlled activity type where a mapping exists[\s\S]*?source-only wording remains visibly separate[\s\S]*?activityGroups\.map/,
    "activities must distinguish controlled mappings from source-only wording in the participant-oriented view",
  );
  assert.match(
    app,
    /timeline-source-attributions[\s\S]*?Source[\s\S]*?sourceAttributions\.map/,
    "every event card must expose restrained source attribution when it is available",
  );
  assert.match(
    app,
    /Event evidence[\s\S]*?Other source assertions remain independently attributed[\s\S]*?Aggregate year or label assertions are not guessed into one-to-one event alignments/,
    "event conflicts must remain source-attributed and must not imply unsupported event alignment",
  );
});
