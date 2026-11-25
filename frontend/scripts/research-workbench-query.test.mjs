import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/researchWorkbenchQuery.ts', import.meta.url), 'utf8');
const context = { exports: {}, URLSearchParams };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText, context);
const change = context.exports.transitionWorkbenchQuery;
const revisit = context.exports.rememberedWorkbenchQuery;
const fillPins = context.exports.fillMissingWorkbenchPins;
const values = params => Object.fromEntries(params);

test('disposition criteria remain repeated, ordered, and independent of the terminology view', () => {
  const remembered = new Map();
  const source = new URLSearchParams('view=terms&q=Principal&pitch=8&source=example&snapshot=core&assessment=policy');
  const search = revisit(source, {view: 'dispositions', stop: ['Bourdon|16', 'Principal|8'], scope: 'division', page: 0}, remembered, true);
  const page = revisit(search, {page: 2}, remembered);
  const request = context.exports.workbenchRequestQuery(page, 'dispositions');
  assert.deepEqual(request.getAll('stop'), ['Bourdon|16', 'Principal|8']);
  assert.equal(request.get('scope'), 'division');
  assert.equal(request.get('page'), '2');
  assert.equal(request.get('snapshot'), 'core');
  assert.equal(request.get('assessment'), 'policy');
  assert.equal(request.has('q'), false);
  const terms = revisit(page, {view: 'terms'}, remembered);
  assert.equal(terms.get('q'), 'Principal');
  assert.equal(terms.has('stop'), false);
  assert.equal(terms.has('scope'), false);
  const restored = revisit(terms, {view: 'dispositions'}, remembered);
  assert.deepEqual(restored.getAll('stop'), request.getAll('stop'));
  assert.equal(restored.get('scope'), 'division');
  assert.equal(restored.get('page'), '0');
});

test('selection to terms to selection keeps bindings and shared source/period, not inactive operands', () => {
  const terms = change(new URLSearchParams('view=selection&section=events&actor=A&q=Chapel&source=one&from=1700&date=exact&snapshot=core&assessment=assessed&page=4'), { view: 'terms' });
  assert.deepEqual(values(terms), { view: 'terms', source: 'one', from: '1700', snapshot: 'core', assessment: 'assessed', page: '0' });
  terms.set('mode', 'stops'); terms.set('q', 'Principal'); terms.set('pitch', '8'); terms.set('country', 'DE');
  const selection = change(terms, { view: 'selection' });
  assert.deepEqual(values(selection), { view: 'selection', source: 'one', from: '1700', snapshot: 'core', assessment: 'assessed', page: '0' });
});

test('selecting a first account preserves selection, then comparison keeps only exact account operands', () => {
  const original = new URLSearchParams('section=configurations&organ=O&source=one&snapshot=core');
  const first = change(original, { left: 'account-a', leftRevision: 'rev-a' });
  assert.equal(first.get('source'), 'one'); assert.equal(first.get('section'), 'configurations');
  const compare = change(first, { right: 'account-b', rightRevision: 'rev-b', view: 'compare' });
  assert.deepEqual(values(compare), { snapshot: 'core', left: 'account-a', leftRevision: 'rev-a', right: 'account-b', rightRevision: 'rev-b', view: 'compare', page: '0' });
  const back = change(compare, { view: 'selection' });
  assert.equal(back.get('leftRevision'), 'rev-a'); assert.equal(back.get('rightRevision'), 'rev-b');
});

test('timeline and claims retain the organ selector but remove unsupported selection filters', () => {
  const timeline = change(new URLSearchParams('organ=O&actor=A&q=Chapel&source=one&from=1700&snapshot=core'), { view: 'timeline' });
  assert.deepEqual(values(timeline), { organ: 'O', snapshot: 'core', view: 'timeline', page: '0' });
  assert.deepEqual(values(change(timeline, { view: 'claims' })), { organ: 'O', snapshot: 'core', view: 'claims', page: '0' });
});

test('source-record and source-key filters do not cross attribution tabs implicitly', () => {
  const occurrence = change(new URLSearchParams('actor=A&organ=O&source=provider-key&snapshot=core'), { view: 'occurrences' });
  assert.equal(occurrence.get('source'), null); assert.equal(occurrence.get('actor'), 'A');
  occurrence.set('source', 'record-id'); occurrence.set('status', 'date_unestablished');
  const selection = change(occurrence, { view: 'selection' });
  assert.equal(selection.get('source'), null); assert.equal(selection.get('status'), null);
  assert.equal(change(occurrence, { view: 'selection', source: 'explicit-provider' }).get('source'), 'explicit-provider');
});

test('section transitions remove incompatible filters, without changing untouched loaded URLs', () => {
  const loaded = new URLSearchParams('section=organs&q=Chapel&date=exact&soruce=one&source=one&source=two');
  assert.equal(change(loaded, {}).toString(), loaded.toString());
  assert.equal(change(loaded, { page: 1 }).get('date'), 'exact');
  const events = change(new URLSearchParams('section=configurations&coverage=partial&organ=O&snapshot=core'), { section: 'events' });
  assert.equal(events.get('coverage'), null); assert.equal(events.get('organ'), 'O');
  const terms = change(loaded, { view: 'terms' });
  assert.equal(terms.get('soruce'), 'one'); assert.deepEqual(terms.getAll('source'), ['one', 'two']);
});

test('identity tab drops inactive filters; form reset explicitly replaces query state', () => {
  const identities = change(new URLSearchParams('view=terms&mode=stops&q=Principal&snapshot=core&assessment=assessed'), { view: 'identities' });
  assert.deepEqual(values(identities), { snapshot: 'core', assessment: 'assessed', view: 'identities', page: '0' });
  assert.deepEqual(values(change(new URLSearchParams('soruce=one'), { view: 'terms', q: 'Principal' }, true)), { view: 'terms', q: 'Principal', page: '0' });
});

test('configuration cohort survives compare then Build a selection without leaking into compare', () => {
  const remembered = new Map();
  const cohort = new URLSearchParams('section=configurations&organ=O&source=one&q=Chapel&coverage=partial&from=1700&snapshot=core&assessment=assessed');
  const first = revisit(cohort, { left: 'account-a', leftRevision: 'rev-a' }, remembered);
  const compare = revisit(first, { right: 'account-b', rightRevision: 'rev-b', view: 'compare' }, remembered);
  assert.deepEqual(values(compare), {
    snapshot: 'core', assessment: 'assessed', left: 'account-a', leftRevision: 'rev-a',
    right: 'account-b', rightRevision: 'rev-b', view: 'compare', page: '0',
  });
  const returned = revisit(compare, { view: 'selection', page: 0 }, remembered);
  for (const key of ['section', 'organ', 'source', 'q', 'coverage', 'from', 'snapshot', 'assessment']) {
    assert.equal(returned.get(key), cohort.get(key), key);
  }
  assert.equal(returned.get('left'), 'account-a'); assert.equal(returned.get('leftRevision'), 'rev-a');
  assert.equal(returned.get('right'), 'account-b'); assert.equal(returned.get('rightRevision'), 'rev-b');
  const compareAgain = revisit(returned, { view: 'compare' }, remembered);
  assert.equal(compareAgain.get('organ'), null); assert.equal(compareAgain.get('source'), null);
  assert.equal(compareAgain.get('rightRevision'), 'rev-b');
});

test('visited terminology restores its own operands while explicit resets replace remembered state', () => {
  const remembered = new Map();
  const original = new URLSearchParams('section=events&organ=O&q=Chapel&source=one&snapshot=core');
  let terms = revisit(original, { view: 'terms' }, remembered);
  terms = revisit(terms, { mode: 'stops', q: 'Principal', pitch: '8', country: 'DE' }, remembered);
  const selection = revisit(terms, { view: 'selection' }, remembered);
  assert.equal(selection.get('q'), 'Chapel'); assert.equal(selection.get('pitch'), null);
  const termsAgain = revisit(selection, { view: 'terms' }, remembered);
  assert.equal(termsAgain.get('q'), 'Principal'); assert.equal(termsAgain.get('pitch'), '8');
  assert.equal(termsAgain.get('country'), 'DE'); assert.equal(termsAgain.get('organ'), null);
  const reset = revisit(termsAgain, { view: 'selection', section: 'organs', organ: 'NEW' }, remembered, true);
  assert.equal(reset.get('organ'), 'NEW'); assert.equal(reset.get('source'), null);
  assert.equal(reset.get('q'), null); assert.equal(reset.get('section'), 'organs');
});

test('remembered state neither sanitizes loaded invalid links nor resurrects removed comparison operands', () => {
  const remembered = new Map();
  const invalid = new URLSearchParams('section=organs&q=Chapel&date=exact&soruce=one&source=one&source=two');
  assert.equal(revisit(invalid, {}, remembered).toString(), invalid.toString());
  const identities = revisit(invalid, { view: 'identities' }, remembered);
  const restored = revisit(identities, { view: 'selection' }, remembered);
  assert.equal(restored.get('date'), 'exact'); assert.equal(restored.get('soruce'), 'one');
  assert.deepEqual(restored.getAll('source'), ['one', 'two']);

  const pairs = new Map();
  let selection = new URLSearchParams('section=configurations&organ=O&left=a&leftRevision=rev-a&right=b&rightRevision=rev-b');
  const compare = revisit(selection, { view: 'compare' }, pairs);
  selection = revisit(compare, { view: 'selection' }, pairs);
  selection = revisit(selection, { left: null, leftRevision: null }, pairs);
  const compareAgain = revisit(selection, { view: 'compare' }, pairs);
  assert.equal(compareAgain.get('left'), null); assert.equal(compareAgain.get('leftRevision'), null);
  assert.equal(compareAgain.get('rightRevision'), 'rev-b');
});

test('removing a comparison account stays removed after visiting an intermediate tab', () => {
  const remembered = new Map();
  let comparison = new URLSearchParams('view=compare&left=a&leftRevision=rev-a&right=b&rightRevision=rev-b&snapshot=core');
  let selection = revisit(comparison, { view: 'selection', section: 'configurations', organ: 'O' }, remembered);
  selection = revisit(selection, { left: null, leftRevision: null }, remembered);
  const terms = revisit(selection, { view: 'terms' }, remembered);
  assert.equal(terms.has('right'), false); assert.equal(terms.has('rightRevision'), false);
  comparison = revisit(terms, { view: 'compare' }, remembered);
  assert.equal(comparison.has('left'), false); assert.equal(comparison.has('leftRevision'), false);
  assert.equal(comparison.get('right'), 'b'); assert.equal(comparison.get('rightRevision'), 'rev-b');
  assert.equal(comparison.has('organ'), false); assert.equal(comparison.has('section'), false);
});

test('filter form resets retain exact supplied dataset pins instead of rebinding to current context', () => {
  for (const pins of ['snapshot=old&assessment=old-assessment', 'snapshot=&assessment=',
    'snapshot=&snapshot=other&assessment=&assessment=other-assessment']) {
    const current = new URLSearchParams('view=selection&section=organs&q=Chapel&source=one&' + pins);
    const submitted = revisit(current, { view: 'selection', section: 'organs', q: 'Church' }, new Map(), true);
    const hydrated = fillPins(submitted, { snapshot: 'current', assessment: 'current-assessment' });
    assert.equal(hydrated.get('q'), 'Church'); assert.equal(hydrated.has('source'), false);
    for (const key of ['snapshot', 'assessment']) assert.deepEqual(hydrated.getAll(key), current.getAll(key), pins);
  }
  const absent = fillPins(revisit(new URLSearchParams('q=Chapel'), { q: 'Church' }, new Map(), true),
    { snapshot: 'current', assessment: 'current-assessment' });
  assert.equal(absent.get('snapshot'), 'current'); assert.equal(absent.get('assessment'), 'current-assessment');
});

test('tab return preserves remembered stale or malformed pins after history changes the current binding', () => {
  for (const pins of ['snapshot=old&assessment=old-assessment', 'snapshot=&assessment=',
    'snapshot=&snapshot=other&assessment=&assessment=other-assessment']) {
    const remembered = new Map();
    const selection = new URLSearchParams('section=configurations&organ=O&source=one&' + pins);
    revisit(selection, { view: 'terms' }, remembered);
    // Simulate history navigation to a different pinned terminology URL.
    const historyTerms = new URLSearchParams('view=terms&q=Principal&snapshot=new&assessment=new-assessment');
    const returned = fillPins(revisit(historyTerms, { view: 'selection' }, remembered),
      { snapshot: 'current', assessment: 'current-assessment' });
    for (const key of ['snapshot', 'assessment']) assert.deepEqual(returned.getAll(key), selection.getAll(key), pins);
    assert.equal(returned.get('organ'), 'O'); assert.equal(returned.get('source'), 'one');
  }
});

test('comparison revision hydration and same-account form submission never replace supplied pins', () => {
  const current = new URLSearchParams('view=compare&left=a&leftRevision=&leftRevision=old&right=b&rightRevision=stale');
  const hydrated = fillPins(current, { leftRevision: 'new-a', rightRevision: 'new-b' });
  assert.deepEqual(hydrated.getAll('leftRevision'), ['', 'old']);
  assert.equal(hydrated.get('rightRevision'), 'stale');
  const submitted = revisit(current, { view: 'compare', left: 'a', leftRevision: '', right: 'b', rightRevision: 'stale' }, new Map(), true);
  assert.deepEqual(submitted.getAll('leftRevision'), ['', 'old']);
  assert.equal(submitted.get('rightRevision'), 'stale');
  assert.equal(fillPins(new URLSearchParams('left=a'), { leftRevision: 'rev-a' }).get('leftRevision'), 'rev-a');
});


test('comparison selections do not refetch or reset the selected cohort', () => {
 const request = (params, view) => context.exports.workbenchRequestQuery(params, view).toString();
 const cohort = new URLSearchParams('view=selection&section=configurations&organ=O&snapshot=core&assessment=policy&page=2');
 const first = request(cohort, 'selection');
 cohort.set('left', 'A'); cohort.set('leftRevision', 'rev-A');
 assert.equal(request(cohort, 'selection'), first);
 cohort.set('right', 'B'); cohort.set('rightRevision', 'rev-B');
 assert.equal(request(cohort, 'selection'), first);
 const comparison = request(cohort, 'compare');
 assert.match(comparison, /left=A/); assert.match(comparison, /rightRevision=rev-B/);
 cohort.set('unknownOperand', 'must-refuse');
 assert.match(request(cohort, 'selection'), /unknownOperand=must-refuse/);
});
