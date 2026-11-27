import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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
  const extension = existsSync(new URL(`../src/${name}.ts`, import.meta.url)) ? "ts" : "tsx";
  const code = ts.transpileModule(readFileSync(new URL(`../src/${name}.${extension}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, require: id => id.endsWith(".css") ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id) });
  return exports;
}
const { SourceReportedTotals } = load("organSpecificationDescriptions");
const { EventTransferEndpoints, ParticipationRoleLink, SourceOccurrenceEvidence } = load("eventParticipation");
const escape = value => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c]));
function renderTotal(span) {
  const summaryEvidence = { interpretation: "source_assertion", scope: "source_account", evidence: [span] };
  const html = renderToStaticMarkup(createElement(SourceReportedTotals, {
    facts: [{ id: "authored-manuals", family: "manual_total", label: "Manuals", value: "2", summaryEvidence }],
  }));
  assert.equal(html.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/)[1], escape(JSON.stringify(summaryEvidence, null, 2)));
  return html;
}

test("sparse authored evidence uses sourcePath without inventing character positions", () => {
  const html = renderTotal({ wording: "Two manuals <source wording>", sourcePath: "specifications[0].manual_count" });
  assert.match(html, /Source field: <code>specifications\[0\]\.manual_count<\/code>/);
  assert.match(html, /Two manuals &lt;source wording&gt;/);
  assert.doesNotMatch(html, /[Cc]haracters|zero-based/);
});

test("sourcePath takes precedence and legacy path remains a fallback", () => {
  assert.match(renderTotal({ wording: "Nine stops", sourcePath: "current.stops", path: "legacy.stops" }), /Source field: <code>current\.stops<\/code>/);
  assert.match(renderTotal({ wording: "Nine stops", sourcePath: " \t", path: "legacy.stops" }), /Source field: <code>legacy\.stops<\/code>/);
});

test("complete zero-based character spans remain available independently of a field path", () => {
  const html = renderTotal({ wording: "Two", start: 0, end: 3 });
  assert.match(html, /Characters 0–3 \(zero-based, end excluded\)/);
  assert.doesNotMatch(html, /Source field:/);
});

test("missing, partial or malformed locations leave no empty labels and retain raw evidence", () => {
  for (const location of [{}, { path: " " }, { sourcePath: "", start: 0 }, { start: null, end: null },
    { start: -1, end: 2 }, { start: 3, end: 2 }, { start: 0.5, end: 2 }, { start: "0", end: "2" }]) {
    const html = renderTotal({ wording: "Two manuals", ...location });
    assert.doesNotMatch(html, /Source field:|[Cc]haracters|zero-based/);
    assert.match(html, /Two manuals/);
  }
});

test("event source locations omit blank field labels while preserving verified spans", () => {
  const render = sourcePath => renderToStaticMarkup(createElement(SourceOccurrenceEvidence, { representations: [{
    contract: "modavis.source-fragment-occurrences/v1", sourcePath,
    occurrences: [{ wording: "Built", contextWording: "Built here.", start: 0, end: 5, contextStart: 0, contextEnd: 11 }],
  }] }));
  for (const path of [undefined, "", " \t"]) {
    const html = render(path);
    assert.doesNotMatch(html, /Source field:/);
    assert.match(html, /Fragment characters 0–5; context characters 0–11/);
    assert.match(html, /Built here\./);
  }
  assert.match(render("history.description"), /Source field: <code>history\.description<\/code>/);
});

test("a transfer card shows the documented endpoint even without a map connection", () => {
  const event = {
    movement: { status: "unresolved" },
    transferEndpoints: { origin: [], destination: [{ title: "North Chapel", pageUrl: "/places/EXAMPLE" }] },
  };
  const html = renderToStaticMarkup(createElement(EventTransferEndpoints, { event }));
  assert.match(html, /<dt>Origin<\/dt><dd>Undocumented<\/dd>/);
  assert.match(html, /<dt>Destination<\/dt><dd><a href="\/places\/EXAMPLE">North Chapel<\/a>/);
});


test("a recorded participation role opens its person vocabulary entry", () => {
  const reference = {
    code: "activity_role.restorer", recordedCode: "restorer",
    labels: { en: "Restorer", de: "Restauratorin oder Restaurator" },
    href: "/vocab/editions/modavis/person-terms/activity-role.restorer",
  };
  assert.match(renderToStaticMarkup(createElement(ParticipationRoleLink, { reference })),
    /href="\/vocab\/editions\/modavis\/person-terms\/activity-role\.restorer">Restorer<\/a>/);
});
