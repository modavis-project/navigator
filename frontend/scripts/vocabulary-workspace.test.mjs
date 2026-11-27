import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url), modules = new Map();
const BASE = 'https://navigator.modavis.org';
const hash = letter => letter.repeat(64);
const CORE = hash('a'), CONTROLLED = hash('b'), SEED = hash('c'), INDEX = hash('d'), GRAPH = hash('e'), OMARO = hash('f');
function load(name) {
  if (name === 'api') return {publicGetJson: async () => { throw new Error('Unexpected unmocked public request'); }};
  if (modules.has(name)) return modules.get(name);
  const path = ['ts', 'tsx'].map(extension => new URL(`../src/${name}.${extension}`, import.meta.url)).find(existsSync);
  if (!path) throw new Error(`Missing test module: ${name}`);
  const exports = {}; modules.set(name, exports);
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  vm.runInNewContext(compiled, {exports, URL, URLSearchParams, AbortController, DOMException, Blob, setTimeout, clearTimeout,
    require: id => id.endsWith('.css') ? {} : id.startsWith('./') ? load(id.slice(2)) : require(id)});
  return exports;
}
const {resolveVocabularyWorkspaceView: resolve, vocabularyEvidenceHref: evidence, vocabularyCaptureUrl: capture} = load('vocabularyWorkspace');
const model = load('researchWorkspace');
const asUrl = value => new URL(value, BASE), plain = value => JSON.parse(JSON.stringify(value));
const scheme = {code: 'modavis_activity_types', mdvsId: 'MDVS:VOCB:ACTIVITIES', name: 'Activities', version: '2026-08-06', recordKind: 'governed_scheme'};
const concept = {code: 'activitype:repair', mdvsId: 'MDVS:VOCB:REPAIR', preferredLabel: 'Repair', recordKind: 'governed_concept', scheme};
const candidateId = 'urn:modavis:terminology-seed:action-mechanical', candidateScheme = 'urn:modavis:terminology-seed:action';
const candidate = {id: candidateId, scheme: candidateScheme, label: {en: 'Mechanical action'}, lifecycle: 'candidate'};
const registry = {registrySha256: SEED, publicCoreSha256: CORE, researchIndexSha256: INDEX, languages: ['en'], schemes: [{id: candidateScheme, title: 'Action designations'}], concept: candidate};
const publishedUri = 'https://w3id.org/modavis/vocab/instrument-type/pipe-organ';
const published = {snapshot: GRAPH, collection: {id: 'network', title: 'MODAVIS reference', version: '0.1.0', snapshot: GRAPH}, resource: {uri: publishedUri, label: 'pipe-organ instrument type'}};
const omaroUri = 'http://www.mimo-db.eu/InstrumentsKeywords/2266';
const omaroMeta = {snapshotSha256: OMARO, datasetVersion: '0.1.0', counts: {languages: {de: 1, en: 1}}};
const omaroDetail = {snapshotSha256: OMARO, concept: {uri: omaroUri, label: 'Organ'}, records: {labels: [{language: 'de', label_type: 'preferred', label: 'Orgel'}, {language: 'en', label_type: 'preferred', label: 'Organ'}]}};
const readControlled = async url => url === '/api/vocab/schemes' ? {items: [scheme]} : {concept, contentSha256: CONTROLLED};
function retain(view) { return model.retainView(model.createWorkspace(CORE), view); }


test('displayed capture adds missing native pins while preserving every explicitly requested pin', () => {
  const current = asUrl(capture('/vocab/registry', '?concept='+encodeURIComponent(candidateId)+'&q=Mechanical', {
    snapshot: SEED, coreSnapshot: CORE, indexSnapshot: INDEX,
  }));
  assert.equal(current.searchParams.get('snapshot'), SEED);
  assert.equal(current.searchParams.get('coreSnapshot'), CORE);
  assert.equal(current.searchParams.get('indexSnapshot'), INDEX);
  assert.equal(current.searchParams.get('q'), 'Mechanical');
  for (const snapshot of ['', GRAPH]) {
    const requested = asUrl(capture('/vocab/registry', '?snapshot='+snapshot, {snapshot: SEED}));
    assert.equal(requested.searchParams.get('snapshot'), snapshot);
  }
  const duplicate = asUrl(capture('/vocab/registry', '?snapshot='+SEED+'&snapshot='+SEED, {snapshot: GRAPH}));
  assert.equal(duplicate.searchParams.getAll('snapshot').length, 2);
});

test('a displayed controlled hash cannot be silently replaced by newly available content at save time', async () => {
  const exactView = capture('/vocab/modavis_activity_types/concepts/activitype%3Arepair', '?q=repair', {snapshot: CONTROLLED});
  let requested;
  await assert.rejects(resolve(exactView, undefined, async url => {
    requested = asUrl(url); return {concept, contentSha256: GRAPH};
  }), /snapshot/i);
  assert.equal(requested.searchParams.get('snapshot'), CONTROLLED);
});


test('controlled aliases resolve to canonical exact term links without losing reading context', async () => {
  const calls = [];
  const view = await resolve('/vocab/concepts/MDVS%3AVOCB%3AREPAIR?q=repair%25_&language_code=de&offset=30&limit=15#citation', undefined,
    async (url, signal) => { calls.push({url, signal}); return readControlled(url); });
  const url = asUrl(view.url);
  assert.equal(url.pathname, '/vocab/modavis_activity_types/concepts/activitype%3Arepair');
  assert.equal(url.searchParams.get('q'), 'repair%_'); assert.equal(url.searchParams.get('language_code'), 'de');
  assert.equal(url.searchParams.get('offset'), '30'); assert.equal(url.searchParams.get('limit'), '15');
  assert.equal(url.searchParams.get('snapshot'), CONTROLLED); assert.equal(url.hash, '#citation');
  assert.deepEqual(plain(view.binding), {kind: 'controlled', collection: scheme.code, snapshot: CONTROLLED, collectionTitle: 'Activities', version: scheme.version, resource: concept.code});
  assert.equal(asUrl(calls[0].url).pathname, '/api/vocab/concepts/MDVS%3AVOCB%3AREPAIR');
  assert.equal(asUrl(evidence(view)).searchParams.get('snapshot'), CONTROLLED);
  assert.equal(retain(view).views[0].binding.snapshot, CONTROLLED);
});

test('short public vocabulary term links can be saved with the original citation binding', async () => {
  const view = await resolve('/vocab/activity-types/repair?snapshot='+CONTROLLED, undefined, readControlled);
  assert.equal(asUrl(view.url).pathname, '/vocab/modavis_activity_types/concepts/activitype%3Arepair');
  assert.equal(view.binding.resource, concept.code);
  assert.equal(view.binding.snapshot, CONTROLLED);
});

test('musiXplora bookmarks pin the exact edition and preserve the source key', async () => {
  const path = '/vocab/musixplora/contribution-role/09.08.';
  const view = await resolve(path+'?language=de', undefined, async url => {
    assert.equal(url, '/api'+path+'?language=de');
    return {edition: {id: 'musixplora', contentSha256: GRAPH}, term: {id: '09.08.', labels: {de: 'Konzert', en: 'concert'}}};
  });
  assert.equal(view.title, 'Konzert');
  assert.equal(asUrl(view.url).pathname, path);
  assert.equal(asUrl(view.url).searchParams.get('snapshot'), GRAPH);
  assert.equal(retain(view).views[0].url, view.url);
  assert.equal(view.binding.resource, 'contribution-role/09.08.');
  assert.match(evidence(view), /snapshot=/);
});

test('controlled scheme lists retain the whole-scheme hash and native language/query parameters', async () => {
  const calls = [];
  const view = await resolve('/vocab/MDVS%3AVOCB%3AACTIVITIES?q=repair&language_code=de&offset=15&limit=15', undefined,
    async url => { calls.push(url); return url === '/api/vocab/schemes' ? {items: [scheme]} : {items: [concept], total: 1, offset: 15, limit: 15, contentSha256: CONTROLLED}; });
  assert.equal(asUrl(view.url).pathname, '/vocab/modavis_activity_types');
  assert.equal(asUrl(calls[1]).searchParams.get('language'), 'de');
  assert.equal(asUrl(calls[1]).searchParams.has('language_code'), false);
  assert.equal(view.binding.resource, undefined);
  assert.equal(asUrl(evidence(view)).pathname, '/api/vocab/snapshots/modavis_activity_types');
});

test('a wrong controlled identity, scheme or snapshot is refused rather than canonicalized into another record', async () => {
  await assert.rejects(resolve('/vocab/modavis_activity_types/concepts/activitype%3Arepair', undefined,
    async () => ({concept: {...concept, code: 'activitype:other', mdvsId: 'MDVS:VOCB:OTHER'}, contentSha256: CONTROLLED})), /identity|identifier|requested|record/i);
  await assert.rejects(resolve('/vocab/modavis_activity_types/concepts/activitype%3Arepair', undefined,
    async () => ({concept: {...concept, scheme: {...scheme, code: 'modavis_person_terminology'}}, contentSha256: CONTROLLED})), /record|vocabulary/i);
  await assert.rejects(resolve('/vocab/modavis_activity_types/concepts/activitype%3Arepair?snapshot='+CONTROLLED, undefined,
    async () => ({concept, contentSha256: GRAPH})), /snapshot/i);
});

test('candidate terms retain seed, public-core and research-index pins in both reading and evidence links', async () => {
  const params = new URLSearchParams({concept: candidateId, scheme: candidateScheme, q: 'Mechanical', language: 'en', offset: '4', limit: '2', snapshot: SEED, coreSnapshot: CORE, indexSnapshot: INDEX});
  const calls = [];
  const view = await resolve('/vocab/registry?'+params, undefined, async url => { calls.push(asUrl(url)); return registry; });
  assert.equal(view.title, 'Mechanical action'); assert.equal(view.binding.kind, 'candidate');
  assert.equal(view.binding.snapshot, SEED); assert.equal(view.binding.publicCoreSha256, CORE); assert.equal(view.binding.researchIndexSha256, INDEX);
  assert.equal(view.binding.resource, candidateId);
  const saved = asUrl(view.url), json = asUrl(evidence(view));
  for (const [key, value] of Object.entries({snapshot: SEED, coreSnapshot: CORE, indexSnapshot: INDEX})) {
    assert.equal(saved.searchParams.get(key), value); assert.equal(json.searchParams.get(key), value); assert.equal(calls[0].searchParams.get(key), value);
  }
  for (const key of ['scheme', 'q', 'language', 'offset', 'limit']) assert.equal(saved.searchParams.get(key), params.get(key));
  assert.deepEqual([...calls[0].searchParams.keys()].sort(), ['coreSnapshot', 'indexSnapshot', 'snapshot', 'uri']);
  assert.equal(json.searchParams.get('uri'), candidateId);
  assert.equal(retain(view).views[0].binding.publicCoreSha256, CORE);
});

test('candidate dependency, identity and scheme substitution cannot become a saved view', async () => {
  const query = '/vocab/registry?'+new URLSearchParams({concept: candidateId, scheme: candidateScheme, snapshot: SEED, coreSnapshot: CORE, indexSnapshot: INDEX});
  for (const changed of [{registrySha256: GRAPH}, {publicCoreSha256: GRAPH}, {researchIndexSha256: GRAPH}, {concept: {...candidate, id: candidateId+'-other'}}, {concept: {...candidate, scheme: 'urn:modavis:terminology-seed:windchest'}}])
    await assert.rejects(resolve(query, undefined, async () => ({...registry, ...changed})), /unavailable|identity|scheme|snapshot/i);
});

test('published reference terms retain collection, source URI, graph bytes pin and list context', async () => {
  const params = new URLSearchParams({collection: 'network', uri: publishedUri, q: 'pipe-organ', kind: 'concept', language: 'en', offset: '30', snapshot: GRAPH});
  const calls = [];
  const view = await resolve('/vocab/reference?'+params, undefined, async url => { calls.push(asUrl(url)); return published; });
  assert.equal(view.binding.kind, 'published'); assert.equal(view.binding.collection, 'network'); assert.equal(view.binding.resource, publishedUri);
  assert.equal(asUrl(view.url).searchParams.get('q'), 'pipe-organ'); assert.equal(asUrl(view.url).searchParams.get('offset'), '30');
  assert.deepEqual([...calls[0].searchParams.keys()].sort(), ['language', 'snapshot', 'uri']);
  assert.equal(asUrl(evidence(view)).pathname, '/api/vocab/references/network/concept');
  assert.equal(asUrl(evidence(view)).searchParams.get('uri'), publishedUri);
  assert.equal(retain(view).views[0].binding.snapshot, GRAPH);
});

test('published collection, resource and top-level/source graph pins must all agree', async () => {
  const query = '/vocab/reference?'+new URLSearchParams({collection: 'network', uri: publishedUri, snapshot: GRAPH});
  for (const changed of [{collection: {...published.collection, id: 'vao'}}, {snapshot: CORE}, {collection: {...published.collection, snapshot: CORE}}, {resource: {...published.resource, uri: publishedUri+'-other'}}])
    await assert.rejects(resolve(query, undefined, async () => ({...published, ...changed})), /collection|resource|graph|snapshot|unavailable/i);
});

test('OMARO saves the retained selected-language label and exact reference identity with filtered return context', async () => {
  const params = new URLSearchParams({q: 'Orgel', language: 'de', resolution: 'resolved', offset: '0', uri: omaroUri, snapshot: OMARO});
  const calls = [];
  const view = await resolve('/vocab/omaro?'+params, undefined, async url => { calls.push(asUrl(url)); return asUrl(url).pathname === '/api/omaro' ? omaroMeta : omaroDetail; });
  assert.equal(view.title, 'Orgel'); assert.equal(view.binding.snapshot, OMARO); assert.equal(view.binding.resource, omaroUri);
  assert.equal(asUrl(view.url).searchParams.get('language'), 'de'); assert.equal(asUrl(view.url).searchParams.get('q'), 'Orgel');
  assert.equal(calls.length, 2); assert.equal(calls[0].searchParams.get('snapshot'), OMARO);
  assert.deepEqual([...calls[1].searchParams.keys()].sort(), ['snapshot', 'uri']);
  assert.equal(asUrl(evidence(view)).searchParams.get('uri'), omaroUri);
  assert.equal(retain(view).views[0].binding.kind, 'omaro');
});

test('OMARO metadata, response hash and resource identity are checked independently', async () => {
  const query = '/vocab/omaro?'+new URLSearchParams({uri: omaroUri, snapshot: OMARO});
  for (const changed of [{snapshotSha256: GRAPH}, {concept: {...omaroDetail.concept, uri: omaroUri+'-other'}}])
    await assert.rejects(resolve(query, undefined, async url => asUrl(url).pathname === '/api/omaro' ? omaroMeta : {...omaroDetail, ...changed}), /snapshot|resource/i);
  await assert.rejects(resolve(query, undefined, async () => ({...omaroMeta, snapshotSha256: GRAPH})), /snapshot/i);
});

test('every supported source-wording family preserves the POD pin and exact literal filters', async () => {
  const families = ['activities','stops','divisions','key_action','stop_action','action_system','windchests','wind_system','wind_pressure','accessory','coupler','keyboard','console','case','compound_stop','manual_compass','pedal_compass','manual_total','stop_total','rank_total','pipe_total','pitch_standard','temperament','functional_pipe_position','accessory_summary','coupler_summary','division_summary','manual_summary','source_summary','source_note','stoplist_availability'];
  for (const family of families) {
    const params = new URLSearchParams({term: 'Literal %_', match: 'exact', source: 'fixture', page: '2', section: 'organs', snapshot: CORE});
    const view = await resolve('/vocab/usage/'+family+'?'+params, undefined, async url => {
      assert.equal(asUrl(url).pathname, '/api/vocab/usage/'+family);
      return {family, title: family, publicCoreSha256: CORE};
    });
    assert.equal(view.binding, undefined); assert.equal(asUrl(view.url).searchParams.get('term'), 'Literal %_');
    assert.equal(asUrl(view.url).searchParams.get('snapshot'), CORE); assert.equal(asUrl(view.url).searchParams.get('source'), 'fixture');
    assert.equal(retain(view).views.length, 1);
  }
});

test('source-wording responses cannot silently come from another family or snapshot', async () => {
  await assert.rejects(resolve('/vocab/usage/key_action?term=Mechanical', undefined,
    async () => ({family: 'stop_action', title: 'Stop action', publicCoreSha256: CORE})), /family|field|collection/i);
  await assert.rejects(resolve('/vocab/usage/key_action?term=Mechanical&snapshot='+CORE, undefined,
    async () => ({family: 'key_action', title: 'Key action', publicCoreSha256: GRAPH})), /snapshot/i);
});

test('schema categories stay POD-scoped and never acquire a controlled snapshot', async () => {
  const category = {code: 'person', preferredLabel: 'Person', recordKind: 'schema_category', scheme: {code: 'modavis_entity_types', name: 'Public entity types', version: '1.6.0'}};
  const view = await resolve('/vocab/concepts/person?q=person', undefined, async () => ({concept: category, contentSha256: null}));
  assert.equal(asUrl(view.url).pathname, '/vocab/modavis_entity_types/concepts/person');
  assert.equal(view.binding, undefined); assert.equal(asUrl(view.url).searchParams.has('snapshot'), false);
  assert.equal(evidence(view), undefined); assert.equal(retain(view).views.length, 1);
  await assert.rejects(resolve('/vocab/concepts/person?snapshot='+CONTROLLED, undefined, async () => ({concept: category, contentSha256: null})), /snapshot/i);
});

test('malformed, repeated, unsafe or unsupported links fail without a fallback request', async () => {
  for (const link of ['/vocab/registry?snapshot=', '/vocab/registry?snapshot='+SEED+'&snapshot='+SEED, '/vocab/registry?coreSnapshot=', '/vocab/reference?collection=network&collection=vao', '/vocab/omaro?uri=', '/vocab/omaro?offset=-1', '/vocab?sourceFamliy=key_action', '/vocab?q=one&q=two', 'https://other.example/vocab/reference', '/admin']) {
    let calls = 0;
    await assert.rejects(resolve(link, undefined, async () => { calls++; throw new Error('Unexpected fallback'); }));
    assert.equal(calls, 0, link);
  }
});

test('stale backend refusal is propagated without fetching an available replacement', async () => {
  let calls = 0;
  await assert.rejects(resolve('/vocab/registry?snapshot='+SEED, undefined, async () => { calls++; throw new Error('Requested snapshot is unavailable'); }), /unavailable/);
  assert.equal(calls, 1);
});

test('cancellation before or during reads cannot produce a captured vocabulary view', async () => {
  const initial = new AbortController(); initial.abort(); let calls = 0;
  await assert.rejects(resolve('/vocab/reference', initial.signal, async () => { calls++; return published; }), error => error.name === 'AbortError');
  assert.equal(calls, 0);
  const active = new AbortController();
  await assert.rejects(resolve('/vocab/reference', active.signal, async (_url, signal) => { assert.equal(signal, active.signal); active.abort(); return published; }), error => error.name === 'AbortError');
});
