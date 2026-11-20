// Render the actual panel with controlled findings. Never contacts Firebase or AI.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {featureFixture} from './feature-review-fixture.mjs';
import {returnedFindings} from './visual-finding-quality-fixture.mjs';
import {visualReviewParagraph,REVIEW_FAILED,REVIEW_WITHHELD} from '../shared/visual-review-paragraph.mjs';
import {ANOMALY_REVIEW_VERSION} from '../shared/feature-review-contract.mjs';

const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import Panel from '/src/components/common/LocalizationPanel.jsx';
import '/src/index.css';
const root=createRoot(document.getElementById('root'));
window.renderScan=scan=>root.render(<main className="mx-auto max-w-3xl p-4"><Panel key={scan.scan_id} scan={scan}/></main>);`;
const server=await createServer({plugins:[{name:'anomaly-preview',
  resolveId:id=>id==='/__anomaly-entry.jsx'?id:null,
  load:id=>id==='/__anomaly-entry.jsx'?entry:null,
  configureServer(server){server.middlewares.use((req,res,next)=>{
    if(req.url!=='/__anomaly-preview')return next();
    res.setHeader('Content-Type','text/html');
    server.transformIndexHtml('/__anomaly-preview','<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__anomaly-entry.jsx"></script></body></html>').then(html=>res.end(html)).catch(next);
  });}
}],server:{host:'127.0.0.1',port:0,open:false,proxy:{}}});
let browser;
try{
  await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors=[],blocked=[];
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin||url.pathname.startsWith('/api/')){blocked.push(url.pathname);return route.abort();}
    if(url.pathname==='/src/services/firebase-api.js')return route.fulfill({contentType:'application/javascript',body:`
      const image=()=>new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>'],{type:'image/svg+xml'});
      export async function fetchScanImage(){if(window.failOriginal)throw Error('unavailable');return image();}
      export async function fetchLocalizationImage(){if(window.failHighlight)throw Error('unavailable');return window.badDecode?new Blob(['broken'],{type:'image/png'}):image();}
    `});
    return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/__anomaly-preview');await page.waitForFunction(()=>!!window.renderScan);
  const contract=await import('../shared/localization-contract.mjs');
  const localization={schema_version:1,status:'available',model_version:contract.MESORCH_LOCALIZER_MODEL,
    scope:contract.MESORCH_SCOPE,coordinate_space:'normalized_upright_rgb',checkpoint_sha256:contract.MESORCH_CHECKPOINT_SHA,
    validation_status:contract.MESORCH_VALIDATION_STATUS,input_sha256:'a'.repeat(64),threshold:.5,
    image_width:20,image_height:20,highlighted_pixels:1,highlighted_fraction:1/400,
    reason:null,mask_asset:contract.MESORCH_MASK_ASSET,mask_sha256:'b'.repeat(64)};
  let id=0;
  async function render(){await page.evaluate(scan=>window.renderScan(scan),{scan_id:'preview-'+(++id),status:'completed',analysis:{verdict:'ai_generated'},localization});}
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>{window.failOriginal=false;window.failHighlight=true;window.badDecode=false;});
    await render();
    await page.getByRole('img',{name:'Original image',exact:true}).waitFor();
    await page.getByText('Model highlights could not be loaded.',{exact:true}).waitFor();
    await page.evaluate(()=>window.failHighlight=false);
    await page.getByRole('button',{name:'Retry images',exact:true}).click();
    await page.getByRole('img',{name:'Model highlights',exact:true}).waitFor();
    await page.evaluate(()=>{window.failOriginal=true;});await render();
    await page.getByRole('img',{name:'Model highlights',exact:true}).waitFor();
    await page.getByText('Original image could not be loaded.',{exact:true}).waitFor();
    await page.evaluate(()=>{window.failOriginal=false;window.badDecode=true;});await render();
    await page.getByText('Model highlights could not be loaded.',{exact:true}).waitFor();
    await page.getByRole('img',{name:'Original image',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log('PASS: original/highlight failures independent, retry recovers, decode failures handled, desktop/mobile fit.');
}finally{if(browser)await browser.close();await server.close();}
