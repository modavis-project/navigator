import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { Children, createElement, isValidElement, useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { testUiLocale } from "./ui-locale-test-support.mjs";
import { LoadingContent, UpdatingContent } from "./loading-content-test-support.mjs";

// Render the actual route components and their helpers, without importing the
// application's browser/service startup. Only decorative icons and unrelated
// featured-card/map/application modules are replaced.
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("App.tsx", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = [
  "ExploreSection", "PublicEntityGateway", "SearchAssistPanel", "EntitySearchPanel",
  "publicSearchGroupLabel", "publicSearchBadgeVisible", "publicSearchSummary", "entityStateClass",
  "entitySearchGroups", "groupEntitySearchResults", "buildEntitySearchSuggestions",
  "searchResultTarget", "exactSearchAffordance", "mapSearchHref", "Metric",
  "OrganList", "EmptyState", "OrganFilterPanel", "CatalogSearchControl", "optionRows",
  "organStatusLabel", "organInstitutionLabel", "organPlaceLabel", "organPublicUrl", "actorValue",
  "labelForLocationState", "labelForMediaState", "labelForReviewState", "friendlyLabel", "formatInteger",
  "organFiltersFromParams", "normalizeOrganCatalogFilters", "normalizeOrganCatalogSort", "literatureScanFilter",
];
const extracted = names.map(name => {
  const node = parsed.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(node, `Missing actual application function ${name}`);
  return node.getText(parsed);
});
const renderWindow = parsed.statements.find(statement => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(declaration => declaration.name.getText(parsed) === "ORGAN_RENDER_WINDOW_SIZE"));
assert.ok(renderWindow, "Missing actual organ render limit");
const noOp = () => {};
const context = {
  exports: {}, require: createRequire(import.meta.url), URL, URLSearchParams,
  useUiLocale: testUiLocale,
  LoadingContent, UpdatingContent,
  window: { location: { origin: "https://navigator.test" } },
  useEffect, useRef, useState,
  ...Object.fromEntries([
    "Search", "ChevronRight", "MapIcon", "Library", "Layers3", "ListChecks", "MapPin",
    "UserRound", "Building2", "ArrowDownWideNarrow", "Filter", "Image", "X",
    "ApplicationsPreview", "OrganCardButton", "MapPreview",
  ].map(name => [name, () => null])),
};
vm.runInNewContext(ts.transpileModule([renderWindow.getText(parsed), ...extracted].join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, context);
const render = (name, props) => renderToStaticMarkup(createElement(context[name], props));
const number = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
const facets = {
  countries: [], builders: [], institutions: [], locationStates: [], mediaStates: [], sources: [],
  periodBuckets: [], evidenceStates: [], conflictScopes: [], specificationStates: [], stopCountBuckets: [],
  eventTypes: [], historyStates: [], mediaKinds: [], sourceCountBuckets: [], reviewStates: [], statuses: [],
};
const exploreProps = {
  active: true, capabilities: [], entitySearch: null, error: null, explore: null, datasetCounts: null,
  entitySearchError: null, entitySearchLoading: false, organOpenError: null,
  loading: false, organFacets: facets, publicDatasetProfile: true, releaseVersion: "1.6", query: "",
  searchPreviewOpen: false, searchPreviewError: null,
  onApplyOrganFilters: noOp, onOpenOrgan: noOp, onOpenSection: noOp, onQueryChange: noOp, onRetry: noOp, onRetryOrgan: noOp,
  onSearchInput: noOp, onSearchSubmit: noOp, onSearchRetry: noOp, onSearchPreviewChange: noOp,
};
const gatewayProps = {
  facets, publicDatasetProfile: true, georeferencingBacklog: 0, includeMedia: false,
  loading: false, organTotal: null, queryActive: false,
  onApplyOrganFilters: noOp, onOpenSection: noOp, onQueryChange: noOp,
};
const filterProps = {
  facets, filters: {}, mediaAvailable: false, publicProjection: true, staffMode: false,
  onChange: noOp, onClear: noOp, onQueryChange: noOp, onSortChange: noOp,
  query: "", sort: "stops", total: 0, loading: false, unavailable: false,
};
const decode = value => value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'");
const links = html => [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map(([, href, content]) => ({ href: decode(href), text: decode(content.replace(/<[^>]*>/g, "")).trim() }));
const findElement = (tree, predicate) => {
  if (!isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of Children.toArray(tree.props.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
};

test("discovery presents the labelled search before coverage and collection browsing", () => {
  const html = render("ExploreSection", { ...exploreProps, query: "Bach" });
  const search = html.indexOf('aria-label="Search the dataset"');
  const metrics = html.indexOf('aria-label="Whole dataset coverage"');
  const gateway = html.indexOf('aria-label="Public catalog entry points"');
  assert.ok(search >= 0 && search < metrics && metrics < gateway);
  assert.match(html, /<input[^>]*aria-label="Search the MODAVIS catalog"/);
  assert.match(html, /<button[^>]*type="submit"[^>]*>Search<\/button>/);
  assert.match(html, /<button[^>]*aria-label="Clear search"[^>]*>Clear<\/button>/);
  assert.match(html, /id="discovery-results" tabindex="-1"/);
  assert.ok(links(html).some(link => link.href === "/pod-explorer" && link.text.startsWith("Explore all collections")));
});

test("search submission focuses the result region and clearing restores the search input", () => {
  let resultsFocused = false, inputFocused = false, submitted = false, changed, typed;
  context.document = { getElementById: id => id === "discovery-results" ? { focus: () => { resultsFocused = true; } } : null };
  const tree = context.ExploreSection({
    ...exploreProps, query: "Bach",
    onQueryChange: value => { changed = value; },
    onSearchInput: value => { typed = value; },
    onSearchSubmit: () => { submitted = true; },
  });
  findElement(tree, node => node.type === "input").props.onChange({ target: { value: "Bach " } });
  findElement(tree, node => node.type === "form").props.onSubmit({ preventDefault: noOp });
  findElement(tree, node => node.props["aria-label"] === "Clear search").props.onClick({
    currentTarget: { parentElement: { querySelector: selector => selector === "input" ? { focus: () => { inputFocused = true; } } : null } },
  });
  assert.equal(resultsFocused, true);
  assert.equal(inputFocused, true);
  assert.equal(submitted, true);
  assert.equal(typed, "Bach ");
  assert.equal(changed, "");
  delete context.document;
});

test("whole-dataset coverage stays separate from matching organ records", () => {
  const html = render("ExploreSection", {
    ...exploreProps, query: "Bach", datasetCounts: { organs: 215769, sourceEvidence: 511237, mapped: 170000 },
    explore: { query: "Bach", counts: { organs: 5, georeferencingBacklog: 0 }, featuredOrgans: [], mapItems: [] },
  });
  assert.ok(html.includes(`<strong>${number(215769)}</strong><span>Organ records · whole dataset`));
  assert.ok(html.includes(`<strong>${number(511237)}</strong><span>Source records · whole dataset`));
  assert.doesNotMatch(html, /5 matching organ records with source-attributed/);
  assert.ok(html.includes(`${number(215769)} organ records with source-attributed`));
  assert.doesNotMatch(html, /A selection from the current search/);
  assert.match(html, /not a count of physical instruments or unique historical events/);
});

test("unsupported or failed discovery summary remains unknown instead of claiming zero", () => {
  const html = render("ExploreSection", { ...exploreProps, error: "Discovery summary unavailable" });
  assert.match(html, /role="alert"><p>Discovery summary unavailable<\/p>/);
  assert.match(html, />Try again<\/button>/);
  assert.match(html, /Browse organ records and their source-attributed specifications/);
  assert.match(html, /<strong>…<\/strong><span>Organ records · whole dataset/);
  assert.doesNotMatch(html, /(?:^|\D)0 (?:matching )?organ records/);
  assert.ok(links(html).some(link => link.href === "/organs" && link.text === "Browse organs"));
});

test("a stale search summary is not attributed to a new query, while a measured zero is shown", () => {
  const explore = { query: "old query", counts: { organs: 7 }, featuredOrgans: [], mapItems: [] };
  const stale = render("ExploreSection", { ...exploreProps, query: "new query", explore });
  assert.doesNotMatch(stale, /7 matching organ records/);
  const zero = render("PublicEntityGateway", { ...gatewayProps, organTotal: 0, queryActive: true });
  assert.match(zero, /0 matching organ records with source-attributed/);
  const pending = render("PublicEntityGateway", { ...gatewayProps, loading: true });
  assert.match(pending, /Organ pages and coverage are loading/);
  assert.doesNotMatch(pending, /0 organ records/);
});

test("public gateway actions link to the collection and supported filter named by the action", () => {
  const found = links(render("PublicEntityGateway", gatewayProps));
  const expected = {
    "Browse organs": "/organs",
    "Browse all places": "/pod-explorer?collection=places",
    "Browse all people": "/persons",
    "Explore places and venues": "/pod-explorer?collection=places",
    "Browse virtual instruments": "/virtual-instruments",
    "Linked to organs": "/virtual-instruments?organ_link=linked",
    "No confirmed organ link": "/virtual-instruments?organ_link=unlinked",
  };
  for (const [label, href] of Object.entries(expected)) {
    assert.equal(found.find(link => link.text === label)?.href, href, label);
  }
  assert.ok(!found.some(link => /downloaded/i.test(link.text + link.href)));
});

const groupFixture = {
  query: "Bach & St. Peter", total: 12, totalScope: "matching_records", limit: 4,
  items: [
    { kind: "organ", entityType: "organ", targetId: "ORGAN-1", title: "Example organ", searchGroup: "organs" },
    { kind: "canonical_actor", entityType: "person", targetId: "PERSON-1", title: "Example builder", searchGroup: "people", url: "/persons/PERSON-1" },
    { kind: "place", entityType: "place", targetId: "PLACE-1", title: "Example place", searchGroup: "places", url: "/places/PLACE-1" },
    { kind: "event", entityType: "event", targetId: "EVENT-1", title: "Example assertion", searchGroup: "events", url: "/events/EVENT-1" },
  ],
  groups: [
    { id: "organs", label: "Organs", total: 3 },
    { id: "people", label: "People and builders", total: 3 },
    { id: "places", label: "Places", total: 3 },
    { id: "events", label: "Documented event assertions", total: 3 },
  ],
};

test("public results and query handoffs work without a catalog or map preview response", () => {
  const html = render("ExploreSection", { ...exploreProps, query: groupFixture.query, loading: true, entitySearch: groupFixture });
  assert.match(html, /4 of 12 matches shown/);
  assert.match(html, /Example organ/);
  assert.doesNotMatch(html, /A selection from the current search/);
  const handoffs = links(html).filter(link => /Search the organ catalog|Map with this search/.test(link.text));
  assert.deepEqual(handoffs.map(link => {
    const url = new URL(link.href, "https://navigator.test");
    assert.equal(url.searchParams.get("q"), groupFixture.query);
    return url.pathname;
  }), ["/organs", "/map"]);
});

test("ranked search loading and retry are independent from the discovery summary", () => {
  const props = { ...exploreProps, query: "Silbermann" };
  const pending = render("ExploreSection", { ...props, entitySearchLoading: true });
  assert.match(pending, /aria-busy="true"/);
  assert.match(pending, /Searching…/);
  assert.doesNotMatch(pending, /No entity matches/);
  const failed = render("ExploreSection", { ...props, entitySearchError: "Ranked search failed" });
  assert.match(failed, /Search unavailable/);
  assert.match(failed, /role="alert"><p>Ranked search failed<\/p>/);
  assert.match(failed, /Try again/);
  assert.doesNotMatch(failed, /No entity matches/);
});

test("the optional public organ preview is collapsed and has an independent loading and error state", () => {
  const props = { ...exploreProps, query: groupFixture.query, entitySearch: groupFixture };
  const closed = render("ExploreSection", props);
  assert.match(closed, /<details class="discovery-browse"><summary>Preview matching organs and map<\/summary><\/details>/);
  assert.doesNotMatch(closed, /A selection from the current search/);
  const pending = render("ExploreSection", { ...props, searchPreviewOpen: true, loading: true });
  assert.match(pending, /Loading the organ and map preview…/);
  assert.match(pending, /4 of 12 matches shown/);
  const failed = render("ExploreSection", { ...props, searchPreviewOpen: true, searchPreviewError: "Preview failed" });
  assert.match(failed, /Preview failed/);
  assert.match(failed, /4 of 12 matches shown/);
  assert.doesNotMatch(failed, /Search unavailable/);
  let opened = null;
  const tree = context.ExploreSection({ ...props, onSearchPreviewChange: value => { opened = value; } });
  const details = findElement(tree, node => node.type === "details" && typeof node.props.onToggle === "function");
  details.props.onToggle({ currentTarget: { open: true } });
  assert.equal(opened, true);
});

test("a failed organ link has its own focusable alert and retry action", () => {
  const props = { ...exploreProps, query: groupFixture.query, entitySearch: groupFixture, organOpenError: "Could not open organ" };
  const html = render("ExploreSection", props);
  assert.match(html, /id="discovery-organ-open-error" role="alert" tabindex="-1"/);
  assert.match(html, /4 of 12 matches shown/);
  let retried = false;
  const tree = context.ExploreSection({ ...props, onRetryOrgan: () => { retried = true; } });
  const button = findElement(tree, node => node.type === "button" && node.props.children === "Try opening the organ again");
  button.props.onClick();
  assert.equal(retried, true);
});

test("truncated search groups continue into their real collections with the literal query retained", () => {
  const html = render("EntitySearchPanel", { search: groupFixture, onOpenOrgan: noOp, loading: false });
  const continuations = links(html).filter(link => link.text.startsWith("Continue in "));
  assert.equal(continuations.length, 4);
  const destinations = continuations.map(link => new URL(link.href, "https://navigator.test"));
  for (const url of destinations) assert.equal(url.searchParams.get("q"), groupFixture.query);
  assert.deepEqual(destinations.map(url => url.pathname).sort(), ["/events", "/organs", "/persons", "/pod-explorer"]);
  assert.equal(destinations.find(url => url.pathname === "/persons").searchParams.get("publication_state"), "canonical");
  assert.equal(destinations.find(url => url.pathname === "/pod-explorer").searchParams.get("collection"), "places");
  assert.match(html, /4 of 12 matches shown/);
});

test("complete groups do not offer a misleading remaining-results continuation", () => {
  const search = { ...groupFixture, total: 4, groups: groupFixture.groups.map(group => ({ ...group, total: 1 })) };
  const html = render("EntitySearchPanel", { search, onOpenOrgan: noOp, loading: false });
  assert.equal(links(html).filter(link => link.text.startsWith("Continue in ")).length, 0);
  assert.match(html, /4 of 4 matches shown/);
});

test("a broad source-text match is not promoted into a duplicate direct match", () => {
  const search = { query: "Bach", items: [{
    kind: "organ", entityType: "organ", targetId: "ORGAN-2", title: "Example chapel organ",
    match: { field: "source_text", value: "Bach", label: "Source text match" },
  }] };
  assert.equal(render("SearchAssistPanel", { query: "Bach", search, onOpenOrgan: noOp }), "");
  assert.match(render("EntitySearchPanel", { search, onOpenOrgan: noOp, loading: false }), /Example chapel organ/);
  assert.match(render("SearchAssistPanel", { query: "example chapel organ", search, onOpenOrgan: noOp }), /aria-label="Direct match"/);
});

test("a direct source identifier retains an encoded source-record destination", () => {
  const html = render("SearchAssistPanel", { query: "sr:collection:record/17", search: null, onOpenOrgan: noOp });
  assert.equal(links(html)[0]?.href, "/source/sr%3Acollection%3Arecord%2F17");
  assert.match(html, /Source record/);
});

test("an empty catalogue explains recovery while pending rows never claim no matches", () => {
  const empty = render("OrganList", { items: [], loading: false, onOpen: noOp, publicProjection: true });
  assert.match(empty, /No organs found/);
  assert.match(empty, /Broaden the search or clear the query/);
  const pending = render("OrganList", { items: [], loading: true, onOpen: noOp, publicProjection: true });
  assert.doesNotMatch(pending, /aria-busy="true"/);
  assert.match(pending, /role="status">Loading organ results…/);
  assert.match(pending, /class="loading-shapes loading-shapes-table[^"]*" aria-hidden="true"/);
  assert.doesNotMatch(pending, /No organs found/);
  const controls = render("OrganFilterPanel", { ...filterProps, query: "No matching organ", filters: { builder: "Example builder" } });
  assert.match(controls, /aria-label="Remove search filter"/);
  assert.match(controls, /aria-label="Remove builder filter"/);
  assert.match(controls, /<button[^>]*type="button"[^>]*>Clear filters<\/button>/);
});

test("catalogue links identify the documented place and the exact organ tab", () => {
  const organ = {
    id: "MDVS:ENTY:EXAMPLE", mdvsId: "MDVS:ENTY:EXAMPLE", pageUrl: "/organs/EXAMPLE",
    title: "Example Chapel", location: "Example Village", placePageUrl: "/places/fixture%3Aplace",
    status: "Published structured record", certainty: "Source-supported", sourceCount: 1, mediaCount: 2,
    specification: { stops: 0 },
  };
  const props = { items: [organ], loading: false, onOpen: noOp, publicProjection: true };
  const updating = render("OrganList", { ...props, loading: true });
  assert.match(updating, /role="status"><span aria-hidden="true"><\/span>Updating results…/);
  assert.match(updating, /class="organ-table-scroll" aria-busy="true"/);
  assert.deepEqual(links(render("OrganList", props)), [
    { href: "/organs/EXAMPLE", text: "Example ChapelMDVS:ENTY:EXAMPLE" },
    { href: "/organs/EXAMPLE?tab=specification", text: "0" },
    { href: "/places/fixture%3Aplace", text: "Example Village" },
    { href: "/organs/EXAMPLE?tab=media", text: "2" },
  ]);
  const provisional = { ...organ, catalogState: "provisional", pageUrl: "/source/fixture%3Aa" };
  const unresolved = { ...organ, placePageUrl: null, specification: { stops: null }, mediaCount: 0 };
  assert.deepEqual(links(render("OrganList", { ...props, items: [provisional] })).map(link => link.href), [
    "/source/fixture%3Aa", "/places/fixture%3Aplace",
  ]);
  assert.deepEqual(links(render("OrganList", { ...props, items: [unresolved] })).map(link => link.href), ["/organs/EXAMPLE"]);
});

test("catalogue count failure and pending states do not fabricate zero matching records", () => {
  const failed = render("OrganFilterPanel", { ...filterProps, unavailable: true });
  assert.match(failed, /role="status">Result count unavailable/);
  assert.doesNotMatch(failed, /0 matching organ records/);
  const pending = render("OrganFilterPanel", { ...filterProps, loading: true });
  assert.match(pending, /role="status">Loading results…/);
  assert.doesNotMatch(pending, /0 matching organ records/);
  assert.match(render("OrganFilterPanel", filterProps), /0 matching organ records/);
});

test("public media links retain their filter under supported URL spellings", () => {
  const mediaFacets = {
    ...facets,
    mediaStates: [{ state: "with_media", label: "With source media references", count: 1 }],
    mediaKinds: [{ kind: "all", label: "Source media references", count: 2 }],
  };
  for (const [key, alias, requestedState] of [
    ["media_state", "available", "available"],
    ["media_state", "with_media", "with_media"],
    ["has_media", "1", "available"],
    ["has_media", "true", "available"],
  ]) {
    const requested = context.organFiltersFromParams(new URLSearchParams({ [key]: alias, source: "fixture" }));
    const filters = context.normalizeOrganCatalogFilters(requested, true, true);
    assert.equal(requested.mediaState, requestedState);
    assert.equal(filters.mediaState, "with_media");
    assert.equal(filters.source, "fixture");
    const props = { ...filterProps, filters, mediaAvailable: true, facets: mediaFacets };
    const html = render("OrganFilterPanel", props);
    assert.match(html, /aria-pressed="true">\s*With media/);
    assert.match(html, /<option value="with_media" selected="">With source media references/);
    assert.match(html, /Media filtering is unavailable on the map/);
    assert.doesNotMatch(html, /Media type|Show these results on the map/);
  }
  assert.equal(context.organFiltersFromParams(new URLSearchParams("has_media=0")).mediaState, undefined);
  assert.equal(context.organFiltersFromParams(new URLSearchParams("has_media=true&media_state=with_media")).mediaState, "with_media");
});

test("literature scan URLs hydrate the matching option for both supported boolean spellings", () => {
  for (const value of ["yes", "true", "1"]) assert.equal(context.literatureScanFilter(value), "yes");
  for (const value of ["no", "false", "0"]) assert.equal(context.literatureScanFilter(value), "no");
  for (const value of [null, "", "unknown"]) assert.equal(context.literatureScanFilter(value), "");
});

test("catalogue capabilities determine effective filters and sort without changing the requested selection", () => {
  const requested = Object.freeze(context.organFiltersFromParams(new URLSearchParams(
    "country=Germany&institution=Example&year_from=1900&min_sources=2&media_state=with_media&media_kind=all&builder=Example",
  )));
  const publicFilters = context.normalizeOrganCatalogFilters(requested, true, false);
  assert.deepEqual(Object.fromEntries(Object.entries(publicFilters).filter(([, value]) => value)), { builder: "Example" });
  const privateFilters = context.normalizeOrganCatalogFilters(requested, false, true);
  assert.equal(privateFilters, requested);
  const privateWithoutMedia = context.normalizeOrganCatalogFilters(requested, false, false);
  assert.equal(privateWithoutMedia.country, "Germany");
  assert.equal(privateWithoutMedia.mediaState, undefined);
  assert.equal(privateWithoutMedia.mediaKind, undefined);
  assert.equal(requested.mediaState, "with_media");
  assert.equal(requested.yearFrom, "1900");

  const sort = context.normalizeOrganCatalogSort;
  assert.equal(sort(undefined, true, true), "stops");
  assert.equal(sort("label", true, true), "label");
  assert.equal(sort("media", true, true), "stops");
  assert.equal(sort("recent", true, true), "stops");
  assert.equal(sort(undefined, false, true), "label");
  assert.equal(sort("media", false, true), "media");
  assert.equal(sort("media", false, false), "label");
});
