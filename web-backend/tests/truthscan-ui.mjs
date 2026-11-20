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
    export const fetchBilling=async()=>({data:billing});
    export const createCheckout=async()=>{window.__checkoutCalls=(window.__checkoutCalls||0)+1;await new Promise(r=>setTimeout(r,250));throw new Error('Test provider unavailable. Retry the same purchase.');};
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

const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false, proxy: {} } });
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [], blockedRequests = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === '/src/services/firebase-api.js') {
      return route.fulfill({ contentType: 'application/javascript', body: apiMock() });
    }
    if (url.protocol.startsWith('http') && (url.origin !== origin || url.pathname.startsWith('/api/'))) {
      blockedRequests.push(url.origin + url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(60000); // Allow a cold Vite dependency build on slower PCs.
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('.test-results/ui-regressions', { recursive: true });


  const providerBase={provider:'truthscan',authentic_score:null,ai_generated_score:null,decision_rule:'truthscan_label_confidence_60_v1',model_version:'truthscan-generic'};
  const cases=[
    {name:'ai',analysis:{...providerBase,verdict:'ai_generated',provider_label:'AI Generated',provider_label_confidence:.99},bars:[['AI-generated',99]],missing:0},
    {name:'ai-edited',analysis:{...providerBase,decision_rule:'truthscan_label_confidence_60_v2',verdict:'ai_generated',provider_label:'AI Edited',provider_label_confidence:.9725},bars:[['AI-generated',97.25]],missing:0},
    {name:'authentic',analysis:{...providerBase,verdict:'authentic',provider_label:'Real',provider_label_confidence:.87},bars:[['Authentic',87]],missing:0},
    {name:'uncertain-pair',analysis:{verdict:'uncertain',authentic_score:.5149,ai_generated_score:.4851},bars:[['Authentic',51.49],['AI-generated',48.51]],missing:0},
    {name:'uncertain-editing',analysis:{...providerBase,verdict:'uncertain',provider_label:'Digitally Edited',provider_label_confidence:.93},bars:[],missing:2},
    {name:'uncertain-low-confidence',analysis:{...providerBase,verdict:'uncertain',provider_label:'Real',provider_label_confidence:.55},bars:[['Authentic',55],['AI-generated',45]],missing:0,comparison:true},
    {name:'uncertain-ai-5224',analysis:{...providerBase,verdict:'uncertain',provider_label:'AI Generated',provider_label_confidence:.5224416255950928},bars:[['Authentic',47.76],['AI-generated',52.24]],missing:0,comparison:true},
    {name:'uncertain-low-ai-edited',analysis:{...providerBase,decision_rule:'truthscan_label_confidence_60_v2',verdict:'uncertain',provider_label:'AI Edited',provider_label_confidence:.52},bars:[['Authentic',48],['AI-generated',52]],missing:0,comparison:true},
    {name:'uncertain-digital-low',analysis:{...providerBase,verdict:'uncertain',provider_label:'Digitally Edited',provider_label_confidence:.52},bars:[],missing:2},
  ];
  for(const width of [1440,390])for(const example of cases){
    scan={...completed,analysis:{...completed.analysis,...example.analysis,readable_explanation:'Saved classification explanation.'},
      localization:{provider:'truthscan',status:'available',scope:'provider_heatmap'},
      provider_review:{provider:'truthscan',status:'ready',text:'A saved provider observation.',indicators:[]}};
    await page.setViewportSize({width,height:1000});
    await page.goto(origin+'/scans/'+scan.scan_id);
    await page.getByRole('heading',{name:'Image classification',exact:true}).waitFor();
    const scores=page.locator('[aria-label="Model scores"]');
    if(example.analysis.provider_label==='Digitally Edited'){
      const score=example.analysis.provider_label_confidence;
      await scores.getByText('Confidence in detecting digital editing',{exact:true}).waitFor();
      await scores.getByText((score*100).toFixed(2)+'%',{exact:true}).waitFor();
      assert.equal(Number(await scores.getByRole('progressbar',{name:'Digital-editing confidence',exact:true}).getAttribute('aria-valuenow')),Number((score*100).toFixed(2)));
      await scores.getByText('This is editing confidence, not confidence in authenticity.',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);continue;
    }

    assert.equal(await scores.locator('[data-testid^="classification-"]').count(),example.analysis.verdict==='uncertain'?2:1);
    assert.equal(await scores.getByRole('progressbar').count(),example.bars.length);
    for(const [label,value] of example.bars){
      const bar=scores.getByRole('progressbar',{name:new RegExp('^'+label+' ')});
      assert.equal(Number(await bar.getAttribute('aria-valuenow')),value);
      await scores.getByText(value.toFixed(2)+'%',{exact:true}).waitFor();
    }
    assert.equal(await scores.getByText('Not supplied',{exact:true}).count(),example.missing);
    if(example.comparison){
      assert.equal(await scores.getByText('Calculated remainder (100% minus returned confidence)',{exact:true}).count(),1);
      await scores.getByText('not a separate model score or verified probability',{exact:false}).waitFor();
    }
    if(example.missing)await scores.getByText('Separate Authentic and AI-generated percentages were not supplied',{exact:false}).waitFor();
    if(example.analysis.provider==='truthscan'){
      await page.getByText('A saved provider observation.',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.__featureCalls||0),0);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.waitForTimeout(700);
    await page.locator('section').filter({has:page.getByRole('heading',{name:'Image classification',exact:true})}).first().screenshot({path:'.test-results/ui-regressions/classification-'+example.name+'-'+width+'.png'});
  }
  console.log('PASS: selected-class confidence, supplied uncertain scores, clearly labeled display remainders and unsupported-category handling at desktop and phone widths');
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
} finally {
  if (browser) await browser.close();
  await server.close();
}
