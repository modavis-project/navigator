const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE);
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=process.env.BASE_URL,out=process.env.OUTPUT,baselinePath=process.env.BASELINE;
if(!base||!out)throw Error('BASE_URL and a separate OUTPUT directory are required');fs.mkdirSync(out,{recursive:true});
const baseline=baselinePath?JSON.parse(fs.readFileSync(baselinePath,'utf8')):null;
const capture=process.env.CAPTURE_BASELINE==='1';
const routes=[
 ['omaro-bindings','/vocab/omaro','.om-results article'],
 ['terminology','/use-cases/research-workbench?view=terms&mode=manual_total&source=aeolianskinner','.wb-table tbody tr'],
 ['attribution','/use-cases/research-workbench?view=occurrences','.wb-occurrence'],
 ['specification','/organs/RJ8E-DDN6-6?tab=specification','pre'],
 ['builder','/use-cases/builder-workshop-networks?actor=2XGF-VWKZ-Z','.research-section-buttons'],
];
(async()=>{const results=[];try{for(const [browserName,engine,width]of(capture?[['chromium',chromium,1280]]:[['chromium',chromium,1280],['firefox',firefox,390]])){
 const browser=await engine.launch({headless:true});try{const page=await browser.newPage({viewport:{width,height:950}});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.__copiedJson='';window.__denyCopy=false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.__denyCopy)throw Error('Clipboard unavailable');window.__copiedJson=value;}}});});
 for(const [name,path,ready]of routes){await page.goto(base+path);await page.locator(ready).first().waitFor({state:name==='specification'?'attached':'visible'});
 if(name==='builder'){await page.getByRole('button',{name:'Instruments and evidence',exact:true}).click();await page.locator('.research-results pre').first().waitFor({state:'attached'});}
 await page.locator('pre').first().waitFor({state:'attached'});
 const payloads=await page.locator('pre').evaluateAll(els=>els.slice(0,16).map(el=>el.textContent));
 assert(payloads.length>0);payloads.forEach(text=>JSON.parse(text));
 const hashes=payloads.map(text=>crypto.createHash('sha256').update(text).digest('hex'));
 if(baseline){const prior=baseline.results.find(r=>r.name===name);assert(prior,`${name}: missing baseline`);assert.deepEqual([...hashes].sort(),[...prior.hashes].sort(),`${name}: displayed payload changed`);}
 await page.evaluate(()=>{let el=document.querySelector('pre').parentElement;while(el){if(el.tagName==='DETAILS')el.open=true;el=el.parentElement;}});
 const pre=page.locator('pre').first();await pre.scrollIntoViewIfNeeded();
 const appearance=await pre.evaluate(el=>{const s=getComputedStyle(el),rgb=x=>x.match(/[\d.]+/g).slice(0,3).map(Number),lum=x=>x.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const c=lum(rgb(s.color)),b=lum(rgb(s.backgroundColor));return {contrast:(Math.max(c,b)+.05)/(Math.min(c,b)+.05),color:s.color,background:s.backgroundColor,visibleCharacters:el.innerText.length,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,width:el.clientWidth,fontSize:s.fontSize};});
 assert.equal(appearance.visibleCharacters,payloads[0].length);
 if(!capture){assert(appearance.contrast>=7,`${name}: JSON contrast ${appearance.contrast}`);assert(appearance.clientHeight>30&&appearance.width>150);assert.equal(await pre.getAttribute('tabindex'),'0');
 const block=pre.locator('..');
 await block.getByRole('button',{name:/^Copy .* as JSON$/}).click();assert.equal(await page.evaluate(()=>window.__copiedJson),payloads[0]);await block.getByRole('status').getByText('JSON copied.',{exact:true}).waitFor();
 if(appearance.scrollHeight>appearance.clientHeight+10){await pre.focus();await page.keyboard.press('End');await page.waitForFunction(el=>el.scrollTop>0,await pre.elementHandle());}
 await page.evaluate(()=>{window.__denyCopy=true;});await block.getByRole('button',{name:/^Copy .* as JSON$/}).click();assert.equal(await page.evaluate(()=>window.getSelection().toString()),payloads[0]);assert.equal(await pre.evaluate(el=>el===document.activeElement),true);await page.evaluate(()=>{window.__denyCopy=false;window.getSelection().removeAllRanges();});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name}: document overflow`);
 }
 await pre.evaluate(el=>el.scrollTop=0);await page.screenshot({path:`${out}/${name}-${browserName}.png`});
 results.push({name,browser:browserName,width,hashes,appearance,copyAndKeyboardVerified:!capture,pageErrors:[...errors]});assert.deepEqual(errors,[]);console.log(name,browserName,appearance.contrast.toFixed(2));
 }
 }finally{await browser.close();}}
 fs.writeFileSync(out+'/browser.json',JSON.stringify({status:'passed',mode:capture?'baseline':'verification',base,results},null,2)+'\n');
 }catch(error){fs.writeFileSync(out+'/browser.json',JSON.stringify({status:'failed',error:String(error),results},null,2)+'\n');throw error;}
})().catch(e=>{console.error(e);process.exit(1)});
