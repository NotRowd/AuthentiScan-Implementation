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
    export const fetchBilling=async()=>{window.__billingReads=(window.__billingReads||0)+1;if(window.__billingFailure)throw new Error('Could not load your subscription.');return {data:billing};};
    export const createCheckout=async()=>{window.__checkoutCalls=(window.__checkoutCalls||0)+1;await new Promise(r=>setTimeout(r,900));throw new Error('Test provider unavailable. Retry the same purchase.');};
    export const refreshPayment=async()=>{window.__paymentChecks=(window.__paymentChecks||0)+1;billing.orders[0].status='paid';billing.plan={name:'Pro (Test)',scan_limit:null,expires_at:'2026-11-16T12:00:00Z'};user.plan=billing.plan;return {data:billing.orders[0]};};
    export const updateAccountProfile=async names=>{if(window.__profileFailure)throw new Error('Could not save profile.');Object.assign(user,{first_name:names.firstName.trim(),last_name:names.lastName.trim()});window.__profileSaved=names;return {data:{user,plan:user.plan}};};
    export const requestPasswordReset=async email=>{if(window.__resetFailure)throw new Error('Too many attempts. Please wait and retry.');window.__resetEmail=email;return {message:'If an account exists for this email, a reset link will be sent.'};};
    export const fetchScanFeedback=async()=>{if(window.__feedbackLoadFailure)throw new Error('Could not load feedback.');return {data:window.__savedFeedback||${JSON.stringify(initialFeedback)}};};
    export const saveScanFeedback=async(id,value)=>{window.__feedbackWrites=(window.__feedbackWrites||0)+1;await new Promise(r=>setTimeout(r,200));if(window.__feedbackFailure)throw new Error('Could not save feedback.');if(window.__savedFeedback)throw new Error('Feedback already submitted.');window.__savedFeedback=value;if(window.__feedbackLostResponse)throw new Error('Response lost.');return {data:value};};
    export const fetchUserStats=async()=>({data:{total_scans:1,scans_remaining:${remaining},ai_generated_found:0,queued_scans:0,plan:user.plan}});
    let deleted=false;
    export const fetchUserScans=async()=>({data:{scans:deleted?[]:[scan],pagination:{total:deleted?0:1}}});
    export const deleteScan=async()=>{window.__deletes=(window.__deletes||0)+1;await new Promise(resolve=>setTimeout(resolve,200));if(window.__deleteFailure)throw new Error('Deletion incomplete. Retry Delete to finish.');deleted=true;return {data:scan};};
    export const fetchScanDetails=async()=>({data:scan}),uploadScanImage=async()=>{window.__uploads=(window.__uploads||0)+1;await new Promise(resolve=>setTimeout(resolve,${uploadDelay}));if(${uploadFailure})throw new Error('Connection lost during upload.');return {data:scan};};
    export const fetchScanImage=async()=>new Blob([Uint8Array.from(atob('${previewPng}'),c=>c.charCodeAt(0))],{type:'image/png'});
    export const fetchScanHeatmap=fetchScanImage,fetchLocalizationImage=fetchScanImage,fetchScanReport=async()=>new Blob();
    export const fetchObjectImage=fetchScanImage,detectScanObjects=async()=>{window.__detectCalls=(window.__detectCalls||0)+1;await new Promise(r=>setTimeout(r,200));if(window.__detectorFailure)throw new Error('Object detector unavailable. Saved classification unchanged.');return {data:${JSON.stringify(objectFixture())}};};
    export const explainScanScene=async()=>{window.__sceneCalls=(window.__sceneCalls||0)+1;await new Promise(r=>setTimeout(r,${sceneDelay}));if(window.__sceneFailure??${sceneFailure})throw new Error('Local scene service unavailable.');return {data:{schema_version:1,status:'available',assessment:'tentative',model_version:'${SCENE_MODEL}',model_revision:'${SCENE_REVISION}',input_sha256:'a'.repeat(64),observation:'Synthetic test observation, not a model prediction.',changes_verdict:false,explanation_version:3,image_type:'logo',visual_assessment:'Synthetic visual assessment, not a model prediction.'}};};
    export const reviewScanFeatures=async()=>{window.__featureCalls=(window.__featureCalls||0)+1;await new Promise(r=>setTimeout(r,200));if(window.__featureFailure)throw new Error('Visual review unavailable.');return {data:${JSON.stringify(featureFixture())}};};
    export const fetchSystemReadiness=async()=>({data:{backend:'online',ai:'${health}',checked_at:'2026-10-04T01:00:00Z'}}),loginAccount=async()=>({data:{user}}),registerAccount=loginAccount;
  `;
}


const server=await createServer({server:{host:'127.0.0.1',port:0,strictPort:false,open:false,proxy:{}}});
let browser;
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({reducedMotion:'reduce'}),blocked=[],errors=[];
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin&&u.pathname==='/src/services/firebase-api.js')return route.fulfill({contentType:'application/javascript',body:apiMock()});if(u.protocol.startsWith('http')&&(u.origin!==origin||u.pathname.startsWith('/api/'))){blocked.push(u.href);return route.abort();}return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const out='.test-results/subscription-option-a';await mkdir(out,{recursive:true});
 const offer={name:'Pro',amount:19900,scan_limit:null,duration:'One calendar month',purchase_type:'one_time'};
 const pendingOrder={id:'22222222-2222-4222-8222-222222222222',status:'pending',amount:19900,created_at:'2026-11-14T03:00:00Z'};
 const orders=[pendingOrder,{...pendingOrder,id:'paid',status:'paid',created_at:'2026-10-10T03:00:00Z'},{...pendingOrder,id:'expired',status:'expired'}];
 const states=['free','history','pro','ineligible','unconfigured','unknown-price'];let cases=0;
 for(const state of states){
  billing={mode:'test',enabled:!['ineligible','unconfigured'].includes(state),offer:{...offer},plan:{name:'Free',scan_limit:5},message:state==='ineligible'?'Checkout is currently available only to designated test accounts.':'Test checkout is not configured yet. No real payments are accepted.',orders:state==='history'?orders:[]};
  if(state==='pro'){billing.plan={name:'Pro (Test)',scan_limit:null,expires_at:'2026-12-14T04:00:00Z'};billing.orders=orders.slice(1);}
  if(state==='unknown-price')billing.offer={...offer,amount:null,purchase_type:null};
  user.plan=billing.plan;
  for(const width of [1440,1280,1024,768,390,320]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/subscription');await page.getByRole('heading',{name:'Payment history',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${state} ${width} overflow`);
   assert.equal(await page.locator('h1').count(),1);assert.match(await page.locator('body').innerText(),/Pro increases your scan allowance, not prediction accuracy/);
   assert.match(await page.locator('body').innerText(),/Payments are simulated. No real money is charged/);
   if(width>=1280&&state==='free'){const y=(await page.locator('.subscription-history').boundingBox()).y;assert.ok(y<1000,`History too low: ${y}`);}
   if(width<=700){const free=await page.getByRole('region',{name:'Free plan',exact:true}).boundingBox(),pro=await page.getByRole('region',{name:'Pro plan',exact:true}).boundingBox();assert.ok(pro.y>=free.y+free.height);}
   if(state==='pro'){assert.equal(await page.locator('.subscription-checkout').count(),0);assert.equal(await page.getByRole('checkbox').count(),0);assert.match(await page.locator('.subscription-expiry').innerText(),/December 14, 2026/);}
   else{const ack=page.getByRole('checkbox'),checkout=page.locator('.subscription-checkout');assert.ok(await checkout.isDisabled());assert.ok(await ack.getAttribute('name'));if(billing.enabled){await ack.check();assert.ok(await checkout.isEnabled());await ack.uncheck();assert.ok(await checkout.isDisabled());}else{assert.ok(await ack.isDisabled());assert.match(await page.locator('.subscription-unavailable').innerText(),state==='ineligible'?/designated test accounts/:/not configured/);}}
   if(state==='unknown-price')await page.getByText('Price to be confirmed',{exact:true}).waitFor();
   if(state==='history'){await page.getByText('Checkout expired',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Check payment',exact:true}).isEnabled());assert.ok(await page.locator('.subscription-history').getByRole('button',{name:'Resume checkout',exact:true}).isDisabled());}
   if([1440,390].includes(width)&&['free','history','pro'].includes(state))await page.screenshot({path:`${out}/${state}-${width}.png`,fullPage:true});cases++;
  }
 }
 billing={mode:'test',enabled:true,offer,plan:{name:'Free',scan_limit:5},message:'Test mode only.',orders:[]};user.plan=billing.plan;
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/subscription');await page.getByRole('checkbox').waitFor();
 const ack=page.getByRole('checkbox');await ack.focus();await page.keyboard.press('Space');await page.locator('.subscription-checkout').focus();assert.notEqual(await page.locator('.subscription-checkout').evaluate(el=>getComputedStyle(el).outlineStyle),'none');await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Please wait…',exact:true}).waitFor();assert.ok(await ack.isDisabled());assert.ok(await page.locator('.subscription-checkout').isDisabled());await page.screenshot({path:`${out}/loading-mobile.png`,fullPage:true});
 await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.__checkoutCalls),1);await page.screenshot({path:`${out}/error-mobile.png`,fullPage:true});await page.getByRole('button',{name:'Retry loading',exact:true}).click();await page.getByRole('alert').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.__checkoutCalls),1,'Retry loading must not create checkout');
 billing={...billing,orders:[pendingOrder]};await page.goto(origin+'/subscription');await page.getByRole('button',{name:'Check payment',exact:true}).click();await page.getByText('Your Pro pass is active',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__checkoutCalls||0),0);assert.equal(await page.evaluate(()=>window.__paymentChecks),1);
 await page.goto(origin+'/subscription?payment=returned');await page.getByText('Your Pro pass is active',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__checkoutCalls||0),0);
 billing={...billing,orders:[]};await page.goto(origin+'/subscription?payment=returned');await page.getByText('Payment not confirmed yet',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__checkoutCalls||0),0);assert.ok(await page.locator('.subscription-checkout').isDisabled());
 await page.goto(origin+'/subscription?payment=cancelled');await page.getByText('Checkout cancelled',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__checkoutCalls||0),0);
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 console.log(`PASS: ${cases} subscription layouts; Free/Pro, history, unknown offer, account restrictions, acknowledgement keyboard gating, loading/error/retry, payment check, returned/cancelled routes; no external calls.`);
}finally{await browser?.close();await server.close();}
