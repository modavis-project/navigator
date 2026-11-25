import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {GERMAN_REVIEW_MODE, elideGermanPreviewCopy, germanPreviewCopyPlugin} from '../germanPreviewCopy.mjs';
import {testUiLocale} from './ui-locale-test-support.mjs';

test('English-only builds inline plain UI messages and keep formatter inputs and source data', () => {
  const code = `
    import {useUiLocale} from './uiLocale';
    function example() {
      const {t} = useUiLocale();
      const rawName = 'Gedackt';
      const plain = t('fixture.plain', 'Plain English', 'Deutscher Text');
      const formatted = t('fixture.format', 'Evidence for {name}', 'Beleg zu {name}', {name: rawName});
      const escaped = t('fixture.escaped', "'{'", "'}'");
      const rich = t('fixture.rich', '<strong>Title</strong>', '<strong>Titel</strong>');
      const dynamic = t(buildKey(), 'Plain wording', 'Deutscher Wortlaut');
      const shadow = (t) => t('other', 'English evidence', 'German source value');
      function shadowLocal() { const t = evidence; return t('other', 'English', 'German evidence'); }
      return <span data-source="Originale Quelle">{plain}{formatted}</span>;
    }
  `;
  const result = elideGermanPreviewCopy(code, 'Example.tsx');
  assert.match(result, /const plain = 'Plain English';/);
  assert.match(result, /t\('fixture\.format', 'Evidence for \{name\}', "", \{name: rawName\}\)/);
  assert.match(result, /t\('fixture\.escaped', "'\{'", ""\)/);
  assert.match(result, /t\('fixture\.rich', '<strong>Title<\/strong>', ""\)/);
  assert.match(result, /t\(buildKey\(\), 'Plain wording', ""\)/);
  assert.match(result, /'German source value'/);
  assert.match(result, /'German evidence'/);
  assert.match(result, /data-source="Originale Quelle"/);
  assert.match(result, /'Gedackt'/);
  assert.equal(elideGermanPreviewCopy(code.replace('./uiLocale', './someOtherLocale'), 'Example.tsx'), null);
});

test('catalogue rules remove only the explicitly recognized German slots', () => {
  const code = `
    import {useUiLocale} from './uiLocale';
    const REST_EXAMPLES = [{id: 'orgel', label: ['Organ', 'Orgel'], path: '/organs/ORGEL',
      description: ['Documented evidence', 'Dokumentierte Belege'], value: 'St.-Johannis-Orgel'}] as const;
    const raw = {de: 'Schreibweise aus der Quelle'};
  `;
  const result = elideGermanPreviewCopy(code, 'publicApiGuide.tsx');
  assert.match(result, /\['Organ', " "\]/);
  assert.match(result, /\['Documented evidence', " "\]/);
  assert.match(result, /id: 'orgel'/);
  assert.match(result, /path: '\/organs\/ORGEL'/);
  assert.match(result, /value: 'St\.-Johannis-Orgel'/);
  assert.match(result, /de: 'Schreibweise aus der Quelle'/);
  assert.equal(elideGermanPreviewCopy(code, 'SourceRecords.tsx'), null);
});

test('the production FAQ keeps English items, optional links and their identifiers', () => {
  const code = readFileSync(new URL('../src/pageFaqContent.ts', import.meta.url), 'utf8');
  function load(source) {
    const context = {exports: {}};
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
    }).outputText, context);
    return context.exports;
  }
  const original = load(code);
  const strippedCode = elideGermanPreviewCopy(code, 'pageFaqContent.ts');
  assert.ok(strippedCode.length < code.length);
  const stripped = load(strippedCode);
  const {t} = testUiLocale();
  for (const pathname of ['/', '/organs/EXAMPLE', '/temperaments', '/vocab', '/use-cases/research-workbench']) {
    const result = mod => JSON.stringify(mod.localizePageFaq(mod.pageFaq(pathname), t));
    assert.equal(result(stripped), result(original), pathname);
  }
});

test('only the English-only build transforms frontend source', () => {
  const frontend = fileURLToPath(new URL('../', import.meta.url));
  const plugin = germanPreviewCopyPlugin(frontend);
  const code = `import {useUiLocale} from './uiLocale'; const {t} = useUiLocale(); t('fixture.text','English','Deutsch');`;
  assert.equal(plugin.config({}, {command: 'build', mode: 'production'}), undefined);
  assert.match(plugin.transform(code, `${frontend}src/Fixture.tsx`), /'English';/);
  assert.equal(plugin.transform(code, `${frontend}public/source.tsx`), null);
  assert.deepEqual(plugin.config({}, {command: 'build', mode: GERMAN_REVIEW_MODE}), {build: {outDir: '.runtime/german-review'}});
  assert.equal(plugin.transform(code, `${frontend}src/Fixture.tsx`), null);
  assert.equal(plugin.config({build: {outDir: '/explicit/review'}}, {command: 'build', mode: GERMAN_REVIEW_MODE}), undefined);
  assert.equal(plugin.config({}, {command: 'serve', mode: 'development'}), undefined);
  assert.equal(plugin.transform(code, `${frontend}src/Fixture.tsx`), null);
});

test('Vite configuration can be spread by a local preview wrapper', async () => {
  const {default: config} = await import('../vite.config.ts');
  const wrapper = {...config};
  assert.ok(wrapper.server.proxy['/api']);
  assert.ok(wrapper.plugins.some(plugin => plugin.name === 'modavis-elide-german-preview-copy'));
});
