import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const compilerOptions = {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS};
const compiled = name => ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), {compilerOptions}).outputText;
const routes = {exports: {}};
vm.runInNewContext(compiled('vocabularyRoutes'), routes);
const context = {exports: {}, URL, URLSearchParams, Blob, require: id => {
  if (id === './vocabularyRoutes') return routes.exports;
  throw new Error(`Unexpected workspace dependency ${id}`);
}};
vm.runInNewContext(compiled('researchWorkspace'), context);
const api = context.exports, snapshot = 'a'.repeat(64), assessment = 'b'.repeat(64), revision = 'c'.repeat(64);
const empty = () => api.createWorkspace(snapshot, assessment, '2026-10-30T10:00:00.000Z');
const record = number => ({kind: 'organ', id: `MDVS:ENTY:TEST-000${number}-A`, title: `Example organ ${number}`, url: `/organs/TEST-000${number}-A`});
const account = (id, rev = revision) => ({id, revision: rev, title: `Source account ${id}`, organ: 'MDVS:ENTY:TEST-0001-A', url: `/organs/TEST-0001-A?tab=specification&description=${id}`});

test('portable workspace round trip retains snapshot, exact revisions and selection URL', () => {
  let state = api.keepRecord(empty(), record(1));
  state = api.keepAccount(state, account('account-a'));
  state = api.retainView(state, {title: 'Example cohort', url: `/use-cases/research-workbench?section=organs&q=Chapel&snapshot=${snapshot}&assessment=${assessment}`, count: 123, unit: 'organ records'});
  const restored = api.parseWorkspace(JSON.stringify(state));
  assert.equal(restored.snapshot, snapshot); assert.equal(restored.assessment, assessment);
  assert.equal(restored.accounts[0].revision, revision); assert.equal(restored.views[0].count, 123);
  assert.match(restored.views[0].url, /q=Chapel/);
});

test('a retained record is updated once rather than duplicated', () => {
  const initial = api.keepRecord(empty(), record(1));
  const updated = api.keepRecord(initial, {...record(1), title: 'A clearer display label'});
  assert.equal(updated.records.length, 1); assert.equal(updated.records[0].title, 'A clearer display label');
  assert.equal(initial.records[0].title, 'Example organ 1');
});

test('cross-organ comparison is explicitly limited and uses all retained organs', () => {
  let state = empty();
  for (let n = 1; n <= 4; n++) state = api.keepRecord(state, record(n));
  assert.throws(() => api.keepRecord(state, record(5)), /up to 4 organs/);
  const url = new URL(api.organComparisonUrl(state), 'https://navigator.modavis.org');
  assert.equal(url.searchParams.get('organs').split(',').length, 4);
  assert.equal(url.searchParams.get('snapshot'), snapshot);
  assert.throws(() => api.organComparisonUrl(empty()), /at least two/);
});

test('account comparison retains two exact revisions and refuses silent replacement', () => {
  let state = api.keepAccount(empty(), account('account-a'));
  assert.throws(() => api.keepAccount(state, account('account-a', 'd'.repeat(64))), /different revision/);
  state = api.keepAccount(state, account('account-b', 'd'.repeat(64)));
  assert.throws(() => api.keepAccount(state, account('account-c')), /up to 2/);
  const url = new URL(api.accountComparisonUrl(state), 'https://navigator.modavis.org');
  assert.equal(url.searchParams.get('leftRevision'), revision);
  assert.equal(url.searchParams.get('rightRevision'), 'd'.repeat(64));
  assert.equal(new URL(state.accounts[0].url, 'https://navigator.modavis.org').searchParams.get('descriptionRevision'), revision);
  assert.throws(() => api.keepAccount(empty(), {...account('account-a'), organ:'MDVS:ENTY:OTHER'}), /organ link disagree/);
  assert.throws(() => api.keepAccount(empty(), {...account('account-a'), url:account('account-a').url + '&description=other'}), /description link disagree/);
});

test('external, operator, credential-bearing and local-file links cannot enter a workspace', () => {
  for (const url of ['javascript:alert(1)', 'https://other.invalid/organs/A', '/admin', '/review/queue', '/organs/A?token=private', '/organs/A?query=/Users/example/private', 'https://user:pass@navigator.modavis.org/organs/A']) {
    assert.throws(() => api.workspaceUrl(url));
  }
  assert.equal(api.workspaceUrl('https://navigator.modavis.org/organs/A'), '/organs/A');
});

test('a link cannot be relabelled as a different organ or snapshot', () => {
  assert.throws(() => api.keepRecord(empty(), {...record(1), url: record(2).url}), /disagree/);
  assert.throws(() => api.retainView(empty(), {title: 'Old view', url: `/use-cases/research-workbench?snapshot=${'d'.repeat(64)}`}), /different snapshot/);
  assert.throws(() => api.retainView(empty(), {title: 'Ambiguous view', url: `/use-cases/research-workbench?snapshot=${snapshot}&snapshot=${snapshot}`}), /different snapshot/);
});

test('imports validate schema, chronology, entry cardinality and byte budget', () => {
  assert.throws(() => api.parseWorkspace('{invalid'));
  assert.throws(() => api.parseWorkspace(JSON.stringify({...empty(), schema: 'unknown'})), /supported/);
  assert.throws(() => api.parseWorkspace(JSON.stringify({...empty(), updatedAt: 'not a date'})), /updated date/);
  assert.throws(() => api.parseWorkspace(' '.repeat(api.MAX_WORKSPACE_BYTES + 1)), /too large/);
  assert.throws(() => api.validateWorkspace({...empty(), records: [record(1), record(1)]}), /duplicate/);
});

test('unknown capture remains unknown rather than becoming a zero result count', () => {
  const state = api.retainView(empty(), {title: 'A retained organ', url: '/organs/TEST-0001-A'});
  assert.equal(state.views[0].count, undefined);
  assert.throws(() => api.retainView(empty(), {title: 'Bad count', url: '/organs/TEST-0001-A', count: -1}), /count/);
});


test('public source and pipe-position views are portable without treating them as organ records', () => {
 let state = api.retainView(empty(), {title:'Source evidence',url:'/source/MDVS%3AORGR%3AEXAMPLE'});
 state = api.retainView(state,{title:'Pipe position',url:'/pipe-positions/POSITION'});
 assert.equal(state.views.length,2);
 assert.equal(state.records.length,0);
});


test('organ aliases cannot create duplicate physical comparison operands', () => {
 const state = api.keepRecord(api.keepRecord(empty(),record(1)),{...record(1), id:'TEST-0001-A'});
 assert.equal(state.records.length,1);
 assert.equal(state.records[0].id,'MDVS:ENTY:TEST-0001-A');
 assert.throws(() => api.validateWorkspace({...empty(),records:[record(1),{...record(1),id:'TEST-0001-A'}]}), /duplicate/);
});

test('imported accounts require organ links and restore exact revision links', () => {
 assert.throws(() => api.validateWorkspace({...empty(),accounts:[{...account('a'),organ:undefined,url:'/scores/unrelated?description=a'}]}), /requires an organ link/);
 const state = api.validateWorkspace({...empty(),accounts:[{...account('a'),organ:undefined}]});
 assert.equal(state.accounts[0].organ,'MDVS:ENTY:TEST-0001-A');
 assert.match(state.accounts[0].url, new RegExp('descriptionRevision='+revision));
});

const referencePin = 'd'.repeat(64), indexPin = 'e'.repeat(64);
const candidateId = 'urn:modavis:terminology-seed:action-mechanical';
const examples = () => [
 {title:'Organ repair',url:`/vocab/modavis_activity_types/concepts/activitype%3Aorgan-repair?q=repair&snapshot=${referencePin}`,binding:{kind:'controlled',collection:'modavis_activity_types',collectionTitle:'MODAVIS activity terminology',version:'2026-08-06',snapshot:referencePin,resource:'activitype:organ-repair'}},
 {title:'Mechanical action',url:`/vocab/registry?concept=${encodeURIComponent(candidateId)}&snapshot=${referencePin}&coreSnapshot=${snapshot}&indexSnapshot=${indexPin}`,binding:{kind:'candidate',collection:'registry',collectionTitle:'Candidate terminology registry',snapshot:referencePin,publicCoreSha256:snapshot,researchIndexSha256:indexPin,resource:candidateId}},
 {title:'Pipe organ',url:`/vocab/reference?collection=network&q=pipe&uri=${encodeURIComponent('https://w3id.org/modavis/vocab/instrument-type/pipe-organ')}&snapshot=${referencePin}`,binding:{kind:'published',collection:'network',collectionTitle:'MODAVIS Ontology Network vocabularies',version:'0.1.0',snapshot:referencePin,resource:'https://w3id.org/modavis/vocab/instrument-type/pipe-organ'}},
 {title:'Scientific record set',url:`/vocab/reference?collection=vao&uri=${encodeURIComponent('https://w3id.org/modavis/vao/ontology#ScientificRecordSet')}&snapshot=${referencePin}`,binding:{kind:'published',collection:'vao',collectionTitle:'VAO Standard',version:'0.5.0',snapshot:referencePin,resource:'https://w3id.org/modavis/vao/ontology#ScientificRecordSet'}},
 {title:'Organ reference',url:`/vocab/omaro?q=Orgel&language=de&uri=${encodeURIComponent('http://www.mimo-db.eu/InstrumentsKeywords/2266')}&snapshot=${referencePin}`,binding:{kind:'omaro',collection:'omaro',collectionTitle:'OMARO',version:'0.1.0',snapshot:referencePin,resource:'http://www.mimo-db.eu/InstrumentsKeywords/2266'}},
];

test('mixed vocabulary snapshots round trip without replacing the POD or exact account revisions', () => {
 let state = api.keepAccount(api.keepRecord(empty(),record(1)),account('legacy-account'));
 for(const view of examples())state=api.retainView(state,view);
 const restored=api.parseWorkspace(JSON.stringify(state));
 assert.equal(restored.schema,'modavis.research-workspace/v2');
 assert.equal(restored.snapshot,snapshot);assert.equal(restored.assessment,assessment);
 assert.equal(restored.records[0].id,record(1).id);assert.equal(restored.accounts[0].revision,revision);
 for(const [i,view]of examples().entries()){
  assert.equal(restored.views[i].url,view.url);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.views[i].binding)),view.binding);
 }
 assert.equal(new URL(api.accountComparisonUrl(api.keepAccount(restored,account('second-account'))),'https://navigator.modavis.org').searchParams.get('snapshot'),snapshot);
});

test('binding kind, collection, exact identifier and all pins must agree with the retained URL', () => {
 const known=examples();
 for(const view of known){
  assert.throws(()=>api.retainView(empty(),{...view,binding:{...view.binding,snapshot:'f'.repeat(64)}}),/disagree/);
  assert.throws(()=>api.retainView(empty(),{...view,binding:{...view.binding,resource:'urn:other'}}),/identifier and link disagree/);
  assert.throws(()=>api.retainView(empty(),{...view,url:view.url+'&snapshot='+referencePin}),/disagree/);
  assert.throws(()=>api.retainView(empty(),{...view,url:view.url.replace('&snapshot='+referencePin,'').replace('?snapshot='+referencePin,'')}),/disagree/);
  assert.throws(()=>api.retainView(empty(),{...view,url:'/organs/TEST? snapshot='+referencePin}),/binding|route|disagree/);
  assert.throws(()=>api.retainView(empty(),{...view,binding:{...view.binding,kind:'unsupported'}}),/Unsupported/);
 }
 assert.throws(()=>api.retainView(empty(),{...known[2],binding:{...known[2].binding,collection:'vao'}}),/collection and link disagree/);
 assert.throws(()=>api.retainView(empty(),{...known[0],binding:{...known[0].binding,collection:'modavis_person_terminology'}}),/exact scheme/);
 assert.throws(()=>api.retainView(empty(),{...known[1],binding:{...known[1].binding,researchIndexSha256:'f'.repeat(64)}}),/disagree/);
 assert.throws(()=>api.retainView(empty(),{...known[1],binding:{...known[1].binding,publicCoreSha256:undefined}}),/public data snapshot/);
});

test('independent bindings cannot authorize a non-vocabulary view or carry credential-bearing identifiers', () => {
 const view=examples()[2];
 for(const url of ['/use-cases/research-workbench?snapshot='+referencePin,'/source/SOURCE?snapshot='+referencePin,'/vocab/usage/stops?term=Principal&snapshot='+referencePin])assert.throws(()=>api.retainView(empty(),{...view,url}),/Unsupported/);
 const unsafe='https://user:secret@example.org/resource';
 assert.throws(()=>api.retainView(empty(),{...view,url:`/vocab/reference?collection=network&uri=${encodeURIComponent(unsafe)}&snapshot=${referencePin}`,binding:{...view.binding,resource:unsafe}}),/exact absolute/);
 assert.throws(()=>api.retainView(empty(),{...view,url:view.url+'&assessment='+assessment}),/Unsupported/);
 assert.throws(()=>api.retainView(empty(),{...view,url:view.url+'&collection=network'}),/repeated/);
 assert.throws(()=>api.retainView(empty(),{...view,binding:{...view.binding,canonicalPromotion:true}}),/binding field/);
});

test('a reference-only workspace needs no invented POD snapshot and can explicitly attach a verified dataset later', () => {
 let state=api.createReferenceWorkspace('2026-10-30T10:00:00.000Z');
 assert.equal(state.snapshot,undefined);
 for(const view of examples())state=api.retainView(state,view);
 const restored=api.parseWorkspace(JSON.stringify(state));assert.equal(restored.snapshot,undefined);assert.equal(restored.views.length,5);
 assert.throws(()=>api.keepRecord(state,record(1)),/verified POD/);
 assert.throws(()=>api.keepAccount(state,account('a')),/verified POD/);
 assert.throws(()=>api.retainView(state,{title:'POD view',url:'/organs'}),/verified POD/);
 assert.throws(()=>api.organComparisonUrl(state),/verified POD/);
 const attached=api.bindWorkspaceDataset(state,snapshot,assessment);
 assert.equal(attached.snapshot,snapshot);assert.equal(attached.assessment,assessment);assert.equal(attached.views.length,5);
 assert.equal(state.snapshot,undefined,'attaching must not mutate the original workspace');
 assert.throws(()=>api.bindWorkspaceDataset(attached,'f'.repeat(64),assessment),/has not been replaced/);
 assert.equal(api.keepRecord(attached,record(1)).records.length,1);
});

test('v1 workspace files migrate in memory with all six existing saved items preserved', () => {
 let old=api.keepRecord(empty(),record(1));
 old=api.keepRecord(old,{kind:'person',id:'PERSON',title:'Example person',url:'/persons/PERSON'});
 old=api.keepRecord(old,{kind:'place',id:'PLACE',title:'Example place',url:'/places/PLACE'});
 old=api.keepAccount(old,account('old-a'));old=api.keepAccount(old,account('old-b'));
 old=api.retainView(old,{title:'Original cohort',url:`/organs?q=Leipzig&snapshot=${snapshot}`});
 const legacy={...old,schema:'modavis.research-workspace/v1'},contents=JSON.stringify(legacy);
 const migrated=api.parseWorkspace(contents);
 assert.equal(migrated.schema,'modavis.research-workspace/v2');
 for(const key of ['records','accounts','views'])assert.equal(JSON.stringify(migrated[key]),JSON.stringify(old[key]));
 assert.equal(migrated.records.length+migrated.accounts.length+migrated.views.length,6);
 assert.equal(contents,JSON.stringify(legacy));
 assert.throws(()=>api.parseWorkspace(JSON.stringify({...legacy,views:[{...migrated.views[0],binding:examples()[0].binding}]})),/version 2/);
});

function storageContext(original,failKey){
 const values=new Map(original===undefined?[]:[[api.WORKSPACE_KEY,original]]);const events=[];
 context.location={origin:'https://navigator.modavis.org'};
 context.CustomEvent=CustomEvent;
 context.window={dispatchEvent:event=>{events.push(event.type);return true;}};
 context.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(key===failKey)throw new Error('Storage quota exceeded');values.set(key,value);}};
 return {values,events};
}

test('the first persisted legacy upgrade backs up original bytes once and later saves retain them', () => {
 const original=JSON.stringify({...empty(),schema:'modavis.research-workspace/v1'});
 const {values,events}=storageContext(original);
 const state=api.retainView(api.parseWorkspace(original),examples()[0]);
 api.writeWorkspace(state);
 assert.equal(values.get(api.WORKSPACE_BACKUP_KEY),original);
 assert.equal(JSON.parse(values.get(api.WORKSPACE_KEY)).schema,'modavis.research-workspace/v2');
 api.writeWorkspace(api.retainView(state,examples()[1]));
 assert.equal(values.get(api.WORKSPACE_BACKUP_KEY),original);
 assert.deepEqual(events,['modavis:workspace-changed','modavis:workspace-changed']);
});

test('failed backup or primary storage never reports a persisted upgrade and preserves the original primary value', () => {
 const original=JSON.stringify({...empty(),schema:'modavis.research-workspace/v1'});
 for(const failKey of [api.WORKSPACE_BACKUP_KEY,api.WORKSPACE_KEY]){
  const {values,events}=storageContext(original,failKey);
  assert.throws(()=>api.writeWorkspace(api.retainView(api.parseWorkspace(original),examples()[0])),/quota/);
  assert.equal(values.get(api.WORKSPACE_KEY),original);
  assert.equal(events.length,0);
 }
});

test('contextual save resolves only with a workspace-owner acknowledgement and fails when no owner is ready', async () => {
 context.CustomEvent=CustomEvent;
 context.window={dispatchEvent:()=>true};
 await assert.rejects(api.addViewToWorkspace(examples()[0]),/not ready/);
 context.window={dispatchEvent:event=>{assert.equal(event.type,'modavis:workspace-view');assert.equal(event.cancelable,true);event.preventDefault();event.detail.resolve({saved:true,persisted:true,message:'Term saved with its exact version.'});return false;}};
 const result=await api.addViewToWorkspace(examples()[0]);
 assert.equal(result.persisted,true);assert.match(result.message,/exact version/);
 context.window={dispatchEvent:event=>{event.preventDefault();event.detail.reject(new Error('Storage is unavailable'));return false;}};
 await assert.rejects(api.addViewToWorkspace(examples()[0]),/Storage is unavailable/);
});

test('detail identities are explicit, controlled scheme routes are canonical and imported page bounds stay valid', () => {
 for(const view of examples())assert.throws(()=>api.retainView(empty(),{...view,binding:{...view.binding,resource:undefined}}),/exact retained term identifier/);
 const controlled=examples()[0];
 assert.throws(()=>api.retainView(empty(),{...controlled,url:controlled.url.replace('/modavis_activity_types/concepts/','/concepts/')}),/exact scheme/);
 assert.throws(()=>api.retainView(empty(),{...controlled,url:controlled.url+'&offset=-1'}),/page bounds/);
 assert.throws(()=>api.retainView(empty(),{...controlled,url:controlled.url+'&limit=501'}),/page bounds/);
 const omaro=examples()[4];
 assert.throws(()=>api.retainView(empty(),{...omaro,url:omaro.url+'&limit=101'}),/page bounds/);
});

test('legacy reads do not rewrite stored bytes and an existing recovery backup is never overwritten', () => {
 const original=JSON.stringify({...empty(),schema:'modavis.research-workspace/v1'});
 const {values,events}=storageContext(original);
 const restored=api.readWorkspace();
 assert.equal(restored.schema,'modavis.research-workspace/v2');
 assert.equal(values.get(api.WORKSPACE_KEY),original);assert.equal(values.has(api.WORKSPACE_BACKUP_KEY),false);assert.equal(events.length,0);
 values.set(api.WORKSPACE_BACKUP_KEY,'existing recovery bytes');
 api.writeWorkspace(api.retainView(restored,examples()[0]));
 assert.equal(values.get(api.WORKSPACE_BACKUP_KEY),'existing recovery bytes');
});
