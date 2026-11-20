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
let signedIn=true;
function apiMock() {
  return `
    export const requestRegistrationCode=async email=>{window.__codeRequests=(window.__codeRequests||0)+1;window.__registrationEmail=email;await new Promise(r=>setTimeout(r,100));if(window.__sendCodeFailure)throw new Error('Verification email could not be sent. Please try again later.');return {data:{challenge_id:'22222222-2222-4222-8222-222222222222',resend_after:60}};};
    export const saveAvatar=async file=>{window.__avatarWrites=(window.__avatarWrites||0)+1;await new Promise(r=>setTimeout(r,200));if(window.__avatarFailure)throw new Error('Could not save photo. Retry.');user.avatar_url=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);});window.dispatchEvent(new Event('auth-session-expired'));return {data:{user:{...user},plan:user.plan}};};
    export const removeAvatar=async()=>{user.avatar_url=null;window.dispatchEvent(new Event('auth-session-expired'));return {data:{user:{...user},plan:user.plan}};};
    export const ready=Promise.resolve(),isCloudMode=true,usesCloudMedia=true;
    export const checkPasswordResetLink=async code=>{window.__checkedCode=code;await new Promise(r=>setTimeout(r,window.__linkDelay||100));if(code==='expired')throw new Error('This reset link has expired or has already been used. Request a new link to continue.');return 'alex.rivera@example.com';};
    export const finishPasswordReset=async(code,password)=>{window.__passwordSaved=(window.__passwordSaved||0)+1;window.__passwordPayload={code,password};await new Promise(r=>setTimeout(r,window.__authDelay||200));if(window.__saveFailure)throw new Error('Could not save password. Try again.');};
    export const changeAccountPassword=async()=>{throw new Error('Unexpected signed-in password change in recovery test');};
    const user=${JSON.stringify(user)},scan=${JSON.stringify(scan)};
    export const getAuthToken=()=>((window.__sessionActive??${signedIn})?user.user_id:null),getStoredUser=()=>{if(${crash})throw new Error('Intentional recovery test');return user;},saveAuthSession=(data,persist)=>{window.__savedPersistence=persist;window.__sessionActive=true;Object.assign(user,data.user);window.dispatchEvent(new Event('auth-session-expired'));},clearAuthSession=async()=>{window.__sessionActive=false;window.dispatchEvent(new Event('auth-session-expired'));};
    export const fetchMe=async()=>({data:{user,plan:user.plan,usage:{scans_remaining:4}}});
    export const fetchEmailVerification=async()=>({data:{required:true,verified:!user.email_verification_required||user.email_verified,masked_email:'r***@e***',sent:!!window.__verificationSent,resend_after:Math.max(0,Math.ceil(((window.__cooldownUntil||0)-Date.now())/1000))}});
    export const sendEmailVerificationCode=async()=>{window.__verificationSent=(window.__verificationSent||0)+1;window.__cooldownUntil=Date.now()+60000;return fetchEmailVerification();};
    export const confirmEmailVerificationCode=async code=>{if(code!=='123456')throw new Error('The code is incorrect or expired.');user.email_verified=true;window.dispatchEvent(new Event('auth-session-expired'));return fetchEmailVerification();};
    const billing=${JSON.stringify(billing)};
    export const fetchBilling=async()=>({data:billing});
    export const createCheckout=async()=>{window.__checkoutCalls=(window.__checkoutCalls||0)+1;await new Promise(r=>setTimeout(r,250));throw new Error('Test provider unavailable. Retry the same purchase.');};
    export const refreshPayment=async()=>{window.__paymentChecks=(window.__paymentChecks||0)+1;billing.orders[0].status='paid';billing.plan={name:'Pro (Test)',scan_limit:null,expires_at:'2026-11-16T12:00:00Z'};user.plan=billing.plan;return {data:billing.orders[0]};};
    export const updateAccountProfile=async names=>{if(window.__profileFailure)throw new Error('Could not save profile.');Object.assign(user,{first_name:names.firstName.trim(),last_name:names.lastName.trim()});window.__profileSaved=names;return {data:{user,plan:user.plan}};};
    export const requestPasswordReset=async email=>{window.__resetRequests=(window.__resetRequests||0)+1;await new Promise(r=>setTimeout(r,window.__authDelay||100));if(window.__resetFailure)throw new Error('Too many attempts. Please wait and retry.');window.__resetEmail=email;return {message:'If an account exists for this email, a reset link will be sent.'};};
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
    export const fetchSystemReadiness=async()=>({data:{backend:'online',ai:'${health}',checked_at:'2026-10-04T01:00:00Z'}}),loginAccount=async payload=>{window.__loginCalls=(window.__loginCalls||0)+1;window.__loginPayload=payload;await new Promise(r=>setTimeout(r,window.__authDelay||150));if(window.__loginFailure)throw new Error('Invalid email or password.');return {data:{user,token:'fixture'}};},registerAccount=async payload=>{window.__registerCalls=(window.__registerCalls||0)+1;window.__registerPayload=payload;await new Promise(r=>setTimeout(r,window.__authDelay||150));if(payload.code!=='123456')throw new Error('The code is incorrect or expired.');if(!payload.challenge_id||payload.accept_terms!==true)throw new Error('Missing verification proof');user.email_verified=true;user.email_verification_required=true;window.__accountsCreated=(window.__accountsCreated||0)+1;return {data:{user,token:'fixture'}};};
  `;
}



const server=await createServer({server:{host:'127.0.0.1',port:0,proxy:{}}});let browser;
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({reducedMotion:'reduce'}),blocked=[],errors=[];
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin&&u.pathname==='/src/services/firebase-api.js')return route.fulfill({contentType:'application/javascript',body:apiMock()});if(u.protocol.startsWith('http')&&(u.origin!==origin||u.pathname.startsWith('/api/'))){blocked.push(u.href);return route.abort();}return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await mkdir('.test-results/avatar',{recursive:true});
 const {default:sharp}=await import('sharp');const photo=await sharp({create:{width:800,height:400,channels:3,background:'#0ea5e9'}}).png().toBuffer();
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:950});await page.goto(origin+'/profile');await page.getByRole('button',{name:'Edit Avatar',exact:true}).waitFor();
  await page.getByLabel('Choose profile photo').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:photo});
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false);
  await page.getByRole('slider',{name:'Zoom',exact:true}).fill('1.5');
  await page.getByRole('slider',{name:'Horizontal position'}).fill('100');
  await page.getByRole('button',{name:'Rotate right',exact:true}).click();await page.getByRole('button',{name:'Flip H',exact:true}).click();
  await page.screenshot({path:`.test-results/avatar/editor-${width}.png`,fullPage:true});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.__avatarWrites||0),0);
  await page.getByLabel('Choose profile photo').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:photo});await dialog.waitFor();
  await page.evaluate(()=>window.__avatarFailure=true);await page.getByRole('button',{name:'Use photo',exact:true}).click();await page.getByRole('alert').filter({hasText:'Could not save photo'}).waitFor();await page.evaluate(()=>window.__avatarFailure=false);
  await page.getByRole('button',{name:'Use photo',exact:true}).evaluate(el=>{el.click();el.click();});await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.__avatarWrites),2);await page.getByRole('status').filter({hasText:'Profile photo saved'}).waitFor();
  assert.ok(await page.getByAltText('Your profile photo').count()>=1);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Remove photo',exact:true}).click();await page.getByRole('status').filter({hasText:'removed'}).waitFor();assert.equal(await page.getByAltText('Your profile photo').count(),0);
  await page.getByLabel('Choose profile photo').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('bad')});await page.getByRole('alert').filter({hasText:'Choose a JPEG'}).waitFor();
 }
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);console.log('PASS avatar editor: four responsive widths, crop/zoom/rotate/flip, cancel, failure/retry, duplicate-submit protection, profile/sidebar update, removal, invalid file. No real accounts modified.');
}finally{await browser?.close();await server.close();}
