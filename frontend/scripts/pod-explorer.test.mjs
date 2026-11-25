import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {LoadingContent} from './loading-content-test-support.mjs';

const require = createRequire(import.meta.url);
function load(name, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');
  const context = {exports: {}, URLSearchParams, ...globals,
    require: id => id.endsWith('.css') ? {} : dependencies[id] || (id === './LoadingContent' ? {LoadingContent} : id === './uiLocale' ? load('uiLocale.tsx') : require(id))};
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText, context);
  return context.exports;
}
const model = load('PodExplorerModel.ts');

test('collection requests retain supported filters and explicit pagination', () => {
  const selection = model.explorerQuery('?collection=scores&q=Bach&format=pdf&analysis_status=available&offset=12');
  assert.equal(selection.family, 'scores');
  const request = new URL(selection.url, 'https://example.test');
  assert.equal(request.pathname, '/api/scores');
  assert.equal(request.searchParams.get('q'), 'Bach');
  assert.equal(request.searchParams.get('format'), 'pdf');
  assert.equal(request.searchParams.get('limit'), '12');
  assert.equal(request.searchParams.get('collection'), null);
  assert.equal(model.collectionFullUrl('/scores', selection.params), '/scores?q=Bach&format=pdf&analysis_status=available&offset=12&evidence_strength=all&sort=evidence');
});

test('event selections use the same type and source in compact and full results', () => {
  const selection = model.explorerQuery('?collection=events&event_type=construction&source=npor');
  const request = new URL(selection.url, 'https://example.test');
  assert.equal(request.searchParams.get('type'), 'construction');
  assert.equal(request.searchParams.get('source'), 'npor');
  assert.equal(request.searchParams.has('event_type'), false);
  assert.equal(model.collectionFullUrl('/events', selection.params), '/events?source=npor&type=construction');
  const card = model.collectionCard('events', {title:'Construction', subject:{title:'Chapel'}, when:{rawExpression:'around 1840'}});
  assert.equal(card.description, 'Chapel · around 1840');
});

test('malformed links fail explicitly rather than dropping selection operands', () => {
  for (const query of ['collection=bogus', 'collection=places&soruce=one', 'collection=scores&q=&q=Bach',
    'collection=organs&offset=-1', 'collection=scores&offset=10001', 'collection=literature&source=one',
    'collection=literature&year_from=banana', 'collection=literature&year_from=1900&year_to=1800',
    'collection=scores&format=typo', 'collection=virtual-instruments&organ_link=typo']) {
    assert.throws(() => model.explorerQuery(query), query);
  }
});

test('public producer shapes link to their existing detail pages', () => {
  const rows = [
    ['organs',{mdvsId:'MDVS:ENTY:O', title:'Chapel', pageUrl:'/organs/O'},'/organs/O'],
    ['actors',{id:'actor',label:'Builder',detailUrl:'/entity/people/A'},'/entity/people/A'],
    ['literature',{literatureId:'gdo:1',title:'An organ study',publicationYear:1900},'/literature/gdo%3A1'],
    ['scores',{scoreId:'source:1',title:'Score',composer:'Composer',license:{name:'CC BY'}},'/scores/source%3A1'],
    ['temperaments',{id:'T',title:'Tuning',urls:{temperament:'/temperaments/T'}},'/temperaments/T'],
    ['events',{id:'event:a',title:'Restoration',pageUrl:'/events/event%3Aa'},'/events/event%3Aa'],
    ['virtual-instruments',{id:'V',title:'Virtual organ',canonicalUrl:'/virtual-instruments/V'},'/virtual-instruments/V'],
  ];
  for (const [family,row,url] of rows) assert.equal(model.collectionCard(family,row).href,url);
  for (const href of ['javascript:alert(1)','//untrusted.test','/\\untrusted.test']) assert.equal(model.internalHref(href),undefined);
});

test('workspace handoffs use stable entity identities and supported kinds', () => {
  const organ=model.collectionWorkspaceItem('organs',{mdvsId:'MDVS:ENTY:O',title:'Chapel',pageUrl:'/organs/O'});
  assert.equal(organ.kind,'organ'); assert.equal(organ.id,'MDVS:ENTY:O'); assert.equal(organ.url,'/organs/O');
  assert.equal(model.collectionWorkspaceItem('actors',{id:'A',mdvsId:'MDVS:ENTY:A',title:'Workshop',entityClass:'organization',detailUrl:'/organizations/A'}).kind,'organization');
  assert.equal(model.collectionWorkspaceItem('actors',{id:'source:A',title:'Unresolved workshop',entityClass:'organization',detailUrl:'/source-actors/A'}).kind,'actor');
  assert.equal(model.collectionWorkspaceItem('sources',{id:'sr:one',title:'Source record',url:'/source/sr%3Aone'}).kind,'view');
  assert.equal(model.collectionWorkspaceItem('scores',{scoreId:'score:1',title:'Score'}).kind,'score');
  assert.equal(model.collectionWorkspaceItem('organs',{id:'O',title:'Invalid link',pageUrl:'//untrusted.test'}),null);
});

const family = {id:'organs',title:'Organs',description:'Follow documented evidence.',count:2,unit:'organ records',available:true,url:'/organs',api:'/api/organs',boundary:'Source coverage is not a census.'};
const access = {graphqlAvailable:true,graphqlEndpoint:'/api/graphql',entityKinds:['organ','place'],profiles:['modavis','cidoc','edm','pon'],distributionManifest:'/dataset/pod/version/1.6.0/distribution-manifest.json',releaseContext:'/api/release-context',researchPackages:true};
const catalog = {release:'fixture',snapshot:'a'.repeat(64),families:[family],sources:[],exclusions:[],countScope:'Exact retained rows',dataAccess:access};
function renderExplorer(response, search='?collection=organs&q=Chapel', availableCatalog=catalog) {
  const mock = {usePodRead:url=>({data:url==='/api/pod/capabilities'?availableCatalog:response,retry(){}})};
  const component=load('PodExplorer.tsx', {'./PodExplorerModel':model,'./PodExplorerApi':mock,'./PodExplorerAccess':{PodExplorerAccess:()=>null}}, {location:{search}}).PodExplorer;
  return renderToStaticMarkup(createElement(component));
}

test('populated producer-to-explorer rendering keeps titles, links and matching denominator', () => {
  const html=renderExplorer({items:[{id:'O',title:'Chapel',pageUrl:'/organs/O'}],total:1,limit:12,offset:0});
  assert.match(html,/href="\/organs\/O"/); assert.match(html,/1<\/strong> matching organ records/);
  assert.match(html,/aria-label="POD collections"/); assert.match(html,/aria-label="Organs pages"/);
});

test('compact collection picker retains every family, grouped navigation and count units', () => {
  const families=model.familyIds.map(id=>({...family,id,title:id,count:id==='actors'?656686:2,unit:id==='actors'?'directory entries':'retained records'}));
  const html=renderExplorer({items:[],total:0,limit:12,offset:0},'?collection=organs',{...catalog,families});
  const picker=html.match(/<select[^>]*aria-controls="pod-collection-results"[\s\S]*?<\/select>/)?.[0];
  assert.ok(picker,'A labelled native picker controls the selected collection');
  assert.equal((picker.match(/<option /g)||[]).length,16);
  for(const id of model.familyIds) assert.ok(picker.includes('value="'+id+'"'),id);
  assert.equal((picker.match(/<optgroup /g)||[]).length,3);
  assert.match(picker,/<option value="organs" selected="">/);
  assert.match(html,/656,686 directory entries/);
  assert.match(html,/Source coverage is not a census/);
  assert.doesNotMatch(html,/One dataset\. Many research paths|read-only public projection|pod-hero/);
});

test('secondary filters disclose applied link values and keep the full collection link scoped', () => {
  const response={items:[],total:0,limit:12,offset:0};
  const unfiltered=renderExplorer(response,'?collection=organs');
  assert.match(unfiltered,/<details class="pod-filter-details">/);
  const filtered=renderExplorer(response,'?collection=organs&source=orgbase&q=Chapel',{
    ...catalog,sources:[{source_key:'orgbase',source_record_count:1,canonical_organ_count:1}],
  });
  assert.match(filtered,/<details class="pod-filter-details" open="">/);
  assert.match(filtered,/<option value="orgbase" selected="">/);
  assert.match(filtered,/value="Chapel"/);
  assert.match(filtered,/href="\/organs\?source=orgbase&amp;q=Chapel"/);
  assert.match(filtered,/1 applied/);
});

test('the collection picker leaves unavailable tools visible and explains their state', () => {
  const html=renderExplorer({},'?collection=research',{...catalog,families:[{...family,id:'research',title:'Research workbench',count:null,available:false}]});
  assert.match(html,/<option value="research" selected="">Research workbench · unavailable<\/option>/);
  assert.match(html,/This resource is currently unavailable/);
  assert.match(html,/Other collections remain available/);
});

test('empty and malformed responses leave usable recovery actions', () => {
  assert.match(renderExplorer({items:[],total:0,limit:12,offset:0}),/No matching records/);
  assert.match(renderExplorer({items:[],total:0,limit:12,offset:0}),/Clear this collection/);
  const outOfRange=renderExplorer({items:[],total:1,limit:12,offset:12},'?collection=organs&q=Chapel&offset=12');
  assert.match(outOfRange,/This page is beyond the matching records/);
  assert.match(outOfRange,/Return to the first page/);
  assert.doesNotMatch(outOfRange,/No matching records/);
  assert.match(renderExplorer({items:null,total:4}),/unsupported response/);
  assert.match(renderExplorer({},'?collection=organs&soruce=one'),/Unsupported collection filter/);
});

test('data-access view renders an editable bounded runner and resolved export profiles', () => {
  const mock = {usePodRead:()=>({data:{profiles:[{key:'cidoc',label:'CIDOC CRM',format:'JSON-LD',url:'/dataset/example.cidoc.jsonld'}],native:[],sourceDataUrl:'/api/exports/organ/O/sources'},retry(){}})};
  const component=load('PodExplorerAccess.tsx', {'./PodExplorerModel':model,'./PodExplorerApi':mock}).PodExplorerAccess;
  const html=renderToStaticMarkup(createElement(component,{snapshot:'a'.repeat(64),access}));
  assert.match(html,/GraphQL query/); assert.match(html,/Variables · JSON/); assert.match(html,/Run query/);
  assert.match(html,/CIDOC CRM/); assert.match(html,/Field evidence coverage/); assert.match(html,/Bulk distribution manifest/);
  for(const id of ['pod-entity-export','pod-graphql','pod-dataset-downloads']) {
    assert.match(html,new RegExp('href="#'+id+'"'));
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.ok(html.indexOf('id="pod-entity-export"')<html.indexOf('id="pod-graphql"'));
  const unavailable=renderToStaticMarkup(createElement(component,{snapshot:null,access:{...access,graphqlAvailable:false}}));
  assert.match(unavailable,/disabled=""/); assert.match(unavailable,/pinned snapshot is unavailable/);
});

test('related-resource rendering qualifies retained links and does not assert missing organ associations', () => {
  const payload={organ:{id:'O',title:'Chapel',url:'/organs/O'},collections:[],virtualInstruments:[{id:'V',title:'Virtual organ',url:'/virtual-instruments/V',relationshipState:'retained_probable',evidenceSha256:'hash'}],temperamentAssertions:[{id:'T',wording:'Source wording',source:'one',sourceUrl:'/source/S',lookupUrl:'/temperaments?q=wording',evidenceSha256:'hash'}],unavailableRelationships:[{id:'scores',reason:'No accepted organ-to-score relation.',browseUrl:'/pod-explorer?collection=scores'}],relationshipBoundary:'Retained evidence only.',temperamentBoundary:'Exact tuning is not established.',resourceEvidenceUrl:'/api/pod/organs/O/resources',exportManifestUrl:'/api/exports/organ/O',itemLimit:20};
  const component=load('PodExplorerRelated.tsx',{'./PodExplorerApi':{usePodRead:()=>({data:payload,retry(){}})}}).PodRelatedResources;
  const html=renderToStaticMarkup(createElement(component,{organId:'O'}));
  assert.match(html,/retained probable/); assert.match(html,/Exact tuning is not established/);
  assert.match(html,/No accepted organ-to-score relation/); assert.match(html,/href="\/source\/S"/);
});
