import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/publicRecords.tsx", import.meta.url), "utf8");
const context = { exports: {}, require: name => name.startsWith("./") ? {} : require(name) };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);

for (const [kind, destination, title] of [["place", "places", "Place record"], ["source", "sources", "Source record"]]) {
  test(`${kind} failure keeps a named, focusable error with retry and a real collection route`, () => {
    const html = renderToStaticMarkup(createElement(context.RecordLoadFailure, { kind, error: "Temporary service failure", onRetry: () => {} }));
    assert.match(html, /role="alert"/);
    assert.match(html, /tabindex="-1"/);
    assert.match(html, /aria-labelledby="[^"]+"/);
    assert.ok(html.includes(`${title} unavailable`));
    assert.match(html, />Temporary service failure<\/p>/);
    assert.match(html, /<button[^>]+type="button"[^>]*>Try again<\/button>/);
    assert.ok(html.includes(`href="/pod-explorer?collection=${destination}"`));
  });
}
