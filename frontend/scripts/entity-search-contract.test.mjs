import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { testUiLocale } from "./ui-locale-test-support.mjs";

// The Python producer test asserts its actual response equals these same bytes.
const contract = JSON.parse(readFileSync(new URL("../../fixtures/entity-search-contract.json", import.meta.url), "utf8"));
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
function block(start, end) {
  const left = app.indexOf(start), right = app.indexOf(end, left);
  assert(left >= 0 && right > left);
  return app.slice(left, right);
}
const source = [
  block("function EntitySearchPanel(", "function publicSearchGroupLabel("),
  block("function publicSearchGroupLabel(", "function publicRelatedSummary("),
  block("function searchResultTarget(", "function exactSearchAffordance("),
  block("function entitySearchGroups(", "function OrganFilterPanel("),
].join("\n");
const context = {
  exports: {}, require: createRequire(import.meta.url),
  useUiLocale: testUiLocale,
  ChevronRight: () => null, friendlyLabel: value => value,
};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, context);
const render = search => renderToStaticMarkup(createElement(context.EntitySearchPanel, { search, onOpenOrgan: () => {} }));

test("populated producer response renders groups, links and truthful matching totals", () => {
  const html = render(contract.response);
  assert.match(html, /2 of 5 matches shown/);
  assert.match(html, /1 of 3 shown/);
  assert.match(html, /1 of 2 shown/);
  assert.match(html, /href="\/organs\/TEST-0001-A"/);
  assert.match(html, /href="\/people\/TEST-0003-C"/);
  const suggestions = context.buildEntitySearchSuggestions(contract.response);
  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[1].group, "People and builders");
});

test("older count-only groups render from returned rows without inventing a full total", () => {
  const response = structuredClone(contract.response);
  delete response.totalScope;
  response.groups = response.groups.map(({ id, label, count }) => ({ id, label, count }));
  const html = render(response);
  assert.match(html, /2 results shown/);
  assert.doesNotMatch(html, /of 5|of 3/);
  assert.match(html, /Example Chapel Organ/);
  assert.equal(context.buildEntitySearchSuggestions(response).length, 2);
});

test("sparse group metadata preserves the actual rows and explicit actor grouping", () => {
  const response = structuredClone(contract.response);
  response.items[1].entityType = "organization";
  response.groups = [{ id: "people", label: "People and builders", count: 999 }];
  const html = render(response);
  assert.match(html, /Example Chapel Builder/);
  assert.doesNotMatch(html, /999/);
  const groups = context.entitySearchGroups(response);
  assert.equal(groups.find(group => group.id === "people").items.length, 1);
  assert.equal(context.buildEntitySearchSuggestions(response).length, 2);
});

test("empty and pending search states render without a group dereference", () => {
  assert.match(render({ query: "absent", items: [], groups: [], total: 0, totalScope: "matching_records", limit: 10 }), /No entity matches found/);
  assert.match(render(null), /Searching/);
  assert.equal(context.buildEntitySearchSuggestions(null).length, 0);
});

test("public match explanations remain visible without repeating type or state badges", () => {
  const response = { query: "organ", total: 1, limit: 10, items: [{ kind: "organ", entityType: "organ", targetId: "TEST-0001-A", title: "Example", badges: ["organ", "Organ", "Canonical page", "Regional record", "Regional record"], match: { label: "Source text match", value: "organ" } }] };
  const html = render(response);
  assert.match(html, /Source text match/);
  assert.equal([...html.matchAll(/>organ<\/span>/g)].length, 1);
  assert.equal([...html.matchAll(/>Regional record<\/span>/g)].length, 1);
});

test("event matches open the assertion route even when a related organ is present", () => {
  const response = { query: "built", total: 1, limit: 10, items: [{ kind: "event", entityType: "event", targetId: "EVENT-1", targetOrganId: "ORGAN-1", title: "Documented construction", url: "/events/EVENT-1", searchGroup: "events", searchGroupLabel: "Documented event assertions" }] };
  assert.match(render(response), /href="\/events\/EVENT-1"/);
  assert.equal(context.searchResultTarget(response.items[0]), null);
});
