import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url),exports={};
const code=ts.transpileModule(readFileSync(new URL('../src/JsonEvidence.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
runInNewContext(code,{exports,require:name=>name.endsWith('.css')?{}:require(name)});
const render=value=>renderToStaticMarkup(createElement(exports.JsonEvidence,{value,label:'Source evidence'}));
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[c]));
test('complete JSON stays text, including long source wording, Unicode and markup',()=>{
 const value={wording:'Möller 管風琴 '.repeat(1000),source:'<script>alert("source")</script>',empty:null,retained:false,count:0};
 const html=render(value),body=html.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/)[1];
 assert.equal(body,escape(JSON.stringify(value,null,2)));assert.doesNotMatch(html,/<script>/);
});
test('the scrollable evidence region is keyboard-focusable and bound to its copy button',()=>{
 const html=render({source:'retained'}),id=html.match(/<pre id="([^"]+)"/)[1];
 assert(html.includes(`aria-controls="${id}"`));assert.match(html,/role="region" aria-label="Source evidence \(JSON\)" tabindex="0"/);assert.match(html,/Copy Source evidence as JSON/);
});
test('missing evidence has an explicit message while a JSON null stays available',()=>{
 assert.match(render(undefined),/No structured evidence is available/);assert.doesNotMatch(render(undefined),/<pre/);assert.match(render(null),/>null<\/pre>/);
});
