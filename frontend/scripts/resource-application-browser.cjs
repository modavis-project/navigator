const {chromium, firefox} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const base = process.env.NAVIGATOR_BROWSER_URL;
  const out = process.env.NAVIGATOR_BROWSER_OUTPUT;
  const release = process.env.NAVIGATOR_BROWSER_RELEASE || 'candidate';
  assert(base && out, 'Set NAVIGATOR_BROWSER_URL and NAVIGATOR_BROWSER_OUTPUT');
  fs.mkdirSync(out, {recursive: true});
  const results = [];
  for (const [name, engine, width] of [['chromium', chromium, 1280], ['firefox', firefox, 390]]) {
    const browser = await engine.launch({headless: true});
    try {
      const context = await browser.newContext({viewport: {width, height: 950}});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      const checks = [];
      const visit = async (route, text) => {
        await page.goto(base + route);
        await page.getByText(text, {exact: true}).first().waitFor({timeout: 40000});
      };
      await visit('/organs', 'Pipe organ catalog');
      await page.locator('a[href^="/organs/"]').first().waitFor();
      const catalog = page.url();
      await page.locator('a[href^="/organs/"]').first().click();
      await page.getByText('Back to catalog', {exact: true}).waitFor();
      await page.goBack();
      assert.equal(page.url(), catalog);
      await page.locator('a[href^="/organs/"]').first().waitFor();
      checks.push('Browser back restores catalog');
      await visit('/organs/7D4D-ZS69-9', 'Back to catalog');
      await page.locator('button').filter({hasText: /^History$/}).click();
      await page.getByText('Chronological history', {exact: true}).waitFor();
      await page.locator('button').filter({hasText: /^Specification$/}).click();
      await page.getByText('Specification details', {exact: true}).waitFor();
      assert((await page.locator('body').innerText()).length > 1000);
      await page.screenshot({path: path.join(out, `${name}-specification.png`)});
      checks.push('History to specification stays rendered');
      await visit('/organs/7D4D-ZS69-9?tab=media', 'Open source record');
      assert((await page.locator('body').innerText()).toLowerCase().includes('source: orgbase'));
      await page.screenshot({path: path.join(out, `${name}-media.png`)});
      checks.push('Orgbase media with source attribution');
      for (const [kind, token] of [['organs','XGS9-X59F-F'], ['places','000G-D4B2-2'],
          ['people','V1QR-ZQ2C-C'], ['organizations','814V-CEXC-C'], ['names','000D-RB87-7'],
          ['virtual-instruments','00C9-5984-4']]) {
        await visit(`/${kind}/${token}?tab=export`, 'Europeana Data Model');
        const links = page.locator('a').filter({hasText: /JSON-LD/});
        await links.first().waitFor();
        assert(await links.count());
        const href = await links.first().getAttribute('href');
        assert(href.includes('/dataset/'));
        const response = await context.request.get(new URL(href, base).href);
        assert.equal(response.status(), 200);
        assert(response.headers()['content-type'].startsWith('application/ld+json'));
        assert((await response.text()).includes(token));
        await response.dispose();
        checks.push(`${kind}: Export tab and RDF download`);
      }
      const graph = await fetch(`${base}/dataset/pod/version/${release}/entity/XGS9-X59F-F.modavis.jsonld`).then(r => r.json());
      const uri = graph['@graph'].find(row => row['@id'].includes('/resource/assertion/') && row['modassert:rawValue'] === 'Bach-Kellner')['@id'];
      const directCanary = process.env.NAVIGATOR_BROWSER_DIRECT_RESOURCE === '1';
      await page.goto(directCanary
        ? base + '/organs/XGS9-X59F-F?tab=export&resource=' + encodeURIComponent(uri)
        : base + '/resolve' + new URL(uri).pathname.replace('/modavis', ''));
      await page.getByRole('heading', {name: 'Sources and provenance', exact: true}).waitFor();
      assert.equal(await page.locator('.resource-format-links a').count(), 4);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({path: path.join(out, `${name}-resource.png`)});
      await page.getByRole('button', {name: 'Close resource description', exact: true}).click();
      await page.locator('#entity-export-heading:focus').waitFor();
      await page.goBack();
      await page.getByRole('heading', {name: 'Sources and provenance', exact: true}).waitFor();
      checks.push((directCanary ? 'Direct canary resource selection' : 'Resolver redirect') + ', resource provenance, formats, close focus and browser back');
      assert.deepEqual(errors, []);
      results.push({browser: name, version: browser.version(), viewportWidth: width, checks, pageErrors: errors});
    } finally { await browser.close(); }
  }
  const receipt = {status: 'passed', release, scope: 'Full application at the supplied base URL. Narrow Firefox viewport; no physical phone.', baseUrl: base, directCanaryResource: process.env.NAVIGATOR_BROWSER_DIRECT_RESOURCE === '1', browsers: results};
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
})().catch(error => {console.error(error); process.exit(1);});
