// Exercise the public UI against its API, including URL restoration and pagination.
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.BASE_URL;
const out = process.env.OUTPUT;
if (!base || !out) throw Error('BASE_URL and a separate OUTPUT directory are required');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const results = [];
  try {
    for (const [name, engine, width] of [['chromium', chromium, 1280], ['firefox', firefox, 390]]) {
      const browser = await engine.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width, height: 950 } });
        page.setDefaultTimeout(15000);
        const errors = [], checks = [];
        page.on('pageerror', e => errors.push(String(e)));
        const select = label => page.locator('label').filter({ has: page.getByText(label, { exact: true }) }).locator('select');
        async function matches(query, label) {
          const qs = new URLSearchParams({ limit: '12', offset: '0', independently_distributed: 'yes', ...query });
          const response = await page.request.get(base + '/api/virtual-instruments?' + qs);
          assert.equal(response.status(), 200);
          const expected = await response.json();
          await page.waitForFunction(total => document.querySelector('.vpi-result-head strong')?.textContent === `${total.toLocaleString('en')} virtual instrument${total === 1 ? '' : 's'}`, expected.total);
          const hrefs = expected.items.map(i => i.canonicalUrl || '/virtual-instruments/' + encodeURIComponent(i.id));
          await page.waitForFunction(expected => JSON.stringify(Array.from(document.querySelectorAll('.vpi-card-main'), a => a.getAttribute('href'))) === JSON.stringify(expected), hrefs);
          checks.push({ label, total: expected.total, query: Object.fromEntries(qs), ids: expected.items.map(i => i.id) });
          return expected;
        }
        await page.goto(base + '/virtual-instruments');
        const all = await matches({}, 'initial catalogue');
        await select('Organ relationship').selectOption('linked');
        const linked = await matches({ organ_link: 'linked' }, 'linked dropdown');
        assert(linked.total > 0 && linked.total < all.total);
        assert(linked.items.every(i => i.relationships.organDecision.targets.length));
        const linkedUrl = page.url();
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await matches({ organ_link: 'linked', offset: '12' }, 'filtered next page');
        await page.goBack();
        await matches({ organ_link: 'linked' }, 'browser Back restores first page');
        await page.goForward();
        await matches({ organ_link: 'linked', offset: '12' }, 'browser Forward restores next page');
        await select('Organ relationship').selectOption('unlinked');
        const unlinked = await matches({ organ_link: 'unlinked' }, 'unlinked dropdown resets offset');
        assert.equal(linked.total + unlinked.total, all.total);
        assert(unlinked.items.every(i => !i.relationships.organDecision.targets.length));
        await page.goto(linkedUrl);
        await matches({ organ_link: 'linked' }, 'shared URL');
        await page.reload();
        await matches({ organ_link: 'linked' }, 'reload');
        for (const [label, key, facet, valueKey] of [
          ['Producer', 'producer', 'producers', 'producer'], ['Platform', 'platform', 'platforms', 'platform'],
          ['Access', 'access', 'accessCategories', 'value'], ['Country', 'country', 'countries', 'country'],
          ['Granularity', 'granularity', 'granularities', 'value'],
        ]) {
          await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
          await matches({}, 'reset before ' + label);
          const value = String((all.facets[facet].find(f => f.count < all.total) || all.facets[facet][0])[valueKey]);
          await select(label).selectOption(value);
          await matches({ [key]: value }, label + ' dropdown');
        }
        await page.goto(linkedUrl);
        await matches({ organ_link: 'linked' }, 'combined filter baseline');
        const country = linked.facets.countries[0].country;
        await select('Country').selectOption(country);
        await matches({ organ_link: 'linked', country }, 'relationship and country intersect');
        await page.getByRole('textbox', { name: 'Search virtual instruments', exact: true }).fill('no-matching-vmi-filter-regression-928371');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        const empty = await matches({ organ_link: 'linked', country, q: 'no-matching-vmi-filter-regression-928371' }, 'empty intersection');
        assert.equal(empty.total, 0);
        await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
        await matches({}, 'reset empty results');
        await page.goto(linkedUrl + '&confidence_tier=probable&match_method=private');
        await matches({ organ_link: 'linked' }, 'legacy investigation fields remain excluded');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: out + '/' + name + '.png' });
        assert.deepEqual(errors, []);
        results.push({ browser: name, width, checks, pageErrors: errors });
      } finally { await browser.close(); }
    }
    fs.writeFileSync(out + '/browser.json', JSON.stringify({ status: 'passed', results }, null, 2) + '\n');
    console.log('PUBLIC VMI FILTERS PASSED');
  } catch (error) {
    fs.writeFileSync(out + '/browser.json', JSON.stringify({ status: 'failed', error: String(error), results }, null, 2) + '\n');
    throw error;
  }
})().catch(e => { console.error(e); process.exit(1); });
