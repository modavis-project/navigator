import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import {testUiLocale} from './ui-locale-test-support.mjs';

// Render the actual presentation components. Query transitions and saved state
// remain covered by their existing model tests; no browser hooks are simulated.
const source = readFileSync(new URL('../src/researchWorkbench.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/ResearchWorkspacePanel.tsx', import.meta.url), 'utf8');
const labels = {exports: {}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/workbenchLabels.ts', import.meta.url), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS},
}).outputText, labels);
const context = {
  exports: {}, require: createRequire(import.meta.url),
  enc: encodeURIComponent, pretty: value => String(value ?? 'Unspecified').replace(/_/g, ' '),
  useUiLocale: () => testUiLocale(), ...labels.exports,
  Bookmark: () => null, ChevronLeft: () => null, ChevronRight: () => null,
  JsonEvidence: () => null, addAccountToWorkspace: () => {},
};
const components = source.slice(source.indexOf('const WORKBENCH_VIEWS'), source.indexOf('export function ResearchWorkbench'))
  + panel.slice(panel.indexOf('function WorkspaceTabs('), panel.indexOf('export function ResearchWorkspace'));
vm.runInNewContext(ts.transpileModule(components, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, context);
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const views = vm.runInNewContext('WORKBENCH_VIEWS', context);

test('German disposition results preserve the source wording and the pinned account revision', () => {
  const original = readFileSync(new URL('../src/DispositionFinder.tsx', import.meta.url), 'utf8');
  const resolve = createRequire(import.meta.url);
  const module = {exports: {}, require: id => {
    if (id === './uiLocale') return {useUiLocale: () => testUiLocale('de')};
    if (id === './JsonEvidence') return {JsonEvidence: () => null};
    if (id === './researchWorkspace') return {addAccountToWorkspace: () => {}, addViewToWorkspace: () => {}};
    return resolve(id);
  }};
  vm.runInNewContext(ts.transpileModule(original, {compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText, module);
  const revision = 'c'.repeat(64);
  const accountHref = `/organs/EXAMPLE?tab=specification&description=account-a&descriptionRevision=${revision}`;
  const data = {publicCoreSha256: 'a'.repeat(64), selectionSha256: 'b'.repeat(64), total: 1, accountCount: 1, organCount: 1,
    filters: {scope: 'division', stop: [{label: 'Principal', pitch: '8′'}, {label: 'Octave', pitch: '4′'}]}, offset: 0, hasMore: false,
    items: [{id: 'a', organId: 'MDVS:ENTY:EXAMPLE', organLabel: 'Example Chapel', organHref: '/organs/EXAMPLE', accountHref,
      descriptionId: 'account-a', descriptionRevision: revision, sourceRecordId: 'sr:sample:a', source: 'sample',
      sourceHeading: 'An older spelling', periodLabel: 'Before 1900', timeKind: 'relative', realization: 'proposed',
      division: {position: 1, label: 'Grand Orgue'}, matches: [
        {predicateIndex: 0, witnessRowId: 'a', rows: [{id: 'a', label: 'Principal', pitch: '8′', sourceWording: 'Principal de 8 pieds', evidenceKind: 'recovered'}]},
        {predicateIndex: 1, witnessRowId: 'b', rows: [{id: 'b', label: 'Octave', pitch: '4′', sourceWording: 'Octave 4′'}]},
      ],
    }],
  };
  const html = render(module.exports.DispositionResults, {data, page: 0, onPage: () => {}});
  for (const label of ['Dokumentierte Registerkombinationen', '1 passendes benanntes Werk', 'Grand Orgue', 'An older spelling',
    'Principal de 8 pieds', 'Octave 4′', 'Relative Datierung', 'Entwurf', 'Nachträglich aus der erhaltenen Quelle erfasst']) assert(html.includes(label), label);
  assert(html.includes(accountHref.replaceAll('&', '&amp;')));
});

test('desktop and compact view controls expose the disposition finder and use the same transition', () => {
  const calls = [], props = {mode:'compare',go:value=>calls.push({...value}),views};
  const html = render(context.WorkbenchViews, props);
  assert.equal([...html.matchAll(/aria-pressed=/g)].length, 9);
  assert.equal([...html.matchAll(/<option /g)].length, 9);
  assert.match(html, /<option value="dispositions">Find stop combinations<\/option>/);
  assert.match(html, /<option value="compare" selected="">Compare source accounts<\/option>/);
  assert.match(html, /aria-pressed="true"[^>]*>Accounts<\/button>/);
  const element = context.WorkbenchViews(props);
  const [navigation, label] = element.props.children;
  navigation.props.children.find(tab => tab.key === 'dispositions').props.onClick();
  label.props.children[1].props.onChange({target:{value:'dispositions'}});
  assert.deepEqual(calls, [{view:'dispositions',page:0},{view:'dispositions',page:0}]);
});

test('an unsupported view remains explicit in the compact control', () => {
  const html = render(context.WorkbenchViews,{mode:'unsupported',go:()=>{},views});
  assert.match(html, /value="unsupported" selected="">Unsupported view: unsupported/);
  assert.doesNotMatch(html, /aria-pressed="true"/);
});

test('source accounts retain dates, attribution and uncertainty under their readable metadata', () => {
  const html = render(context.AccountSummary, {value:{
    description_id:'account-a',description_revision:'c'.repeat(64),organ_mdvs_id:'MDVS:ENTY:EXAMPLE',
    href:'/organs/EXAMPLE?tab=specification&description=account-a',source_heading:'Account from the source',
    period_label:'Before 1890',time_kind:'relative',coverage:'partial_structured_stops',subject_kind:'organ',realization:'documented',
    source:{source_key:'example-source',source_url:'https://example.invalid/source'},
    chronology:{sourceRelativeContext:{temporalRelation:'before',boundaryYear:1890},sourceDateQualification:true,
      eventAssociations:[{eventId:'event-a',temporalRelation:'before'}]},
  }});
  for (const text of ['Recorded period','Before 1890','Date basis','relative','Capture coverage','partial structured stops','example-source','Keep account']) assert(html.includes(text), text);
  assert.match(html, /<details class="wb-account-qualification"><summary>Dating and related events<\/summary>/);
  assert.match(html, /boundary, not an exact configuration year/);
  assert.match(html, /Physical continuity and causation unestablished/);
  assert.match(html, /href="\/events\/event-a"/);
  assert.match(html, /href="https:\/\/example.invalid\/source"/);
});

test('comparison tables provide a keyboard reachable scroll region and row headings', () => {
  const organs = [1,2].map(number=>({id:'organ-'+number,title:'Example organ '+number,href:'/organs/'+number,
    sourceRecords:2,sourceCollections:1,configurationAccounts:0,eventAssertions:3,datedEventAssertions:1,technicalAssertions:0,
    accounts:[],accountsComplete:true,assertions:[],assertionsComplete:true,
    allAccountsHref:'/accounts/'+number,timelineHref:'/timeline/'+number,claimsHref:'/claims/'+number}));
  const html = render(context.OrganComparison,{data:{organs,sourceCoverage:[],method:'Source assertions remain separate.',semanticQuery:{id:'sha256:example'}}});
  assert.match(html, /role="region" tabindex="0" aria-label="Organ evidence comparison, scroll to see all columns"/);
  assert.equal([...html.matchAll(/<th scope="row">/g)].length, 6);
  assert.match(html, /Counts refer to the selected public organ records/);
  assert.match(html, /No aggregate technical assertion was captured/);
});

test('workspace segments show counts and change only the visible saved-item category', () => {
  const calls = [], props = {tab:'records',counts:{views:3,records:2,accounts:1},onChange:value=>calls.push(value)};
  const html = render(context.WorkspaceTabs,props);
  assert.match(html,/aria-pressed="true" aria-controls="rw-records"/);
  assert.match(html,/>Saved views<\/span><b>3<\/b>/);
  assert.match(html,/>Accounts<\/span><b>1<\/b>/);
  const element = context.WorkspaceTabs(props);
  element.props.children[2].props.onClick();
  assert.deepEqual(calls,['accounts']);
});


test('the native results shortcut displays only known matching counts and preserves the query URL', () => {
  assert.equal(render(context.ResultJump,{}),'');
  const html=render(context.ResultJump,{data:{total:198,unit:'organ records'}});
  assert.match(html,/href="#wb-results"/);
  assert.match(html,/198 organ records/);
  assert.match(render(context.ResultJump,{data:{total:0,unit:'event assertions'}}),/0 event assertions/);
  assert.doesNotMatch(render(context.ResultJump,{data:{organs:[]}}),/0 results|undefined/);
});
