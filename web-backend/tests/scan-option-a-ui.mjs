import {reportFixture} from './report-layout-fixtures.mjs';
// Isolated browser regressions: mock the API module, never contact Firebase or the backend.
// Run from web-backend with npm run test:ui. Requires installed Google Chrome.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import {objectFixture} from './object-fixture.mjs';
import {localizationFixture} from './localization-fixture.mjs';
import {experimentalFixture} from './experimental-localization-fixture.mjs';
import {featureFixture} from './feature-review-fixture.mjs';
import {SCENE_MODEL,SCENE_REVISION} from '../shared/scene-provider-contract.mjs';

const user = { user_id: 'review-user', first_name: 'Review', last_name: 'Tester', email: 'review@example.test', plan: { name: 'Free', scan_limit: 5 } };
const completed = {
  scan_id: '11111111-1111-4111-8111-111111111111', scan_number: 1, original_file_name: 'review.png', file_size_bytes: 1000,
  created_at: '2026-10-04T01:00:00Z', status: 'completed',
  analysis: { verdict: 'authentic', authentic_score: .8, ai_generated_score: .2, confidence_score: .8, model_version: 'review-model', heatmap_url: null },
};
let scan = completed;
let health = 'ready', remaining = 4, uploadDelay = 0, uploadFailure = false, crash = false;
let sceneFailure=false,sceneDelay=200;
let initialFeedback=null;
let billing={mode:'test',enabled:false,plan:user.plan,offer:{name:'Pro',amount:null,scan_limit:null,duration:'One calendar month',purchase_type:null},message:'Test checkout is not configured yet. No real payments are accepted.',orders:[]};
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
let previewPng=png;
let currentPlan={name:'Pro (Test)',scan_limit:null},statsFailure=false;
function apiMock() {
  return `
    export const saveAvatar=async()=>{throw new Error('Avatar upload not expected in this test');};
    export const removeAvatar=async()=>{throw new Error('Avatar removal not expected in this test');};
    export const requestRegistrationCode=async email=>({data:{challenge_id:'22222222-2222-4222-8222-222222222222',resend_after:60}});
    export const ready=Promise.resolve(),isCloudMode=true,usesCloudMedia=true;
    export const checkPasswordResetLink=async code=>{if(code==='expired')throw new Error('This reset link has expired or has already been used. Request a new link to continue.');return 'reset@example.test';};
    export const finishPasswordReset=async()=>{window.__passwordSaved=(window.__passwordSaved||0)+1;};
    export const changeAccountPassword=async()=>{throw new Error('Unexpected password change in general UI test');};
    const user=${JSON.stringify(user)},scan=${JSON.stringify(scan)};
    export const getAuthToken=()=>user.user_id,getStoredUser=()=>{if(${crash})throw new Error('Intentional recovery test');return user;},saveAuthSession=()=>{},clearAuthSession=async()=>{};
    export const fetchMe=async()=>({data:{user,plan:user.plan,usage:{scans_remaining:4}}});
    export const fetchEmailVerification=async()=>({data:{required:true,verified:!user.email_verification_required||user.email_verified,masked_email:'r***@e***',sent:!!window.__verificationSent,resend_after:window.__verificationSent?60:0}});
    export const sendEmailVerificationCode=async()=>{window.__verificationSent=(window.__verificationSent||0)+1;return fetchEmailVerification();};
    export const confirmEmailVerificationCode=async code=>{if(code!=='123456')throw new Error('The code is incorrect or expired.');user.email_verified=true;window.dispatchEvent(new Event('auth-session-expired'));return fetchEmailVerification();};
    const billing=${JSON.stringify(billing)};
    export const fetchBilling=async()=>({data:billing});
    export const createCheckout=async()=>{window.__checkoutCalls=(window.__checkoutCalls||0)+1;await new Promise(r=>setTimeout(r,250));throw new Error('Test provider unavailable. Retry the same purchase.');};
    export const refreshPayment=async()=>{window.__paymentChecks=(window.__paymentChecks||0)+1;billing.orders[0].status='paid';billing.plan={name:'Pro (Test)',scan_limit:null,expires_at:'2026-11-16T12:00:00Z'};user.plan=billing.plan;return {data:billing.orders[0]};};
    export const updateAccountProfile=async names=>{if(window.__profileFailure)throw new Error('Could not save profile.');Object.assign(user,{first_name:names.firstName.trim(),last_name:names.lastName.trim()});window.__profileSaved=names;return {data:{user,plan:user.plan}};};
    export const requestPasswordReset=async email=>{if(window.__resetFailure)throw new Error('Too many attempts. Please wait and retry.');window.__resetEmail=email;return {message:'If an account exists for this email, a reset link will be sent.'};};
    export const fetchScanFeedback=async()=>{if(window.__feedbackLoadFailure)throw new Error('Could not load feedback.');return {data:window.__savedFeedback||${JSON.stringify(initialFeedback)}};};
    export const saveScanFeedback=async(id,value)=>{window.__feedbackWrites=(window.__feedbackWrites||0)+1;await new Promise(r=>setTimeout(r,200));if(window.__feedbackFailure)throw new Error('Could not save feedback.');if(window.__savedFeedback)throw new Error('Feedback already submitted.');window.__savedFeedback=value;if(window.__feedbackLostResponse)throw new Error('Response lost.');return {data:value};};
    export const fetchUserStats=async()=>{window.__statsChecks=(window.__statsChecks||0)+1;if(window.__failAllowance)throw new Error('Synthetic allowance failure');const plan=window.__planOverride||${JSON.stringify(currentPlan)};return {data:{total_scans:1,scans_remaining:plan.scan_limit===null?null:Math.max(0,5-(window.__uploads||0)),ai_generated_found:0,queued_scans:0,plan,server_now:new Date().toISOString(),allowance_resets_at:new Date(Date.now()+3600000).toISOString()}};};
    let deleted=false;
    export const fetchUserScans=async()=>({data:{scans:deleted?[]:[scan],pagination:{total:deleted?0:1}}});
    export const deleteScan=async()=>{window.__deletes=(window.__deletes||0)+1;await new Promise(resolve=>setTimeout(resolve,200));if(window.__deleteFailure)throw new Error('Deletion incomplete. Retry Delete to finish.');deleted=true;return {data:scan};};
    export const fetchScanDetails=async()=>({data:scan}),uploadScanImage=async()=>{window.__uploads=(window.__uploads||0)+1;await new Promise(resolve=>setTimeout(resolve,${uploadDelay}));if(${uploadFailure})throw new Error('Connection lost during upload.');return {data:scan};};
    export const fetchScanImage=async()=>{window.__originalRequests=(window.__originalRequests||0)+1;if(window.__failOriginal)throw new Error('Synthetic image failure');return new Blob([Uint8Array.from(atob('${previewPng}'),c=>c.charCodeAt(0))],{type:'image/png'});};
    export const fetchScanHeatmap=fetchScanImage,fetchLocalizationImage=async()=>{window.__heatmaps=(window.__heatmaps||0)+1;if(window.__failHeatmap)throw new Error('Synthetic heatmap failure');return new Blob([Uint8Array.from(atob('${previewPng}'),c=>c.charCodeAt(0))],{type:'image/png'});},fetchScanReport=async()=>{window.__reports=(window.__reports||0)+1;return new Blob(['%PDF-1.4 test fixture'],{type:'application/pdf'});};
    export const fetchObjectImage=fetchScanImage,detectScanObjects=async()=>{window.__detectCalls=(window.__detectCalls||0)+1;await new Promise(r=>setTimeout(r,200));if(window.__detectorFailure)throw new Error('Object detector unavailable. Saved classification unchanged.');return {data:${JSON.stringify(objectFixture())}};};
    export const explainScanScene=async()=>{window.__sceneCalls=(window.__sceneCalls||0)+1;await new Promise(r=>setTimeout(r,${sceneDelay}));if(window.__sceneFailure??${sceneFailure})throw new Error('Local scene service unavailable.');return {data:{schema_version:1,status:'available',assessment:'tentative',model_version:'${SCENE_MODEL}',model_revision:'${SCENE_REVISION}',input_sha256:'a'.repeat(64),observation:'Synthetic test observation, not a model prediction.',changes_verdict:false,explanation_version:3,image_type:'logo',visual_assessment:'Synthetic visual assessment, not a model prediction.'}};};
    export const reviewScanFeatures=async()=>{window.__featureCalls=(window.__featureCalls||0)+1;await new Promise(r=>setTimeout(r,200));if(window.__featureFailure)throw new Error('Visual review unavailable.');return {data:${JSON.stringify(featureFixture())}};};
    export const fetchSystemReadiness=async()=>({data:{backend:'online',ai:'${health}',checked_at:'2026-10-04T01:00:00Z'}}),loginAccount=async()=>({data:{user}}),registerAccount=loginAccount;
  `;
}

function contrast(foreground, background) {
  const luminance = color => {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}


const server=await createServer({server:{host:'127.0.0.1',port:0,open:false,proxy:{}}});
let browser;
try {
 await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1680,height:1100},reducedMotion:'reduce'});
 const errors=[],blocked=[];
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin===origin&&u.pathname==='/src/services/firebase-api.js')return route.fulfill({contentType:'application/javascript',body:apiMock()});
  if(u.protocol.startsWith('http')&&(u.origin!==origin||u.pathname.startsWith('/api/'))){blocked.push(u.origin+u.pathname);return route.abort();}
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 await mkdir('.test-results/scan-option-a',{recursive:true});
 const fixture=await reportFixture();previewPng=fixture.original.toString('base64');
 const base={...completed,scan_number:54,credit_status:'used',original_file_name:'character-study-with-a-very-long-filename-'.repeat(3)+'.png',
 analysis:{provider:'truthscan',verdict:'uncertain',provider_label:'Digitally Edited',provider_label_confidence:.9604,confidence_score:.9604,authentic_score:null,ai_generated_score:null,decision_rule:'truthscan_label_confidence_60_v2',readable_explanation:'The analysis indicates possible editing. AuthentiScan could not confidently classify the image as Authentic or AI-Generated.'},localization:{provider:'truthscan',status:'available',scope:'provider_heatmap'}};
 async function upload(record=base){scan=structuredClone(record);await page.goto(origin+'/scan');await page.getByLabel('Choose image for analysis').setInputFiles({name:scan.original_file_name,mimeType:'image/png',buffer:fixture.original});await page.getByRole('button',{name:'Analyze Now',exact:true}).dblclick();await page.getByRole('heading',{name:'Your scan result',exact:true}).waitFor();await page.getByRole('img',{name:'Original image',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);}
 for(const width of [1680,1440,1280,1024,768,390,320]){
  await page.setViewportSize({width,height:1100});await upload();
  await page.getByText('Unlimited scans · No daily cap',{exact:true}).waitFor();
  assert.equal(await page.getByText('96.04%',{exact:true}).count(),1);
  assert.equal(await page.getByText('“Digitally Edited”',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.__heatmaps||0),0);
  assert.equal(await page.getByText(/5 free scans per day/).count(),0);
  assert.equal(await page.evaluate(()=>window.__uploads),1,'duplicate upload prevented');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
  const results=await page.locator('[aria-labelledby="completed-result-title"]').boundingBox();
  const summary=await page.locator('[aria-labelledby="saved-upload-title"]').boundingBox();
  const original=await page.getByRole('img',{name:'Original image',exact:true}).boundingBox();
  const actions=await page.getByTestId('completed-report-actions').boundingBox();
  assert(actions.y<original.y,'report actions above comparison');
  if(width>=1280){assert(results.x>summary.x+summary.width);assert(results.width>summary.width*2);assert(original.width>(width>=1440?300:260));}
  else assert(results.y>summary.y,'stacked on narrow screens');
  if(width===1680||width===390)await page.screenshot({path:`.test-results/scan-option-a/scan-${width}.png`,fullPage:true});
 }
 // Real export component still downloads the saved report, without submitting a scan.
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export PDF for scan 54'}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'AuthentiScan-scan-54.pdf');assert.equal(await page.evaluate(()=>window.__uploads),1);assert.equal(await page.evaluate(()=>window.__reports),1);
 assert.equal(await page.getByRole('link',{name:'View full report',exact:true}).getAttribute('href'),'/scans/'+base.scan_id);
 // Authoritative server plan can expire while this completed scan stays open.
 await page.evaluate(()=>{window.__planOverride={name:'Free',scan_limit:5};window.dispatchEvent(new Event('focus'));});
 await page.getByText('4 of 5 scans remaining today',{exact:true}).waitFor();assert.equal(await page.getByText('Unlimited scans · No daily cap',{exact:true}).count(),0);
 await page.evaluate(()=>{window.__failAllowance=true;window.dispatchEvent(new Event('focus'));});await page.getByText('Plan unavailable',{exact:true}).waitFor();
 await page.evaluate(()=>window.__failAllowance=false);await page.getByRole('button',{name:'Retry allowance',exact:true}).click();await page.getByText('4 of 5 scans remaining today',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__uploads),1);
 await page.getByRole('button',{name:'Choose another image',exact:true}).click();await page.getByLabel('Choose image for analysis').waitFor();assert.equal(await page.getByRole('heading',{name:'Your scan result',exact:true}).count(),0);
 // Original-only Authentic state, including private-image failure and retry.
 currentPlan={name:'Free',scan_limit:5};
 await upload({...base,analysis:{...base.analysis,verdict:'authentic',provider_label:'Real',provider_label_confidence:.8975}});
 assert.equal(await page.getByRole('img',{name:'Model highlights',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.__heatmaps||0),0);
 // Force an original fetch failure on a fresh completed scan, then recover in place.
 await page.addInitScript(()=>window.__failOriginal=true);
 await page.reload();await page.getByLabel('Choose image for analysis').setInputFiles({name:'retry.png',mimeType:'image/png',buffer:fixture.original});await page.getByRole('button',{name:'Analyze Now',exact:true}).click();await page.getByText('Original image could not be loaded.',{exact:true}).waitFor();
 await page.evaluate(()=>window.__failOriginal=false);await page.getByRole('button',{name:'Retry images',exact:true}).click();await page.getByRole('img',{name:'Original image',exact:true}).waitFor();
 // Remove init failure for following cases by using a new page.
 await page.close();
 const fresh=await context.newPage();fresh.on('pageerror',e=>errors.push(e.message));await fresh.addInitScript(()=>window.__failOriginal=false);
 // The remaining cases use the same isolated route but a fresh page.
 for(const item of [
  {analysis:{...base.analysis,verdict:'ai_generated',provider_label:'AI Generated',provider_label_confidence:.99},localization:{...base.localization,status:'unavailable'}},
  {analysis:{...base.analysis,provider_label_confidence:null},localization:{...base.localization,status:'unavailable'}},
  {analysis:{...base.analysis,provider_label:'AI Generated',provider_label_confidence:.5224},localization:{...base.localization,status:'unavailable'}},
  {analysis:{...base.analysis,verdict:'ai_generated',provider_label:'AI Edited',provider_label_confidence:.9725},localization:{...base.localization,status:'unavailable'}},
 ]){
  scan={...base,...item};await fresh.goto(origin+'/scan');await fresh.getByLabel('Choose image for analysis').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:fixture.original});await fresh.getByRole('button',{name:'Analyze Now',exact:true}).click();await fresh.getByRole('heading',{name:'Your scan result',exact:true}).waitFor();
  if(item.analysis.provider_label!=='Digitally Edited')await fresh.getByText('No provider heatmap is available for this saved result.',{exact:true}).waitFor();
  else assert.equal(await fresh.getByRole('img',{name:'Model highlights',exact:true}).count(),0);
  if(item.analysis.provider_label==='AI Edited')assert.equal(await fresh.getByText('97.25%',{exact:true}).count(),1);
  if(item.analysis.provider_label_confidence===.5224)assert.equal(await fresh.getByText('52.24%',{exact:true}).count(),1);
  if(item.analysis.provider_label_confidence===null){assert.equal(await fresh.getByText('Not available',{exact:true}).count(),1);assert.equal(await fresh.getByRole('progressbar').count(),0);}
 }
 // Legacy local-classifier scores keep their original score meaning.
 scan={...base,analysis:{verdict:'uncertain',authentic_score:.543,ai_generated_score:.457,minimum_class_score:.6,decision_rule:'manuscript_min_score_v1'},localization:null};
 await fresh.goto(origin+'/scan');await fresh.getByLabel('Choose image for analysis').setInputFiles({name:'legacy.png',mimeType:'image/png',buffer:fixture.original});await fresh.getByRole('button',{name:'Analyze Now',exact:true}).click();await fresh.getByRole('heading',{name:'Your scan result',exact:true}).waitFor();
 assert.equal(await fresh.getByRole('heading',{name:'Highest class score (uncertain)',exact:true}).count(),1);assert.equal(await fresh.getByText('54.30%',{exact:true}).count(),1);
 // Pending and failed submissions keep their existing saved-scan workflow.
 for(const status of ['queued','failed']){
  scan={...completed,status,analysis:null,credit_status:status==='failed'?'not_charged':'reserved'};
  await fresh.goto(origin+'/scan');await fresh.getByLabel('Choose image for analysis').setInputFiles({name:'saved.png',mimeType:'image/png',buffer:fixture.original});await fresh.getByRole('button',{name:'Analyze Now',exact:true}).click();await fresh.getByRole('heading',{name:status==='failed'?'Analysis Failed':'Analysis Pending',exact:true}).waitFor();
  assert.equal(await fresh.getByRole('link',{name:'View saved scan',exact:true}).getAttribute('href'),'/scans/'+scan.scan_id);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 console.log('PASS: Option A at seven widths; live plan refresh/expiry and retry; saved confidence; no duplicate submission; report export; reset; original-only Authentic and image retry; missing heatmap and missing score; pending/failed states. No live API requests.');
}finally{if(browser)await browser.close();await server.close();}
