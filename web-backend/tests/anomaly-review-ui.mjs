// Render the actual panel with controlled findings. Never contacts Firebase or AI.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {featureFixture} from './feature-review-fixture.mjs';
import {returnedFindings} from './visual-finding-quality-fixture.mjs';
import {graphicEyeFinding,graphicScene,fourPortraitScene} from './graphic-review-fixture.mjs';
import {visualReviewParagraph,REVIEW_FAILED,REVIEW_WITHHELD,REVIEW_UNCERTAIN} from '../shared/visual-review-paragraph.mjs';
import {ANOMALY_REVIEW_VERSION,normalizeFeatureReview} from '../shared/feature-review-contract.mjs';

const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import Panel from '/src/components/common/SceneExplanationPanel.jsx';
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
    if(url.pathname==='/src/services/firebase-api.js')return route.fulfill({contentType:'application/javascript',body:`export async function reviewScanFeatures(){window.__checks=(window.__checks||0)+1;if(window.__failure)throw Error('Visual review unavailable.');return {data:window.__reviewResponse};}`});
    return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/__anomaly-preview');await page.waitForFunction(()=>!!window.renderScan);
  const base=featureFixture();
  const review={...base,anomaly_review_version:ANOMALY_REVIEW_VERSION,findings:base.findings.map(f=>({...f,status:'no_clear_concern',observation:'No clear inconsistency reported.',location:'',reason:''}))};
  review.findings[1]={category:'shape',status:'possible_concern',observation:'Several fingertips merge together along the edge of the hand.',location:'Hand at the lower left',reason:'Separate finger boundaries disappear while the rest of the hand remains sharply outlined.'};
  let id=0;
  const scan=(verdict,feature_review)=>({scan_id:'fixture-'+(++id),status:'completed',analysis:{verdict,authentic_score:.2,ai_generated_score:.8,decision_rule:'manuscript_min_score_v1',minimum_class_score:.6},feature_review,upload_review:{features:'completed'}});
  async function render(value){await page.evaluate(value=>window.renderScan(value),value);}
  await mkdir('.test-results/anomaly-review',{recursive:true});
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    await render(scan('authentic',review));
    await page.getByTestId('visual-review-paragraph').filter({hasText:review.findings[1].observation}).waitFor();
    assert.equal(await page.getByTestId('visual-review-state').textContent(),'Possible unusual details');
    await page.getByTestId('visual-review-paragraph').filter({hasText:review.findings[1].observation}).waitFor();
    assert.equal(await page.evaluate(()=>window.__checks||0),0);
    await render(scan('ai_generated',review));
    assert.equal(await page.getByTestId('visual-review-paragraph').textContent(),visualReviewParagraph(review));
    assert.equal(await page.getByText('Why it stands out',{exact:true}).count(),0);
    assert.equal(await page.getByRole('heading',{name:'Image description',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:'.test-results/anomaly-review/concern-'+width+'.png',fullPage:true});
    const misleading={...review,findings:review.findings.map(f=>({...f,status:'no_clear_concern',location:'',reason:''}))};
    for(const finding of returnedFindings)misleading.findings[misleading.findings.findIndex(f=>f.category===finding.category)]=finding;
    await render(scan('authentic',misleading));
    await page.getByText(REVIEW_WITHHELD,{exact:true}).waitFor();
    assert.equal(await page.getByTestId('visual-review-state').textContent(),'Review uncertain');
    assert.equal(await page.getByTestId('visual-review-paragraph').textContent(),REVIEW_WITHHELD);
    for(const finding of returnedFindings)assert.equal(await page.getByText(finding.observation,{exact:true}).count(),0);
    await page.screenshot({path:'.test-results/anomaly-review/filtered-'+width+'.png',fullPage:true});
    const clean={...review,findings:review.findings.map(f=>({...f,status:'no_clear_concern',location:'',reason:''}))};
    await render(scan('uncertain',clean));
    await page.getByText(visualReviewParagraph(clean),{exact:true}).waitFor();
    assert.equal(await page.getByTestId('visual-review-state').textContent(),'No clear unusual details');
    const graphic={...clean,image_type:'document',findings:clean.findings.map(f=>({...f}))};
    graphic.findings[0]=graphicEyeFinding;
    const context=graphicScene(graphic.input_sha256);
    await render({...scan('ai_generated',graphic),scene_analysis:context});
    const expectedGraphic=visualReviewParagraph(normalizeFeatureReview(graphic),context);
    await page.getByText(expectedGraphic,{exact:true}).waitFor();
    assert.equal(await page.getByText(graphicEyeFinding.observation,{exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:'.test-results/anomaly-review/graphic-'+width+'.png',fullPage:true});
    const fourContext=fourPortraitScene(graphic.input_sha256);
    await render({...scan('ai_generated',graphic),scene_analysis:fourContext});
    await page.getByText(visualReviewParagraph(normalizeFeatureReview(graphic),fourContext),{exact:true}).waitFor();
    const unable={...clean,findings:clean.findings.map(f=>({...f,status:'unable_to_assess'}))};
    await render(scan('ai_generated',unable));
    await page.getByText(REVIEW_UNCERTAIN,{exact:true}).waitFor();
    assert.equal(await page.getByTestId('visual-review-state').textContent(),'Review uncertain');
    assert.equal(await page.getByRole('button',{name:'Retry visual review',exact:true}).count(),0);
    assert.equal(await page.getByText(visualReviewParagraph(clean),{exact:true}).count(),0);
    await page.evaluate(value=>{window.__reviewResponse=value;window.__checks=0;},review);
    await render(scan('ai_generated',base));
    await page.getByRole('button',{name:'Run updated visual check',exact:true}).click();
    await page.getByTestId('visual-review-paragraph').filter({hasText:review.findings[1].observation}).waitFor();
    assert.equal(await page.evaluate(()=>window.__checks),1);
    await page.evaluate(()=>{window.__failure=true;});
    await render({...scan('ai_generated',null),upload_review:{features:'completed'}});
    await page.getByRole('button',{name:'Check unusual details',exact:true}).click();
    await page.getByRole('alert').filter({hasText:REVIEW_FAILED}).waitFor();
    assert.equal(await page.getByText(visualReviewParagraph(clean),{exact:true}).count(),0);
    await page.evaluate(()=>{window.__failure=false;window.__checks=0;});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log('PASS: desktop/mobile simple paragraphs, classifier-independent visual findings, clean review, inconclusive review, historical refresh and errors. No AI claims or scans created.');
}finally{if(browser)await browser.close();await server.close();}
