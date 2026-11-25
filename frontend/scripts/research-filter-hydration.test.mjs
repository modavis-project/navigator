import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import {testUiLocale} from './ui-locale-test-support.mjs';

// Render the actual form before and after its asynchronous facets are available.
// Browser acceptance separately verifies preservation of uncontrolled draft edits.
const source = readFileSync(new URL('../src/researchFilters.tsx', import.meta.url), 'utf8');
const labels = {exports: {}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/workbenchLabels.ts', import.meta.url), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS},
}).outputText, labels);
const load = createRequire(import.meta.url);
let locale = 'en';
const context = {exports: {}, require: id => id === './uiLocale' ? {useUiLocale: () => testUiLocale(locale)} : id === './workbenchLabels' ? labels.exports : load(id)};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, context);

function render(query, facets) {
  return renderToStaticMarkup(createElement(context.exports.ResearchFilters, {
    params: new URLSearchParams(query), mode: 'selection', facets, onSubmit: () => {},
  }));
}

function options(html, name) {
  const select = html.match(new RegExp(`<select name="${name}"[^>]*>([\\s\\S]*?)</select>`));
  assert(select, `Missing ${name} select`);
  return [...select[1].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)].map(([, attributes]) => ({
    value: attributes.match(/value="([^"]*)"/)?.[1], selected: /\bselected(?:=|\s|$)/.test(attributes),
  }));
}

const query = 'section=configurations&organ=EXAMPLE&source=orgbase&date=year&coverage=structured_stops';
const expected = { source: 'orgbase', date: 'year', coverage: 'structured_stops' };

test('pinned source, date and coverage are selected before any facets arrive', () => {
  const html = render(query, undefined);
  for (const [name, value] of Object.entries(expected)) {
    assert.deepEqual(options(html, name).filter(option => option.selected), [{ value, selected: true }]);
    assert.equal(options(html, name).filter(option => option.value === value).length, 1);
  }
});

test('populated facets retain each pinned selection without duplicating its option', () => {
  const html = render(query, {
    sources: ['orgelsachsen', 'orgbase'], dateKinds: ['exact', 'year'],
    coverage: ['partial', 'structured_stops'],
  });
  for (const [name, value] of Object.entries(expected)) {
    assert.deepEqual(options(html, name).filter(option => option.selected), [{ value, selected: true }]);
    assert.equal(options(html, name).filter(option => option.value === value).length, 1);
    assert.equal(options(html, name).length, 3);
  }
});

test('a URL value absent from the supplied facets is retained for explicit validation', () => {
  const html = render(query, { sources: ['other'], dateKinds: ['exact'], coverage: ['partial'] });
  for (const [name, value] of Object.entries(expected)) {
    assert.deepEqual(options(html, name).filter(option => option.selected), [{ value, selected: true }]);
  }
});

test('unfiltered links select the empty option while facets are pending or populated', () => {
  for (const facets of [undefined, { sources: ['orgbase'], dateKinds: ['year'], coverage: ['partial'] }]) {
    const html = render('section=configurations&organ=EXAMPLE', facets);
    for (const name of Object.keys(expected)) {
      assert.deepEqual(options(html, name).filter(option => option.selected), [{ value: '', selected: true }]);
    }
  }
});


test('organ selections expose only applicable filters', () => {
 const html = render('section=organs&q=Chapel', undefined);
 for (const name of ['actor','other','organ','q','source']) assert.match(html, new RegExp('name="'+name+'"'));
 for (const name of ['from','to','date','identity','activity','role','coverage']) assert.doesNotMatch(html, new RegExp('name="'+name+'"'));
});

test('configuration accounts expose coverage and dating without event-only operands', () => {
 const html = render('section=configurations&organ=EXAMPLE', undefined);
 for (const name of ['coverage','date','from','to']) assert.match(html, new RegExp('name="'+name+'"'));
 for (const name of ['other','identity','activity','role']) assert.doesNotMatch(html, new RegExp('name="'+name+'"'));
});

test('German filter labels preserve stable submitted operands', () => {
  locale = 'de';
  try {
    const html = render(query, undefined);
    assert.match(html, /Dispositionsbeschreibungen/);
    assert.match(html, /Register strukturiert erfasst/);
    for (const [name, value] of Object.entries(expected)) {
      assert.deepEqual(options(html, name).filter(option => option.selected), [{value, selected: true}]);
    }
  } finally {
    locale = 'en';
  }
});
