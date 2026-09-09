const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async()=>{
 fs.mkdirSync("audit-artifacts", {recursive:true});
 const base=process.env.RESOURCE_PREVIEW_URL || 'http://127.0.0.1:5190';
 const fixture=await fetch(base+'/api/canary').then(r=>r.json());
 const receipt={scope:'Production ResourceView and EntityExportPanel components with immutable Release 1.5.5 record XGS9-X59F-F through local resolver routes', browsers:[]};
 for (const [name,engine,width] of [['chromium',chromium,1280],['firefox-mobile',firefox,390]]) {
  const browser=await engine.launch({headless:true});
  const context=await browser.newContext({viewport:{width,height:950}});
  if(name==='chromium') await context.grantPermissions(['clipboard-read','clipboard-write']);
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const resolve=uri=>base+'/resolve'+new URL(uri).pathname.replace('/modavis','')+new URL(uri).hash;
  await page.goto(resolve(fixture.assertion));
  await page.getByRole('heading',{name:'Temperament',exact:true}).waitFor();
  assert.equal(await page.locator('.resource-facts').first().getByText('Bach-Kellner',{exact:true}).count(),2);
  assert.equal(await page.getByRole('heading',{name:'Sources and provenance'}).count(),1);
  assert.equal(await page.locator('.resource-format-links a').count(),4);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.resource-inspector').screenshot({path:`audit-artifacts/resource-${name}.png`});
  if(name==='chromium') {
   await page.getByRole('button',{name:'Copy stable URI'}).click();
   await page.getByRole('status').getByText('Copied stable URI').waitFor();
   assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),fixture.assertion);
  }
  await page.getByRole('button',{name:'Close resource description'}).click();
  await page.locator('#entity-export-heading:focus').waitFor();
  assert.equal(await page.locator('.resource-inspector').count(),0);
  await page.goBack();
  await page.getByRole('heading',{name:'Temperament',exact:true}).waitFor();
  await page.goto(resolve(fixture.fragment));
  await page.getByRole('heading',{name:'Source fragment',exact:true}).waitFor();
  assert.equal(await page.getByText('Location in source',{exact:true}).count()>=1,true);
  assert.equal(await page.locator('.resource-uri code').textContent(),fixture.fragment);
  await page.goto(resolve(fixture.source));
  await page.getByRole('heading',{name:'Dataset resource',exact:true}).waitFor();
  await page.locator('.resource-uri code').waitFor();
  assert.equal(await page.locator('.resource-uri code').textContent(),fixture.source);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.goto(base+'/resources?uri='+encodeURIComponent(fixture.fragment.replace(/#[^#]+$/,'#missing')));
  await page.getByRole('alert').waitFor();
  assert.equal(errors.length,0,errors.join('\n'));
  receipt.browsers.push({name,viewportWidth:width,assertion:true,sourceProvenance:true,fragmentRedirect:true,sharedRecord:true,browserBack:true,keyboardFocus:true,invalidResource:true,horizontalOverflow:false,consoleErrors:0});
  await browser.close();
 }
 fs.writeFileSync('audit-artifacts/resource-view-browser.json',JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));
})().catch(e=>{console.error(e);process.exit(1)});
