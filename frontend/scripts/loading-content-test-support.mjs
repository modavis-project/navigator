import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/LoadingContent.tsx", import.meta.url), "utf8");
const context = { exports: {}, require: id => id.endsWith(".css") ? {} : require(id) };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, context);

export const { LoadingContent, UpdatingContent } = context.exports;
