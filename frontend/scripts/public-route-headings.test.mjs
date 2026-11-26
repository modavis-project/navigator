import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { LoadingContent, UpdatingContent } from "./loading-content-test-support.mjs";

const require = createRequire(import.meta.url);
function load(name, pathname, search = "") {
  const source = readFileSync(new URL(`../src/${name}.tsx`, import.meta.url), "utf8");
  const location = { pathname, search, origin: "https://navigator.test" };
  const context = {
    exports: {}, URL, URLSearchParams, location, window: { location }, document: { title: "Navigator" },
    require: id => {
      if (id === "./uiLocale") return load("uiLocale", pathname, search).exports;
      if (id === "./LoadingContent") return { LoadingContent, UpdatingContent };
      if (id === "./entityExport") return {
        useEntityPageTab: () => ({ activeTab: "overview", selectTab: () => {} }),
        EntityPageTabs: () => null,
        EntityTabPanel: ({ activeTab, tab, children }) => activeTab === tab ? children : null,
        EntityExportPanel: () => null,
      };
      if (id === "./publicExperience") return { IdentifierCopy: () => null };
      if (id.startsWith("./")) return {};
      return require(id);
    },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, context);
  return context;
}
const render = (component, props = {}) => renderToStaticMarkup(createElement(component, props));
const assertPageHeading = (html, title) => {
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.ok(html.includes(`<h1>${title}</h1>`), `Expected page heading: ${title}`);
};
const release = {
  title: "Pipe Organ Dataset", summary: "Public source evidence", changeFocus: "Explore records",
  limitations: [], countDefinitions: [], documentationPolicy: "Retained dataset evidence", releaseVersion: "1.6",
};

test("the API guide links both forms of the public reference", () => {
  const module = load("publicApiGuide", "/about/api");
  const html = render(module.exports.PublicApiGuide);
  assertPageHeading(html, "Navigator API guide");
  assert.match(html, /href="\/about\/api\?reference=1"/);
  assert.match(html, /href="\/navigator-api\.md" download=""/);
  for (const section of ["api-rest", "api-graphql", "api-reuse"]) {
    assert.ok(html.includes(`href="#${section}"`) && html.includes(`id="${section}"`));
  }
});

test("the tracked API reference renders tables, runnable examples and valid section links", () => {
  const module = load("publicApiReference", "/about/api", "?reference=1");
  const markdown = readFileSync(new URL("../public/navigator-api.md", import.meta.url), "utf8");
  const html = render(module.exports.PublicApiReferenceBody, { markdown });
  assert.match(html, /<table>/);
  assert.match(html, /<h2 id="graphql">GraphQL<\/h2>/);
  assert.match(html, /OrganAndPage/);
  assert.match(html, /Vox Humana\|8/);
  for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${anchor}"`), anchor);
  for (const row of markdown.split("\n").filter(line => line.startsWith("|"))) {
    assert.equal([...row.matchAll(/\|/g)].length, 3, row);
  }
  const untrusted = render(module.exports.PublicApiReferenceBody, { markdown: "## Links\n\n[x](javascript:alert(1)) <script>alert(1)</script>" });
  assert.doesNotMatch(untrusted, /href="javascript:|<script>/);
});

test("the German API reference preserves endpoint contracts, executable examples and section links", () => {
  const module = load("publicApiReference", "/about/api", "?reference=1");
  const english = readFileSync(new URL("../public/navigator-api.md", import.meta.url), "utf8");
  const german = readFileSync(new URL("../public/navigator-api.de.md", import.meta.url), "utf8");
  const endpointPaths = markdown => Array.from(markdown.matchAll(/`(\/[^`]+)`/g), match => match[1]).sort();
  const runnableExamples = markdown => Array.from(markdown.matchAll(/^```\w*\n([\s\S]+?)^```$/gm), match =>
    match[1].replace(/^# .*\n/gm, ""));
  const renderedSections = html => Array.from(html.matchAll(/<h[23] id="([^"]+)"/g), match => match[1]);
  const englishHtml = render(module.exports.PublicApiReferenceBody, { markdown: english });
  const germanHtml = render(module.exports.PublicApiReferenceBody, { markdown: german });
  assert.deepEqual(endpointPaths(german), endpointPaths(english));
  assert.deepEqual(runnableExamples(german), runnableExamples(english));
  assert.deepEqual(renderedSections(germanHtml), renderedSections(englishHtml));
  assert.match(germanHtml, /<h2 id="runtime-discovery">Verfügbare Funktionen prüfen<\/h2>/);
  for (const [, anchor] of germanHtml.matchAll(/href="#([^"]+)"/g)) assert.ok(germanHtml.includes(`id="${anchor}"`), anchor);
  for (const row of german.split("\n").filter(line => line.startsWith("|"))) {
    assert.equal([...row.matchAll(/\|/g)].length, 3, row);
  }
});

test("the public release guide owns its page h1 and the reviewer guide retains h2", () => {
  const module = load("releaseGuide", "/about/release");
  assertPageHeading(render(module.exports.ReleaseGuideArea, { context: { ...release, dataProfile: "pod-1.5-public" } }), release.title);
  const privateHtml = render(module.exports.ReleaseGuideArea, { context: { ...release, dataProfile: "reviewer" } });
  assert.match(privateHtml, /<h2>Pipe Organ Dataset<\/h2>/);
  assert.doesNotMatch(privateHtml, /<h1\b/);
});

test("the public virtual instrument catalogue owns its page h1 without changing private heading depth", () => {
  const module = load("virtualInstruments", "/virtual-instruments");
  assertPageHeading(render(module.exports.VirtualInstrumentsArea, { publicProjection: true }), "Virtual instruments");
  const privateHtml = render(module.exports.VirtualInstrumentsArea, { publicProjection: false });
  assert.match(privateHtml, /<h2>Virtual instruments<\/h2>/);
  assert.doesNotMatch(privateHtml, /<h1\b/);
});

test("a public virtual instrument record names the instrument in its single page h1", () => {
  const module = load("virtualInstruments", "/virtual-instruments/EXAMPLE");
  const instrument = {
    id: "MDVS:VMIN:EXAMPLE", title: "Example virtual instrument", kind: {},
    relationships: { canonicalOrganRelations: [] }, platforms: { all: [] },
    availability: {}, evidence: {}, physicalInstrument: { location: {} },
  };
  assertPageHeading(render(module.PublicVirtualInstrumentDetail, { instrument, releaseVersion: "1.6", onBack: () => {} }), instrument.title);
});

test("the documentation hub has a meaningful page h1 before its data finishes loading", () => {
  const module = load("documentation", "/docs");
  assertPageHeading(render(module.exports.DocumentationArea), "Citable documentation begins with an approved release.");
});

test("the vocabulary hub has its own page h1", () => {
  const module = load("vocabularyHub", "/vocab");
  assertPageHeading(render(module.exports.VocabularyHub), "Terms, definitions and recorded uses");
});

test("terminology collection and term routes each name the active view in a single h1", () => {
  const collection = load("vocabularyHub", "/vocab/usage/stops");
  assertPageHeading(render(collection.exports.VocabularyUsage, { family: "stops" }), "Stops");
  const term = load("vocabularyHub", "/vocab/usage/stops", "?term=Vox+Humana");
  assertPageHeading(render(term.exports.VocabularyUsage, { family: "stops" }), "Vox Humana");
});
