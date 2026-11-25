import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {testUiLocale} from './ui-locale-test-support.mjs';

const require = createRequire(import.meta.url);
const core = 'a'.repeat(64), assessment = 'c'.repeat(64), reference = 'b'.repeat(64);
const resource = 'https://w3id.org/modavis/vocab/instrument-type/pipe-organ';
const referenceView = () => ({title:'Pipe-organ instrument type',url:'/vocab/reference?'+new URLSearchParams({collection:'network',uri:resource,q:'pipe-organ',snapshot:reference,kind:'concept',language:'en'}),binding:{kind:'published',collection:'network',collectionTitle:'MODAVIS Ontology Network vocabularies',version:'0.1.0',snapshot:reference,resource}});
const compile = name => ts.transpileModule(readFileSync(new URL(`../src/${name}.ts${name === 'ResearchWorkspacePanel' ? 'x' : ''}`, import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;

function load(options={}) {
  const listeners = new Map(), store = new Map(options.saved ? [['modavis.research-workspace.v1',options.saved]] : []);
  const slots=[],effects=[];let cursor=0;
  const mockReact={...React,
    useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;}];},
    useRef(initial){const index=cursor++;if(!slots[index])slots[index]={current:initial};return slots[index];},
    useEffect(effect,deps){const index=cursor++,before=slots[index];if(!before||!deps||deps.some((item,i)=>item!==before.deps?.[i])){effects.push({index,effect,cleanup:before?.cleanup});slots[index]={deps};}},
  };
  const location={origin:'https://navigator.modavis.org',pathname:'/vocab/reference',search:referenceView().url.split('?')[1]?'?'+referenceView().url.split('?')[1]:'',hash:''};
  const document={title:'Pipe-organ instrument type | MODAVIS Navigator',activeElement:null,body:{style:{}},addEventListener(){},removeEventListener(){},querySelector(selector){return selector === '[data-vocabulary-workspace-url]' && options.capture !== false ? {getAttribute:()=>options.capture || referenceView().url} : null;}};
  class CustomEvent {constructor(type,init={}){this.type=type;this.detail=init.detail;this.cancelable=init.cancelable;this.defaultPrevented=false;}preventDefault(){if(this.cancelable)this.defaultPrevented=true;}}
  const window={location,addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},removeEventListener(type,listener){listeners.get(type)?.delete(listener);},dispatchEvent(event){for(const listener of listeners.get(event.type)||[])listener(event);return !event.defaultPrevented;}};
  const storage={getItem(key){return store.get(key)??null;},setItem(key,value){if(options.writeFails)throw new Error('Storage unavailable');store.set(key,value);}};
  const modules=new Map();
  const scope={URL,URLSearchParams,Blob,AbortController,DOMException,Error,CustomEvent,window,document,location,localStorage:storage,setTimeout,clearTimeout,requestAnimationFrame:callback=>callback(),
    fetch:async()=>options.pod===false?{ok:false,json:async()=>({error:'POD binding unavailable'})}:{ok:true,json:async()=>({publicCoreSha256:options.podCore||core,occurrenceAssessmentSha256:assessment})}};
  function module(name){
    if(modules.has(name))return modules.get(name);
    const exports={};modules.set(name,exports);
    vm.runInNewContext(compile(name),{...scope,exports,require:id=>id==='react'?mockReact:id==='./uiLocale'?{useUiLocale:()=>testUiLocale(options.locale)}:id==='./api'?{publicGetJson:()=>{throw new Error('Unexpected API read');}}:id.endsWith('.css')?{}:id.startsWith('./')?module(id.slice(2)):require(id)});
    if(name==='vocabularyWorkspace'&&options.resolve)exports.resolveVocabularyWorkspaceView=options.resolve;
    return exports;
  }
  const panel=module('ResearchWorkspacePanel'),model=module('researchWorkspace');
  const render=()=>{cursor=0;return panel.ResearchWorkspace();};
  const flush=()=>{for(const item of effects.splice(0)){item.cleanup?.();slots[item.index].cleanup=item.effect();}};
  const html=tree=>renderToStaticMarkup(tree);
  async function mounted(){render();flush();await Promise.resolve();await Promise.resolve();await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));render();flush();}
  function open(){window.dispatchEvent(new CustomEvent('modavis:workspace-open'));const tree=render();flush();return tree;}
  function unmount(){for(const item of slots)item?.cleanup?.();}
  return {panel,model,scope,store,render,flush,mounted,open,unmount,html};
}
const base=load(),panel=base.panel,model=base.model;
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
function elements(element,predicate,output=[]){if(Array.isArray(element)){for(const child of element)elements(child,predicate,output);}else if(element&&typeof element==='object'){if(predicate(element))output.push(element);elements(element.props?.children,predicate,output);}return output;}
function sixLegacyItems(){
  let state=model.createWorkspace(core,assessment,'2026-10-30T10:00:00.000Z');
  state=model.keepRecord(state,{kind:'organ',id:'MDVS:ENTY:TEST-0001-A',title:'Original organ',url:'/organs/TEST-0001-A'});
  state=model.keepRecord(state,{kind:'person',id:'PERSON',title:'Original person',url:'/persons/PERSON'});
  for(const id of ['account-a','account-b'])state=model.keepAccount(state,{id,revision:'d'.repeat(64),title:id,organ:'MDVS:ENTY:TEST-0001-A',url:`/organs/TEST-0001-A?tab=specification&description=${id}`});
  state=model.retainView(state,{title:'Original cohort',url:`/use-cases/research-workbench?section=organs&q=Chapel&snapshot=${core}&assessment=${assessment}`});
  state=model.retainView(state,{title:'Original stop wording',url:`/vocab/usage/stops?term=Principal&snapshot=${core}`});
  return {...JSON.parse(JSON.stringify(state)),schema:'modavis.research-workspace/v1'};
}

test('saved vocabulary card shows collection, version and exact evidence despite a different POD snapshot',()=>{
  const view={...referenceView(),id:'view:1',savedAt:'2026-10-30T10:00:00.000Z'};
  const html=render(panel.WorkspaceSavedView,{view,podMatches:false,onRemove(){}});
  for(const text of ['Published reference','MODAVIS Ontology Network vocabularies','0.1.0','Source Turtle SHA-256',reference,'Evidence JSON'])assert.ok(html.includes(text),text);
  assert.match(html,/href="\/vocab\/reference\?/);
  assert.match(html,/uri=https%3A%2F%2Fw3id.org%2Fmodavis%2Fvocab%2Finstrument-type%2Fpipe-organ/);
  assert.match(html,/\/api\/vocab\/references\/network\/concept\?/);
  assert.doesNotMatch(html,/Current dataset|Current POD|undefined/);
});

test('ordinary POD views remain locked under a mismatched POD binding',()=>{
  const view={title:'Old cohort',url:`/use-cases/research-workbench?snapshot=${core}`,id:'view:old',savedAt:'2026-10-30T10:00:00.000Z'};
  assert.doesNotMatch(render(panel.WorkspaceSavedView,{view,podMatches:false,onRemove(){}}),/<a\b/);
  assert.match(render(panel.WorkspaceSavedView,{view,podMatches:true,onRemove(){}}),/href="\/use-cases\/research-workbench\?snapshot=/);
});

test('candidate card retains separate registry, mapped POD and occurrence-index bindings',()=>{
  const id='urn:modavis:terminology-seed:action-mechanical',index='e'.repeat(64);
  const view={id:'view:candidate',savedAt:'2026-10-30T10:00:00.000Z',title:'Mechanical action',url:'/vocab/registry?'+new URLSearchParams({concept:id,snapshot:reference,coreSnapshot:core,indexSnapshot:index}),binding:{kind:'candidate',collection:'registry',collectionTitle:'Candidate action terminology',snapshot:reference,resource:id,publicCoreSha256:core,researchIndexSha256:index}};
  const html=render(panel.WorkspaceSavedView,{view,podMatches:false,onRemove(){}});
  for(const text of ['Candidate terminology','Mapped POD public core','Occurrence index',core,index,id])assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/Version undefined|Current dataset/);
});

test('storage failure retains the validated open copy and never reports durable success',()=>{
  const state=model.validateWorkspace(sixLegacyItems());let openCopy,writes=0;
  const persisted=panel.persistWorkspaceSnapshot(state,value=>{openCopy=value;},()=>{writes++;throw new Error('Quota exceeded');},'https://navigator.modavis.org');
  assert.equal(persisted,false);assert.equal(writes,1);assert.equal(openCopy.records.length+openCopy.accounts.length+openCopy.views.length,6);
  assert.match(panel.workspacePersistenceMessage(false,'Saved successfully'),/Browser storage is unavailable/);
  assert.doesNotMatch(panel.workspacePersistenceMessage(false,'Saved successfully'),/Saved successfully/);
  assert.equal(panel.workspacePersistenceMessage(true,'Saved exact reference'),'Saved exact reference');
});

test('invalid workspace data cannot replace either the open copy or persistent storage',()=>{
  const state={...model.createWorkspace(core),views:[{id:'bad',title:'Invalid',url:'https://outside.test/private',savedAt:'2026-10-30T10:00:00.000Z'}]};let changes=0;
  assert.throws(()=>panel.persistWorkspaceSnapshot(state,()=>changes++,()=>changes++,'https://navigator.modavis.org'),/public Navigator/);
  assert.equal(changes,0);
});

test('contextual save acknowledges persistence and preserves all six legacy items without opening the panel',async()=>{
  const original=JSON.stringify(sixLegacyItems()),local=load({saved:original,podCore:'f'.repeat(64)});
  try{
    await local.mounted();const result=await local.model.addViewToWorkspace(referenceView());
    assert.equal(result.saved,true);assert.equal(result.persisted,true);assert.match(result.message,/MODAVIS Ontology Network vocabularies, version 0.1.0/);
    const saved=local.model.parseWorkspace(local.store.get(local.model.WORKSPACE_KEY));
    assert.equal(saved.snapshot,core);assert.equal(saved.records.length,2);assert.equal(saved.accounts.length,2);assert.equal(saved.views.length,3);
    const originalData=JSON.parse(original);assert.deepEqual(JSON.parse(JSON.stringify(saved.records)),originalData.records);assert.deepEqual(JSON.parse(JSON.stringify(saved.accounts)),originalData.accounts);assert.deepEqual(JSON.parse(JSON.stringify(saved.views.slice(0,2))),originalData.views);
    assert.equal(saved.views[2].binding.snapshot,reference);assert.equal(local.store.get(local.model.WORKSPACE_BACKUP_KEY),original);
    assert.doesNotMatch(local.html(local.render()),/role="dialog"/);
    const open=local.html(local.open());assert.match(open,/separately pinned vocabulary references can still be reopened/i);assert.match(open,/Pipe-organ instrument type/);
  }finally{local.unmount();}
});

test('a reference-only workspace can be created without a reachable POD context',async()=>{
  const local=load({pod:false});
  try{
    await local.mounted();const result=await local.model.addViewToWorkspace(referenceView());assert.equal(result.persisted,true);
    const saved=local.model.parseWorkspace(local.store.get(local.model.WORKSPACE_KEY));assert.equal(saved.snapshot,undefined);assert.equal(saved.records.length,0);assert.equal(saved.accounts.length,0);assert.equal(saved.views.length,1);
    const html=local.html(local.open());assert.match(html,/References only/);assert.match(html,/No POD dataset is attached/);assert.doesNotMatch(html,/POD dataset snapshot <code>/);
  }finally{local.unmount();}
});

test('contextual storage failure reports a memory-only copy and leaves the original six persistent items intact',async()=>{
  const original=JSON.stringify(sixLegacyItems()),local=load({saved:original,writeFails:true});
  try{
    await local.mounted();const result=await local.model.addViewToWorkspace(referenceView());assert.equal(result.persisted,false);assert.match(result.message,/export the workspace file/);
    assert.equal(local.store.get(local.model.WORKSPACE_KEY),original);
    const html=local.html(local.open());assert.match(html,/Open workspace copy/);assert.match(html,/Pipe-organ instrument type/);assert.match(html,/Browser storage is unavailable/);assert.match(html,/7 saved|3 \/ 20 saved/);
  }finally{local.unmount();}
});

test('unreadable pre-existing workspace refuses contextual replacement and keeps its original bytes',async()=>{
  const original=JSON.stringify({schema:'unknown',private:'unreadable prior file'}),local=load({saved:original});
  try{await local.mounted();await assert.rejects(local.model.addViewToWorkspace(referenceView()),/existing browser workspace could not be read/);assert.equal(local.store.get(local.model.WORKSPACE_KEY),original);}finally{local.unmount();}
});

test('generic Save current view uses the verified vocabulary resolver and acknowledges the native version',async()=>{
  const calls=[],local=load({resolve:async(url,signal)=>{calls.push({url,signal});return referenceView();}});
  try{
    await local.mounted();const tree=local.open(),button=elements(tree,node=>node.type==='button'&&node.props.className==='rw-save')[0];await button.props.onClick();
    assert.equal(calls.length,1);assert.equal(calls[0].signal.aborted,false);const saved=local.model.parseWorkspace(local.store.get(local.model.WORKSPACE_KEY));assert.equal(saved.views[0].binding.snapshot,reference);assert.equal(saved.snapshot,undefined);
    assert.match(local.html(local.render()),/Saved “Pipe-organ instrument type” with MODAVIS Ontology Network vocabularies, version 0.1.0/);
  }finally{local.unmount();}
});

test('a refused resource pin cannot be saved through the generic panel action',async()=>{
  const original=JSON.stringify(sixLegacyItems()),local=load({saved:original,resolve:async()=>{throw new Error('The requested snapshot is unavailable. Nothing was saved against different data.');}});
  try{await local.mounted();const button=elements(local.open(),node=>node.type==='button'&&node.props.className==='rw-save')[0];await button.props.onClick();assert.equal(local.store.get(local.model.WORKSPACE_KEY),original);assert.match(local.html(local.render()),/requested snapshot is unavailable/);}finally{local.unmount();}
});

test('selection identity ignores parameter order but rejects changed filters, pins, paths and fragments',()=>{
  assert.equal(panel.sameWorkspaceLocation('/vocab/reference?q=organ&snapshot=x','/vocab/reference?snapshot=x&q=organ'),true);
  for(const value of ['/vocab/reference?q=flute&snapshot=x','/vocab/reference?q=organ&snapshot=y','/vocab/reference?q=organ&snapshot=x#changed','/organs?q=organ&snapshot=x','https://outside.test/vocab/reference?q=organ&snapshot=x'])assert.equal(panel.sameWorkspaceLocation('/vocab/reference?q=organ&snapshot=x',value),false);
});

test('an asynchronous save rejects navigation to another selection before writing',async()=>{
  let finish;const original=JSON.stringify(sixLegacyItems()),local=load({saved:original,resolve:()=>new Promise(resolve=>{finish=resolve;})});
  try{await local.mounted();const button=elements(local.open(),node=>node.type==='button'&&node.props.className==='rw-save')[0],saving=button.props.onClick();local.scope.location.pathname='/organs/TEST-0001-A';local.scope.location.search='';finish(referenceView());await saving;assert.equal(local.store.get(local.model.WORKSPACE_KEY),original);assert.match(local.html(local.render()),/page changed before it could be saved/);}finally{local.unmount();}
});


test('generic save uses the displayed payload pin even when the human URL is unpinned',async()=>{
  const calls=[],original=JSON.stringify(sixLegacyItems()),local=load({saved:original,resolve:async(url)=>{calls.push(url);throw new Error('The displayed snapshot is unavailable. Nothing was saved.');}});
  try{await local.mounted();local.scope.location.search='?collection=network&uri='+encodeURIComponent(resource);const button=elements(local.open(),node=>node.type==='button'&&node.props.className==='rw-save')[0];await button.props.onClick();assert.equal(new URL(calls[0],local.scope.location.origin).searchParams.get('snapshot'),reference);assert.equal(local.store.get(local.model.WORKSPACE_KEY),original);assert.match(local.html(local.render()),/displayed snapshot is unavailable/);}finally{local.unmount();}
});

test('loading or refused vocabulary pages without a verified capture cannot be saved generically',async()=>{
  let calls=0;const original=JSON.stringify(sixLegacyItems()),local=load({saved:original,capture:false,resolve:async()=>{calls++;return referenceView();}});
  try{await local.mounted();const button=elements(local.open(),node=>node.type==='button'&&node.props.className==='rw-save')[0];await button.props.onClick();assert.equal(calls,0);assert.equal(local.store.get(local.model.WORKSPACE_KEY),original);assert.match(local.html(local.render()),/has not loaded verified evidence/);}finally{local.unmount();}
});


test('the vocabulary directory is saved as a navigation bookmark without claiming frozen cross-collection evidence',async()=>{
  const local=load({capture:false,resolve:async(url)=>({title:'Vocabulary search: Mechanical',url})});
  try{
    await local.mounted();local.scope.location.pathname='/vocab';local.scope.location.search='?q=Mechanical&sourceFamily=key_action';const button=elements(local.open(),node=>node.type==='button'&&node.props.className==='rw-save')[0];await button.props.onClick();
    const saved=local.model.parseWorkspace(local.store.get(local.model.WORKSPACE_KEY));assert.equal(saved.snapshot,core);assert.equal(saved.views[0].binding,undefined);
    const html=local.html(local.render());assert.match(html,/Vocabulary directory bookmark saved/);assert.match(html,/Open a collection to retain its exact evidence and version/);assert.doesNotMatch(html,/Saved “Vocabulary search: Mechanical” with its exact POD dataset/);
  }finally{local.unmount();}
});

test('removing and undoing a saved term preserves its independent binding and the original six items',async()=>{
  const original=JSON.stringify(sixLegacyItems()),local=load({saved:original});
  try{
    await local.mounted();await local.model.addViewToWorkspace(referenceView());const open=local.open();const term=elements(open,node=>node.type===local.panel.WorkspaceSavedView&&node.props.view.binding?.kind==='published')[0];term.props.onRemove();
    assert.equal(local.model.parseWorkspace(local.store.get(local.model.WORKSPACE_KEY)).views.length,2);
    const undo=elements(local.render(),node=>node.type==='button'&&node.props.className==='rw-undo')[0];undo.props.onClick();const restored=local.model.parseWorkspace(local.store.get(local.model.WORKSPACE_KEY));assert.equal(restored.views.length,3);assert.equal(restored.views[2].binding.snapshot,reference);assert.equal(restored.snapshot,core);assert.equal(restored.records.length+restored.accounts.length+restored.views.length,7);
  }finally{local.unmount();}
});

test('the German workspace localizes controls, notices and independent reference metadata without changing retained data', async () => {
  const original = JSON.stringify(sixLegacyItems());
  const options = {saved: original, podCore: 'f'.repeat(64), locale: 'en'};
  const local = load(options);
  try {
    await local.mounted();
    assert.match(local.html(local.open()), /Research workspace/);
    options.locale = 'de';
    const german = local.html(local.render());
    assert.match(german, /Recherche-Arbeitsbereich schließen/);
    assert.match(german, /Aktuelle Ansicht speichern/);
    assert.match(german, /Vokabularreferenzen mit eigener Versionsbindung/);
    assert.ok(!german.includes('Research workspace</h2>'));
    assert.equal(local.store.get(local.model.WORKSPACE_KEY), original);
    const result = await local.model.addViewToWorkspace(referenceView());
    assert.equal(result.persisted, true);
    assert.match(result.message, /MODAVIS Ontology Network vocabularies, Version 0.1.0/);
    const saved = local.html(local.render());
    assert.match(saved, /Veröffentlichte Referenz/);
    assert.match(saved, /SHA-256 der Turtle-Quelldatei/);
    assert.match(saved, /Gespeichert am/);
    assert.match(saved, /Pipe-organ instrument type/);
    assert.match(saved, new RegExp(reference));
    assert.match(saved, /\/vocab\/reference\?/);
  } finally { local.unmount(); }
});

test('German workspace distinguishes the open copy when storage is unavailable', async () => {
  const local = load({locale: 'de', writeFails: true});
  try {
    await local.mounted();
    const result = await local.model.addViewToWorkspace(referenceView());
    assert.equal(result.persisted, false);
    assert.match(result.message, /Browserspeicher ist nicht verfügbar/);
    const german = local.html(local.open());
    assert.match(german, /Geöffnete Arbeitskopie/);
    assert.match(german, /Exportieren Sie die Arbeitsbereichsdatei/);
    assert.doesNotMatch(german, /In diesem Browser gespeichert/);
  } finally { local.unmount(); }
});
