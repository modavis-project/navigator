import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import test from "node:test";
import * as React from "react";
import ts from "typescript";
import {testUiLocale} from "./ui-locale-test-support.mjs";
const require=createRequire(import.meta.url);
const compiled=ts.transpileModule(readFileSync(new URL("../src/SaveVocabularyTerm.tsx",import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const pin="a".repeat(64),url=`/vocab/modavis_activity_types/concepts/activitype%3Aorgan-repair?snapshot=${pin}`;
const view={title:"Organ Repair",url,binding:{kind:"controlled",collection:"modavis_activity_types",collectionTitle:"Activity terminology",version:"2026-08-06",snapshot:pin,resource:"activitype:organ-repair"}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({resolveView=async()=>view,save=async()=>({saved:true,persisted:true,message:"Saved"}),initialViews=[],contextKey=url,snapshot,locale="en"}={}){
 let slots=[],cursor=0,effects=[],queued=[],tree,props={contextKey},views=initialViews,readError;const target=new EventTarget();
 const fake={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;return [slots[i],value=>{slots[i]=typeof value==="function"?value(slots[i]):value;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++;if(!effects[i]||deps.some((value,index)=>value!==effects[i].deps[index]))queued.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()};});}};
 const context={exports:{},URL,AbortController,Error,window:target,CustomEvent,location:{origin:"https://navigator.test",pathname:"/vocab/modavis_activity_types/concepts/activitype%3Aorgan-repair",search:"",hash:""},require:id=>id==="react"?fake:id==="./uiLocale"?{useUiLocale:()=>testUiLocale(locale)}:id.endsWith(".css")?{}:id==="./researchWorkspace"?{addViewToWorkspace:save,readWorkspace:()=>{if(readError)throw readError;return{views,snapshot};},WORKSPACE_EVENT:"changed"}:id==="./vocabularyWorkspace"?{resolveVocabularyWorkspaceView:resolveView} :require(id)};
 vm.runInNewContext(compiled,context);
 function render(next=props){props=next;cursor=0;tree=context.exports.SaveVocabularyTerm(props);for(const effect of queued.splice(0))effect();cursor=0;tree=context.exports.SaveVocabularyTerm(props);return tree;}
 render();
 return {render,window:target,setViews(value){views=value;},setHash(value){context.location.hash=value;target.dispatchEvent(new Event("hashchange"));},setReadError(value){readError=value;target.dispatchEvent(new Event("changed"));},unmount(){for(const effect of effects)effect?.cleanup?.();},get tree(){return tree;}};
}
function nodes(value){if(!value)return[];if(Array.isArray(value))return value.flatMap(nodes);if(typeof value!=="object")return[];return[value,...nodes(value.props?.children)];}
const text=value=>Array.isArray(value)?value.map(text).join(""):typeof value==="string"?value:typeof value==="object"&&value?text(value.props?.children):"";
const button=h=>nodes(h.tree).find(x=>x.type==="button");

test("Save term waits for actual persistence acknowledgement and confirms exact collection/version",async()=>{
 let acknowledge;const h=harness({save:()=>new Promise(resolve=>{acknowledge=resolve;})});button(h).props.onClick();await tick();h.render();assert.equal(button(h).props.disabled,true);assert.match(text(h.tree),/Saving/);assert.doesNotMatch(text(h.tree),/Saved “/);
 acknowledge({saved:true,persisted:true,message:"Saved"});await tick();h.render();assert.match(text(h.tree),/Saved “Organ Repair” · Activity terminology · 2026-08-06/);assert.match(text(h.tree),/Open workspace/);assert.equal(button(h).props.disabled,false);h.unmount();
});
test("storage failure is an export-required warning, never a persisted Saved confirmation",async()=>{
 const h=harness({save:async()=>({saved:true,persisted:false,message:"Browser storage is unavailable. Export this workspace to retain it."})});button(h).props.onClick();await tick();h.render();assert.match(text(h.tree),/Export this workspace/);assert.doesNotMatch(text(h.tree),/Saved “/);assert.equal(text(button(h)),"Save term");assert.ok(nodes(h.tree).some(x=>x.props?.role==="alert"));h.unmount();
});
test("the loaded capture hash is used even while the address bar remains unpinned",async()=>{
 let captured;const h=harness({resolveView:async value=>{captured=value;return view;}});assert.equal(button(h).props.disabled,false);button(h).props.onClick();await tick();assert.equal(captured,url);assert.ok(nodes(h.render()).some(x=>x.props?.["data-vocabulary-workspace-url"]===url));h.unmount();
});
test("stale evidence refusal never dispatches a workspace save",async()=>{
 let writes=0;const h=harness({resolveView:async()=>{throw new Error("Requested snapshot is unavailable");},save:async()=>{writes++;}});button(h).props.onClick();await tick();h.render();assert.equal(writes,0);assert.match(text(h.tree),/Requested snapshot is unavailable/);assert.equal(text(button(h)),"Save term");h.unmount();
});
test("changing the displayed view cancels a pending verification without saving the old term",async()=>{
 let complete,signal,writes=0;const h=harness({resolveView:(_url,s)=>{signal=s;return new Promise(resolve=>{complete=resolve;});},save:async()=>{writes++;return{saved:true,persisted:true,message:"Saved"};}});button(h).props.onClick();await tick();h.render({contextKey:"/vocab/reference?collection=vao&snapshot="+pin});assert.equal(signal.aborted,true);complete(view);await tick();h.render();assert.equal(writes,0);assert.doesNotMatch(text(h.tree),/Saved “Organ Repair”/);h.unmount();
});
test("removing a saved item clears the old Saved state on the term page",async()=>{
 const h=harness();button(h).props.onClick();await tick();h.render();assert.match(text(h.tree),/Saved “Organ Repair”/);h.setViews([]);h.window.dispatchEvent(new Event("changed"));h.render();assert.equal(text(button(h)),"Save term");assert.doesNotMatch(text(h.tree),/Saved “Organ Repair”/);h.unmount();
});

test("reopening an already retained exact term shows Saved without another write",()=>{
 let writes=0;const h=harness({initialViews:[view],save:async()=>{writes++;return{saved:true,persisted:true,message:"Saved"};}});assert.equal(text(button(h)),"Saved");assert.match(text(h.tree),/Activity terminology · 2026-08-06/);assert.equal(writes,0);h.unmount();
});

test("changing the fragment clears Saved until that exact reading position is retained",()=>{
 const h=harness({initialViews:[view]});assert.equal(text(button(h)),"Saved");h.setHash("#labels");h.render();assert.equal(text(button(h)),"Save term");assert.doesNotMatch(text(h.tree),/Saved “/);h.setViews([{...view,url:url+"#labels"}]);h.window.dispatchEvent(new Event("changed"));h.render();assert.equal(text(button(h)),"Saved");h.unmount();
});

test("unreadable retained workspace clears an old success claim",()=>{
 const h=harness({initialViews:[view]});assert.equal(text(button(h)),"Saved");h.setReadError(new Error("Invalid workspace"));h.render();assert.equal(text(button(h)),"Save term");assert.doesNotMatch(text(h.tree),/Saved “/);h.unmount();
});

test("changing the fragment during verification cancels the old reading position",async()=>{
 let complete,signal,writes=0;const h=harness({resolveView:(_url,s)=>{signal=s;return new Promise(resolve=>{complete=resolve;});},save:async()=>{writes++;return{saved:true,persisted:true,message:"Saved"};}});button(h).props.onClick();await tick();h.setHash("#labels");h.render();assert.equal(signal.aborted,true);assert.equal(button(h).props.disabled,false);complete(view);await tick();h.render();assert.equal(writes,0);assert.doesNotMatch(text(h.tree),/Saved “/);h.unmount();
});

test("source wording is recognized only under the matching POD snapshot",()=>{
 const sourceUrl=`/vocab/usage/stops?term=Vox+Humana&snapshot=${pin}`,source={title:"Vox Humana",url:sourceUrl};
 const current=harness({initialViews:[source],contextKey:sourceUrl,snapshot:pin});assert.equal(text(button(current)),"Saved");current.unmount();
 const stale=harness({initialViews:[source],contextKey:sourceUrl,snapshot:"b".repeat(64)});assert.equal(text(button(stale)),"Save term");stale.unmount();
 const schema=harness({initialViews:[{title:"Person",url:"/vocab/modavis_entity_types/concepts/person"}],contextKey:"/vocab/modavis_entity_types/concepts/person",snapshot:pin});assert.equal(text(button(schema)),"Save term");schema.unmount();
});

test("German save labels distinguish concepts, source wording and references", async () => {
 const concept=harness({locale:"de"});assert.equal(text(button(concept)),"Begriff speichern");
 button(concept).props.onClick();await tick();concept.render();
 assert.match(text(concept.tree),/„Organ Repair“ wurde gespeichert · Activity terminology · 2026-08-06/);
 assert.match(text(concept.tree),/Arbeitsbereich öffnen/);concept.unmount();
 const wording=harness({locale:"de",contextKey:`/vocab/usage/stops?term=Vox+Humana&snapshot=${pin}`});
 assert.equal(text(button(wording)),"Eintrag speichern");wording.unmount();
 const reference=harness({locale:"de",contextKey:`/vocab/omaro?collection=ontology&uri=urn:test&snapshot=${pin}`});
 assert.equal(text(button(reference)),"Referenz speichern");reference.unmount();
});
