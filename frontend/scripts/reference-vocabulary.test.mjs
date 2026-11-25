import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const source=readFileSync(new URL("../src/referenceVocabulary.tsx",import.meta.url),"utf8");
const context={exports:{},URLSearchParams,require:()=>({})};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
const {referenceQueryIssue,referenceHref,referenceRequestUrl}=context.exports;
test("ambiguous and unknown reference selections are refused before reading",()=>{
  assert.match(referenceQueryIssue(new URLSearchParams("collection=network&collection=vao")),/repeats/);
  assert.match(referenceQueryIssue(new URLSearchParams("scheem=x")),/unsupported/);
  assert.equal(referenceQueryIssue(new URLSearchParams("q=organ%25&snapshot=")),null);
});
test("detail requests retain the exact resource and snapshot without leaking list filters",()=>{
  const parameters=new URLSearchParams({collection:"vao",uri:"https://example.org/#term",q:"literal%_",kind:"property",scheme:"urn:scheme",language:"en",offset:"30",limit:"10",snapshot:"old"});
  const url=new URL(referenceRequestUrl(parameters),"https://navigator.example");
  assert.equal(url.pathname,"/api/vocab/references/vao/concept");
  assert.deepEqual([...url.searchParams.keys()],["uri","language","snapshot"]);
  assert.equal(url.searchParams.get("uri"),"https://example.org/#term");
  assert.equal(url.searchParams.get("snapshot"),"old");
});
test("opening and returning from a resource preserves the exact result selection",()=>{
  const selection="collection=network&q=organ%25_&kind=concept&offset=30&snapshot=pinned";
  const detail=new URL(referenceHref(selection,{uri:"urn:term"}),"https://navigator.example");
  const back=new URL(referenceHref(detail.search,{uri:null}),"https://navigator.example");
  assert.equal(back.searchParams.get("q"),"organ%_");
  assert.equal(back.searchParams.get("offset"),"30");
  assert.equal(back.searchParams.get("snapshot"),"pinned");
  assert.equal(back.searchParams.has("uri"),false);
});
test("empty or unavailable snapshot pins are sent unchanged for explicit refusal",()=>{
  for(const snapshot of ["","unavailable"]){
    const url=new URL(referenceRequestUrl(new URLSearchParams({snapshot})),"https://navigator.example");
    assert.equal(url.searchParams.has("snapshot"),true);
    assert.equal(url.searchParams.get("snapshot"),snapshot);
  }
});
