import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname } from "node:path";
import test from "node:test";
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";
import ts from "typescript";

function variables(elements, result = new Set()) {
  for (const element of elements) {
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
    const format = typeof element.style === "object" ? JSON.stringify(element.style) : element.style;
    result.add(JSON.stringify([element.value, element.type, format, element.offset, element.pluralType]));
    if (element.children) variables(element.children, result);
    for (const option of Object.values(element.options ?? {})) variables(option.value, result);
  }
  return [...result].sort();
}

const pairs = [];
for (const name of readdirSync(new URL("../src/", import.meta.url))) {
  if (![".ts", ".tsx"].includes(extname(name))) continue;
  const source = ts.createSourceFile(name, readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
      const [id, en, de] = node.arguments;
      if (id && en && de && [id, en, de].every(ts.isStringLiteralLike)) {
        pairs.push({ where: name + ":" + (source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1), id: id.text, en: en.text, de: de.text });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

test(`bilingual message sites parse and keep ICU argument types (${pairs.length} pairs)`, () => {
  const failures = [];
  for (const { where, id, en, de } of pairs) {
    try {
      assert.match(id, /^[a-z][A-Za-z0-9_.-]+$/);
      assert.ok(en.trim() && de.trim(), "Both locales must contain a message");
      assert.deepEqual(variables(parse(de)), variables(parse(en)), "ICU placeholders, types and styles must match");
    } catch (error) { failures.push(`${where} ${id}: ${error.message}`); }
  }
  assert.ok(pairs.length, "No bilingual message sites found");
  assert.deepEqual(failures, []);
});
