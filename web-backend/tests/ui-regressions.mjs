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

  // Synthetic password only; toggles must never submit, clear, or reveal another field.
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    for(const route of ['login','register']){
      await page.goto(`${origin}/${route}`);
      const ids=route==='login'?['login-password']:['register-password','confirm-password'];
      for(const id of ids){
        const input=page.locator('#'+id),label=id==='confirm-password'?'confirm password':'password';
        assert.equal(await input.getAttribute('type'),'password');
        await input.fill('SyntheticOnly!123');
        const toggle=page.getByRole('button',{name:'Show '+label,exact:true});
        await toggle.focus();await page.keyboard.press('Enter');
        assert.equal(await input.getAttribute('type'),'text');
        assert.equal(await input.inputValue(),'SyntheticOnly!123');
        for(const other of ids.filter(value=>value!==id))assert.equal(await page.locator('#'+other).getAttribute('type'),'password');
        await page.getByRole('button',{name:'Hide '+label,exact:true}).click();
        assert.equal(await input.getAttribute('type'),'password');
        assert.equal(await input.inputValue(),'SyntheticOnly!123');
        assert.equal(new URL(page.url()).pathname,'/'+route);
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
  }
  console.log('PASS: password visibility toggles are independent, keyboard accessible, preserve values and do not submit on desktop/mobile');
  await page.setViewportSize({width:1440,height:1000});

  user.email_verification_required=true;user.email_verified=false;
  await page.goto(`${origin}/dashboard`);
  await page.getByRole('heading',{name:'Verify your email'}).waitFor();
  await page.getByText('Code sent. Check your inbox and spam folder.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__verificationSent),1);
  await page.getByLabel('Verification code',{exact:true}).fill('111111');
  await page.getByRole('button',{name:'Confirm email',exact:true}).click();
  await page.getByRole('alert').waitFor();
  await page.getByLabel('Verification code',{exact:true}).fill('123456');
  await page.screenshot({path:'.test-results/ui-regressions/email-verification.png',fullPage:true});
  await page.getByRole('button',{name:'Confirm email',exact:true}).click();
  await page.waitForURL(`${origin}/dashboard`);
  delete user.email_verification_required;delete user.email_verified;

  // Logout is anchored to the viewport, not the bottom of long dashboard content.
  scan=completed;
  for(const viewport of [{width:1440,height:900},{width:1024,height:480}]){
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/dashboard`);
    const sidebar=page.getByRole('complementary',{name:'Workspace navigation'});
    const logout=sidebar.getByRole('button',{name:'Log out',exact:true});
    await logout.waitFor();
    for(const position of ['top','bottom']){
      await page.evaluate(where=>window.scrollTo(0,where==='top'?0:document.documentElement.scrollHeight),position);
      await page.waitForTimeout(100);
      const bounds=await logout.boundingBox();
      assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<=viewport.height,`Logout must stay on screen at ${position}, ${viewport.height}px height`);
      assert.equal(await logout.evaluate(el=>{
        const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
      }),true,'Logout must be unobstructed');
    }
    await page.evaluate(()=>window.scrollTo(0,0));
    const scrollArea=sidebar.locator('div').first();
    await scrollArea.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    const bounds=await logout.boundingBox();
    assert.ok(bounds.y>=0&&bounds.y+bounds.height<=viewport.height,'Scrolling navigation leaves logout pinned');
    await logout.focus();
    assert.equal(await logout.evaluate(el=>el===document.activeElement),true);
    await page.screenshot({path:`.test-results/ui-regressions/sidebar-logout-${viewport.height}.png`});
  }
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS: sidebar logout stays visible and keyboard accessible on long pages and short desktop windows');

  // A successful API response must render the page rather than crash on an undefined icon.
  for (const scenario of [completed, { ...completed, status: 'failed', analysis: null }, {
    ...completed, analysis: { ...completed.analysis, verdict: 'uncertain', authentic_score: .5, ai_generated_score: .5, gradcam: { reason: 'uncertain_prediction' } },
  }]) {
    scan = scenario;
    await page.goto(`${origin}/scans/${scan.scan_id}`).catch(async error=>{
      console.log('Navigation diagnostic:',{errors,blockedRequests,body:(await page.locator('body').innerText().catch(()=>'' )).slice(0,1000)});
      throw error;
    });
    await page.getByRole('heading', { name: 'review.png', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Your result', exact: true }).waitFor();
    assert.deepEqual(errors, [], 'Saved-result page must render without exceptions');
  }
  scan={...completed,analysis:{...completed.analysis,verdict:'uncertain',authentic_score:.5102,ai_generated_score:.4898,
    confidence_score:.5102,inference_contract_version:2,decision_rule:'manuscript_min_score_v1',minimum_class_score:.6,
    decision_threshold:.5,uncertainty_margin:.1,policy_version:'manuscript-fixture',gradcam:{status:'unavailable',target:null,reason:'uncertain_prediction'}}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText(/The model could not confidently choose/).waitFor();
  assert.equal(await page.getByText('How this result was calculated',{exact:true}).count(),0);
  await page.locator('section[aria-labelledby="scene-title"]').screenshot({path:'.test-results/ui-regressions/result-explanation-uncertain.png'});
  await page.getByText(/The prediction is uncertain. No single-class heatmap is shown./).waitFor();
  assert.equal(await page.getByText(/Scores inside or on the band are uncertain/).count(),0,'No legacy inclusive rule for new policy');
  scan={...completed,localization:{schema_version:1,status:'unavailable',reason:'validation_pending'}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText('Not available yet: the localization candidate is still being evaluated.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('img',{name:'Experimental candidate edited-region grid, not Grad-CAM',exact:true}).count(),0);
  scan={...completed,localization:localizationFixture()};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  const localizationPreview=page.getByRole('img',{name:'Experimental candidate edited-region grid, not Grad-CAM',exact:true});
  await localizationPreview.waitFor();
  assert.equal(await localizationPreview.locator('rect').count(),0,'Old scans also start with the original');
  assert.equal(await page.getByRole('button',{name:'View unverified heatmap',exact:true}).count(),0,'Never invent heatmap scores for legacy masks');
  await page.getByRole('button',{name:'View unverified highlights',exact:true}).click();
  assert.equal(await localizationPreview.locator('rect').count(),16);
  await page.getByRole('button',{name:'Original',exact:true}).click();
  assert.equal(await localizationPreview.locator('rect').count(),0);
  await page.screenshot({path:'.test-results/ui-regressions/localization-fixture-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Highlights',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Localization must fit mobile');
  await page.screenshot({path:'.test-results/ui-regressions/localization-fixture-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  scan={...completed,localization:experimentalFixture()};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByRole('button',{name:'View unverified highlights',exact:true}).click();
  await page.getByText('Experimental feature — not reliable for confirming edits',{exact:true}).waitFor();
  await page.getByText('Technical details',{exact:true}).click();
  await page.getByText(/missed all candidate regions in 61 of 80/).waitFor();
  assert.equal(await page.getByRole('img',{name:'Experimental candidate edited-region grid, not Grad-CAM',exact:true}).locator('rect').count(),16);
  await page.locator('section[aria-labelledby="localization-title"]').screenshot({path:'.test-results/ui-regressions/experimental-localization.png'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Experimental warning must fit mobile');
  await page.setViewportSize({width:1440,height:1000});
  scan={...completed,localization:{...experimentalFixture(),status:'uncertain',reason:'no_candidate_region',mask:null,
    score_scale:10000,score_grid:Array.from({length:1024},(_,i)=>i<10?7500:1200)}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  const scorePreview=page.getByRole('img',{name:'Unvalidated localization score preview, not Grad-CAM',exact:true});
  const localizationSection=page.locator('section[aria-labelledby="localization-title"]');
  const technical=localizationSection.locator('details').filter({has:page.locator('summary',{hasText:'Explore experimental preview'})});
  const modelDetails=localizationSection.locator('details').filter({has:page.locator('summary',{hasText:'Technical details'})});
  await localizationSection.getByText('Inconclusive',{exact:true}).waitFor();
  await page.getByText('We could not reliably identify an edited area.',{exact:true}).waitFor();
  await localizationSection.getByText('Experimental feature — not reliable for confirming edits',{exact:true}).waitFor();
  assert.equal(await scorePreview.isVisible(),false,'Uncertain score preview is hidden in closed technical details');
  assert.equal(await page.getByRole('button',{name:'View unverified heatmap',exact:true}).isVisible(),false);
  assert.equal(await scorePreview.locator('rect').count(),0,'Uncertain heatmap must be opt-in');
  assert.equal(await technical.getAttribute('open'),null);
  assert.equal(await modelDetails.getAttribute('open'),null);
  assert.equal(await page.getByRole('slider').count(),0,'No threshold slider in the simplified heatmap');
  await page.locator('section[aria-labelledby="localization-title"]').screenshot({path:'.test-results/ui-regressions/localization-simple-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Simple panel fits mobile');
  await page.locator('section[aria-labelledby="localization-title"]').screenshot({path:'.test-results/ui-regressions/localization-simple-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});
  await technical.locator('summary').click();
  await scorePreview.waitFor();
  assert.equal(await technical.getByRole('button',{name:'View unverified heatmap',exact:true}).count(),1);
  await page.getByRole('button',{name:'View unverified heatmap',exact:true}).click();
  assert.equal(await scorePreview.locator('rect').count(),1024);
  assert.equal(await scorePreview.locator('rect').first().getAttribute('fill'),'#be0065');
  assert.ok(Math.abs(Number(await scorePreview.locator('rect').first().getAttribute('fill-opacity'))-.65*.75)<1e-10);
  assert.ok(Math.abs(Number(await scorePreview.locator('rect').nth(10).getAttribute('fill-opacity'))-.65*.12)<1e-10);
  await page.getByLabel('Localization heatmap legend',{exact:true}).waitFor();
  await page.getByText('Experimental feature — not reliable for confirming edits',{exact:true}).waitFor();
  await localizationSection.getByText('Inconclusive',{exact:true}).waitFor();
  assert.equal(await modelDetails.getAttribute('open'),null,'Showing the preview does not expand technical details');
  await page.getByRole('button',{name:'Original',exact:true}).click();
  assert.equal(await scorePreview.locator('rect').count(),0);
  assert.equal(await page.getByLabel('Localization heatmap legend',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Heatmap',exact:true}).click();
  assert.equal(await scorePreview.locator('rect').count(),1024);
  await page.locator('section[aria-labelledby="localization-title"]').screenshot({path:'.test-results/ui-regressions/localization-score-preview.png'});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Score controls fit mobile');
  await page.locator('section[aria-labelledby="localization-title"]').screenshot({path:'.test-results/ui-regressions/localization-heatmap-mobile.png'});
  await modelDetails.locator('summary').click();
  await page.getByText(/missed all candidate regions in 61 of 80/).waitFor();
  await technical.locator('summary').click();
  assert.equal(await scorePreview.isVisible(),false,'Closing technical details hides the selected heatmap');
  assert.equal(await page.getByLabel('Localization heatmap legend',{exact:true}).isVisible(),false);
  assert.equal(await page.getByRole('img',{name:'Original image without localization highlights',exact:true}).count(),0,'Uncertain localization does not repeat the original image');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Technical details fit mobile');
  await page.setViewportSize({width:1440,height:1000});
  for(const score of [0,10000]){
    scan={...scan,localization:{...scan.localization,score_grid:Array(1024).fill(score)}};
    await page.goto(`${origin}/scans/${scan.scan_id}`);
    await localizationSection.getByText('Inconclusive',{exact:true}).waitFor();
    assert.equal(await scorePreview.isVisible(),false);
    await technical.locator('summary').click();await scorePreview.waitFor();
    assert.equal(await scorePreview.locator('rect').count(),0,'Reload always restores original view');
    await page.getByRole('button',{name:'View unverified heatmap',exact:true}).click();
    assert.equal(Number(await scorePreview.locator('rect').first().getAttribute('fill-opacity')),.65*score/10000);
    await localizationSection.getByText('Inconclusive',{exact:true}).waitFor();
  }
  scan={...completed,localization:{...localizationFixture(),status:'uncertain',reason:'diffuse_response',mask:null}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await localizationSection.getByText('Inconclusive',{exact:true}).waitFor();
  assert.equal(await page.getByRole('img',{name:'Original image without localization highlights',exact:true}).count(),0);
  assert.equal(await technical.count(),0,'No experimental preview control without a saved map');
  await modelDetails.locator('summary').click();
  assert.equal(await page.getByRole('button',{name:'View unverified heatmap',exact:true}).count(),0,'No invented preview without saved scores');
  assert.equal(await page.getByRole('img',{name:'Experimental candidate edited-region grid, not Grad-CAM',exact:true}).count(),0);
  // An uncertain classification must not suppress an independently available localizer result.
  scan={...completed,analysis:{...completed.analysis,verdict:'uncertain',authentic_score:.5,ai_generated_score:.5},localization:experimentalFixture()};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByRole('button',{name:'View unverified highlights',exact:true}).waitFor();
  assert.equal(await technical.getByRole('button',{name:'View unverified highlights',exact:true}).count(),0);
  console.log('PASS: completed, failed, and uncertain saved-result pages render');
  scan=completed;
  sceneFailure=true;sceneDelay=500;
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByRole('heading',{name:'Result explanation',exact:true}).waitFor();
  await page.getByText(/The model classified this image as Authentic/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Explain scene',exact:true}).count(),0);
  await page.getByText('Local scene service unavailable.',{exact:true}).waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>window.__sceneCalls),1,'StrictMode auto-load happens once; failures do not auto-loop');
  await page.evaluate(()=>window.__sceneFailure=false);
  await page.getByRole('button',{name:'Retry image observations',exact:true}).evaluate(el=>{el.click();el.click();});
  await page.getByText('Synthetic test observation, not a model prediction.',{exact:true}).waitFor();
  await page.getByRole('heading',{name:'Image description',exact:true}).waitFor();
  for(const removed of ['Image type · estimated','Logo / graphic','Visual assessment · tentative','Synthetic visual assessment, not a model prediction.'])
    assert.equal(await page.getByText(removed,{exact:true}).count(),0,'Only the image description is shown');
  assert.equal(await page.evaluate(()=>window.__sceneCalls),2);
  await page.locator('section[aria-labelledby="scene-title"]').screenshot({path:'.test-results/ui-regressions/scene-explanation.png'});
  console.log('PASS: automatic explanation, independent verdict, single request, no retry loop, manual retry');
  sceneFailure=false;sceneDelay=700;
  scan={...completed,scene_analysis:{schema_version:1,status:'available',assessment:'tentative',model_version:'smolvlm-500m-scene-v1',model_revision:'a7da5b986cb59b408707209984f360a5f4ad7e47',input_sha256:'a'.repeat(64),observation:'Older description retained.',changes_verdict:false}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText('Older description retained.',{exact:true}).waitFor();
  await page.getByText('Synthetic test observation, not a model prediction.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__sceneCalls),1,'Legacy explanation upgrades automatically once');
  assert.equal(await page.getByRole('button',{name:'Update explanation',exact:true}).count(),0);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Structured explanation fits mobile');
  await page.locator('section[aria-labelledby="scene-title"]').screenshot({path:'.test-results/ui-regressions/scene-explanation-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});

  scan={...completed,scene_analysis:{...scan.scene_analysis,model_version:SCENE_MODEL,model_revision:SCENE_REVISION,explanation_version:3,image_type:'logo',visual_assessment:'Saved tentative observation.'}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText('Older description retained.',{exact:true}).waitFor();
  assert.equal(await page.getByText('Saved tentative observation.',{exact:true}).count(),0,'Saved assessment is not displayed');
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(()=>window.__sceneCalls||0),0,'Current saved explanation does not rerun inference');
  scan={...completed,status:'failed',analysis:null};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText(/Analysis failed, so there is no AI-generated or authentic result to explain/).waitFor();
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(()=>window.__sceneCalls||0),0,'Failed scans never request scene inference');
  scan=completed;sceneDelay=1500;
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.waitForFunction(()=>window.__sceneCalls===1);
  await page.getByRole('link',{name:'Dashboard',exact:true}).first().click();
  await page.waitForTimeout(1700);
  assert.equal(new URL(page.url()).pathname,'/dashboard','Late scene result does not navigate after leaving the scan');
  sceneDelay=200;

  scan={...completed,object_detection:objectFixture(),analysis:{...completed.analysis,preprocessing_version:'rgb-pillow-bilinear-224-v1',heatmap_url:'/fixture-heatmap',gradcam:{status:'available',palette:'blue-green-yellow-v1',target:'authentic'}}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByRole('heading',{name:'Objects in the image',exact:true}).waitFor();
  await page.getByRole('img',{name:'Detected objects on the model-oriented original image',exact:true}).waitFor();
  await page.getByRole('button',{name:/1\. person/}).click();
  assert.equal(await page.getByRole('button',{name:/1\. person/}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Compare with Grad-CAM',exact:true}).click();
  await page.getByRole('img',{name:'Detected object boxes over the saved Grad-CAM heatmap',exact:true}).waitFor();
  await page.getByText(/Heatmap overlap does not prove an object is manipulated/).waitFor();
  await page.getByLabel('Grad-CAM color legend',{exact:true}).waitFor();
  await page.getByLabel('Show object boxes',{exact:true}).uncheck();
  assert.equal(await page.getByRole('img',{name:'Detected object boxes over the saved Grad-CAM heatmap',exact:true}).locator('rect').count(),0);
  await page.screenshot({path:'.test-results/ui-regressions/object-context-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.getByLabel('Show object boxes',{exact:true}).check();
  await page.screenshot({path:'.test-results/ui-regressions/object-context-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Object UI must fit mobile');
  scan={...scan,analysis:{...scan.analysis,preprocessing_version:'exif-white-rgb-pillow-bilinear-224-v2'}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText('About object detection',{exact:true}).click();
  await page.getByText(/Heatmap comparison is disabled for this model version/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Compare with Grad-CAM',exact:true}).count(),0);
  scan={...completed,object_detection:{...objectFixture(),objects:[]}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText(/No objects could be identified confidently/).waitFor();
  assert.equal(await page.getByRole('img',{name:'Detected objects on the model-oriented original image',exact:true}).count(),0,'Empty detections do not repeat the image');
  scan=completed;
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  const identify=page.getByRole('button',{name:'Identify objects',exact:true});
  await identify.waitFor();await page.evaluate(()=>window.__detectorFailure=true);
  await identify.click();await page.getByRole('alert').filter({hasText:'Object detector unavailable'}).waitFor();
  await page.evaluate(()=>window.__detectorFailure=false);
  await identify.evaluate(el=>{el.click();el.click();});
  await page.getByRole('button',{name:/1\. person/}).waitFor();
  assert.equal(await page.evaluate(()=>window.__detectCalls),2,'One failed request and one successful retry, no duplicate');
  assert.equal(await page.getByRole('button',{name:'Identify objects',exact:true}).count(),0);
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS: saved and empty objects, box selection/toggle, heatmap comparison, legend, old-scan retry, and mobile layout');

  // Synthetic presentation fixture, never an actual prediction about this logo.
  previewPng=(await readFile('src/assets/logo.png')).toString('base64');
  scan={...completed,original_file_name:'UI example — illustrative scores.png',
    analysis:{...completed.analysis,verdict:'ai_generated',authentic_score:.0266,ai_generated_score:.9734,
      decision_rule:'manuscript_min_score_v1',minimum_class_score:.6,preprocessing_version:'exif-white-rgb-pillow-bilinear-224-v2',
      gradcam:{status:'unavailable',reason:'no_positive_attribution'}},
    scene_analysis:{schema_version:1,status:'available',assessment:'tentative',model_version:SCENE_MODEL,model_revision:SCENE_REVISION,input_sha256:'a'.repeat(64),observation:'Skibidi.',changes_verdict:false,explanation_version:3,image_type:'uncertain',visual_assessment:'Not assessed.'},
    object_detection:{...objectFixture(),objects:[]},
    localization:{...experimentalFixture(),status:'uncertain',reason:'no_candidate_region',mask:null,score_scale:10000,score_grid:Array(1024).fill(1200)}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText('The model returned too little detail to describe this image.',{exact:true}).waitFor();
  assert.equal(await page.getByText('97.34%',{exact:true}).count(),1,'No duplicate selected-score card');
  assert.equal(await page.getByText('AI-generated class score',{exact:true}).count(),0);
  assert.equal(await page.getByText('Saved response: Skibidi.',{exact:true}).isVisible(),false,'Short captions are preserved only in details');
  assert.equal(await page.locator('details[open]').count(),0,'All technical details start collapsed');
  assert.equal(await page.locator('section[aria-labelledby="localization-title"]').getByRole('img').count(),0,'No visible repeated localization image');
  await page.getByRole('link',{name:'Scan another image',exact:true}).waitFor();
  await page.screenshot({path:'.test-results/ui-regressions/results-simple-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Final results fit narrow screens');
  assert.equal(await page.getByText('How this result was calculated',{exact:true}).count(),0);
  await page.screenshot({path:'.test-results/ui-regressions/results-simple-mobile.png',fullPage:true});
  await page.getByText('Description details',{exact:true}).click();
  await page.getByText('Saved response: Skibidi.',{exact:true}).waitFor();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>window.__sceneCalls||0),0,'Presentation cleanup never reruns a current saved caption');
  await page.setViewportSize({width:1440,height:1000});
  previewPng=png;
  console.log('PASS: compact results, scores shown once, short-caption fallback, keyboard details, preserved saved output and narrow layout');

  // Review runs once after the scene request settles; it never fabricates a CNN reason.
  scan={...completed,scene_analysis:{...scan.scene_analysis,observation:'A synthetic description for testing.'}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText('The model could not reliably assess these features.',{exact:false}).waitFor();
  await page.getByText('View all five feature checks',{exact:true}).click();
  await page.getByText('Eyes · Unable to assess',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__featureCalls),1,'One automatic review only');
  assert.equal(await page.evaluate(()=>window.__sceneCalls||0),0,'Saved scene not regenerated');
  const review=featureFixture();review.findings[0]={category:'eyes',status:'possible_concern',observation:'Synthetic fixture: a bright glow appears around the eye area.'};
  scan={...scan,feature_review:review};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText('1. Eyes',{exact:true}).waitFor();
  await page.getByRole('heading',{name:'What looks unusual?',exact:true}).waitFor();
  await page.getByText(review.findings[0].observation,{exact:true}).first().waitFor();
  await page.getByText(/The model classified this image as Authentic/).waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>window.__featureCalls||0),0,'Saved review reused');
  await page.locator('section[aria-labelledby="features-title"]').screenshot({path:'.test-results/ui-regressions/feature-review.png'});
  scan={...scan,feature_review:null};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.evaluate(()=>window.__featureFailure=true);
  await page.getByText('Visual review unavailable.',{exact:true}).waitFor();
  await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>window.__featureCalls),1,'No failure loop');
  await page.evaluate(()=>window.__featureFailure=false);
  await page.getByRole('button',{name:'Retry visual review',exact:true}).evaluate(el=>{el.click();el.click();});
  await page.getByText('The model could not reliably assess these features.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>window.__featureCalls),2,'No duplicate retry');
  console.log('PASS: feature review generation, saved evidence, failure/retry, unknown features and independent verdict');

  const returnedCases=JSON.parse(await readFile(new URL('./fixtures/visual-review-regression.json',import.meta.url),'utf8'));
  const sheep=returnedCases.find(row=>row.sample==='sheep-original');
  scan={...completed,scene_analysis:sheep.scene,feature_review:sheep.features};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText(sheep.scene.observation,{exact:true}).waitFor();
  assert.equal(await page.getByText('1. Eyes',{exact:true}).count(),0);
  await page.getByText('View all five feature checks',{exact:true}).click();
  await page.getByText('Eyes · Unable to assess',{exact:true}).waitFor();
  await page.getByText('This check is inconclusive because the model did not provide a consistent visual observation.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__featureCalls||0),0);
  await page.locator('section[aria-labelledby="scene-title"]').screenshot({path:'.test-results/ui-regressions/visual-review-inconclusive.png'});
  for(const [code,words] of [['VISUAL_BUSY',/service is busy/],['VISUAL_OFFLINE',/service is offline/],['VISUAL_INVALID_RESPONSE',/could not use/]]){
    scan={...completed,upload_review:{version:1,scene:'unavailable',features:'unavailable',scene_error:code,features_error:code}};
    await page.goto(`${origin}/scans/${scan.scan_id}`);
    await page.getByRole('alert').filter({hasText:words}).first().waitFor();
    assert.equal(await page.getByRole('alert').filter({hasText:words}).count(),2);
    assert.equal(await page.evaluate(()=>window.__sceneCalls||0),0);
    assert.equal(await page.evaluate(()=>window.__featureCalls||0),0);
  }
  console.log('PASS: actual sheep contradiction becomes inconclusive; descriptions survive; failure reasons reach the page without auto retry');

  const preparedScene={schema_version:1,status:'available',assessment:'tentative',model_version:SCENE_MODEL,model_revision:SCENE_REVISION,input_sha256:'a'.repeat(64),observation:'Saved during upload, no second wait.',changes_verdict:false,explanation_version:3,image_type:'logo',visual_assessment:'Synthetic review.'};
  scan={...completed,scene_analysis:preparedScene,feature_review:featureFixture(),upload_review:{version:1,scene:'completed',features:'completed'}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByText(preparedScene.observation,{exact:true}).waitFor();
  await page.getByRole('heading',{name:'Details to review',exact:true}).waitFor();
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>window.__sceneCalls||0),0);
  assert.equal(await page.evaluate(()=>window.__featureCalls||0),0);
  scan={...completed,upload_review:{version:1,scene:'unavailable',features:'unavailable'}};
  await page.goto(`${origin}/scans/${scan.scan_id}`);
  await page.getByRole('button',{name:'Retry image observations',exact:true}).waitFor();
  await page.getByRole('button',{name:'Retry visual review',exact:true}).waitFor();
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>window.__sceneCalls||0),0);
  assert.equal(await page.evaluate(()=>window.__featureCalls||0),0);
  await page.getByRole('button',{name:'Retry image observations',exact:true}).click();
  await page.getByText('Synthetic test observation, not a model prediction.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Retry visual review',exact:true}).click();
  await page.getByText('The model could not reliably assess these features.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>window.__sceneCalls),1);assert.equal(await page.evaluate(()=>window.__featureCalls),1);
  console.log('PASS: upload-prepared reviews show immediately; unavailable reviews require explicit free retry, never an automatic second wait');

  scan = completed;
  await page.goto(`${origin}/scan`);
  await page.getByLabel('Choose image for analysis').setInputFiles({ name: 'review.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByRole('button', { name: 'Analyze Now', exact: true }).click();
  await page.getByRole('heading', { name: 'Analysis Complete', exact: true }).waitFor();
  const colors = await page.getByRole('note').evaluate(el => ({
    foreground: getComputedStyle(el).color,
    background: getComputedStyle(el.parentElement).backgroundColor,
  }));
  const ratio = contrast(colors.foreground, colors.background);
  assert.ok(ratio >= 4.5, `Explanation text contrast ${ratio.toFixed(2)} must be >= 4.5`);
  await page.screenshot({ path: '.test-results/ui-regressions/scan.png', fullPage: true });
  console.log(`PASS: explanation contrast ${ratio.toFixed(2)}:1`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle Navigation Menu' }).click();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Subscription', exact: true }).click();
  await page.waitForURL(`${origin}/subscription`);
  await page.getByRole('heading', { name: 'Plans & payments', exact: true }).waitFor();
  assert.equal(await page.getByRole('navigation', { name: 'Mobile navigation' }).count(), 0, 'Menu closes after navigation');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow at 390px');
  console.log('PASS: small-screen Subscription navigation and menu dismissal');
  assert.equal(await page.getByRole('button',{name:'Checkout not configured',exact:true}).isDisabled(),true);
  await page.screenshot({path:'.test-results/ui-regressions/billing-disabled-mobile.png',fullPage:true});
  billing={...billing,enabled:true,offer:{...billing.offer,amount:19900,purchase_type:'one_time'},message:'Test mode only. No real money is charged.'};
  await page.goto(origin+'/subscription');
  const buy=page.getByRole('button',{name:'Continue to checkout',exact:true});
  await buy.waitFor();assert.equal(await buy.isDisabled(),true);
  await page.getByRole('checkbox',{name:/I understand this capstone checkout/}).check();
  await buy.evaluate(button=>{button.click();button.click();});
  await page.getByRole('alert').filter({hasText:'Test provider unavailable'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__checkoutCalls),1);
  await page.screenshot({path:'.test-results/ui-regressions/billing-retry-mobile.png',fullPage:true});
  billing={...billing,orders:[{id:'22222222-2222-4222-8222-222222222222',status:'pending',amount:19900,created_at:'2026-10-16T12:00:00Z',mode:'test'}]};
  await page.goto(origin+'/subscription?payment=returned');
  await page.getByText('Returning here does not confirm payment.',{exact:false}).waitFor();
  assert.equal(await page.getByText(/Pro is active until/).count(),0);
  await page.getByRole('button',{name:'Check payment',exact:true}).click();
  await page.getByText(/Pro is active until/).waitFor();
  await page.getByText('Payment confirmed',{exact:true}).waitFor();
  assert.equal(await page.getByText('Returning here does not confirm payment.',{exact:false}).count(),0);
  assert.equal(await page.evaluate(()=>window.__paymentChecks),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('heading',{name:'Plans & payments',exact:true}).click();
  await page.screenshot({path:'.test-results/ui-regressions/billing-confirmed-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'.test-results/ui-regressions/billing-confirmed-desktop.png',fullPage:true});
  console.log('PASS: test checkout configuration, consent, duplicate guard, retry, untrusted return and verified-plan display');

  await page.setViewportSize({width:1440,height:1000});
  const imageFile = {name:'review.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
  async function openUploader(path='/scan') {
    await page.goto(origin+path);
    if (path === '/dashboard') {
      assert.equal(await page.locator('input[type="file"]').count(),0,'Dashboard only navigates; it does not upload');
      await page.getByRole('link',{name:'Start Analysis',exact:true}).click();
      await page.waitForURL(origin+'/scan');
      assert.equal(await page.evaluate(()=>window.__uploads||0),0,'Navigation must not start a scan');
    }
    await page.getByLabel('Choose image for analysis',{exact:true}).setInputFiles(imageFile);
    return page.getByRole('button',{name:'Analyze Now',exact:true});
  }
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(origin+'/dashboard');
    const startAnalysis=page.getByRole('link',{name:'Start Analysis',exact:true});
    await startAnalysis.waitFor();
    assert.equal(await startAnalysis.getAttribute('href'),'/scan');
    assert.equal(await page.locator('input[type="file"]').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.waitForFunction(()=>{
      const heading=[...document.querySelectorAll('h2')].find(el=>el.textContent==='Recent Scans');
      if (!heading) return false;
      for (let el=heading;el;el=el.parentElement) if (Number(getComputedStyle(el).opacity)<1) return false;
      return true;
    });
    await page.screenshot({path:`.test-results/ui-regressions/dashboard-start-${width}.png`,fullPage:true});
    await startAnalysis.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(origin+'/scan');
    await page.getByRole('heading',{name:'Scan Image',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__uploads||0),0);
    const droppedFile=await page.evaluateHandle(base64=>{
      const transfer=new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'dropped.png',{type:'image/png'}));
      return transfer;
    },png);
    await page.getByLabel('Choose image for analysis').dispatchEvent('drop',{dataTransfer:droppedFile});
    await droppedFile.dispose();
    await page.getByText('dropped.png',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Analyze Now',exact:true}).isEnabled(),true);
    assert.equal(await page.evaluate(()=>window.__uploads||0),0,'Dropping selects a file; Analyze Now starts the scan');
  }
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS: dashboard CTA, keyboard/mobile navigation and Scan Image drag-and-drop without automatic uploads');
  for (const path of ['/scan','/dashboard']) {
    health='unavailable';
    await (await openUploader(path)).click();
    await page.getByRole('alert').filter({hasText:'AI service is not ready'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__uploads||0),0);
    health='ready'; remaining=0;
    await (await openUploader(path)).click();
    await page.getByRole('alert').filter({hasText:'no scans remaining today'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__uploads||0),0);
    remaining=4;
  }
  console.log('PASS: direct Scan Image and dashboard navigation block offline AI and exhausted allowance before uploading');

  uploadDelay=300;
  const submit=await openUploader();
  await submit.evaluate(el=>{el.click();el.click();});
  await page.getByRole('heading',{name:'Analysis Complete',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__uploads),1,'Rapid clicks submit only once');
  assert.equal(await page.getByRole('button',{name:'Scan saved',exact:true}).isDisabled(),true);
  console.log('PASS: duplicate-click guard and saved-scan resubmission prevention');

  scan={...completed,status:'failed',analysis:null,credit_status:'not_charged'};
  await (await openUploader()).click();
  await page.getByRole('heading',{name:'Analysis Failed',exact:true}).waitFor();
  await page.getByText('No scan credit used. This failed scan stays in your history.',{exact:true}).waitFor();
  await page.getByRole('link',{name:'View saved scan',exact:true}).click();
  await page.getByRole('heading',{name:'review.png',exact:true}).waitFor();
  console.log('PASS: failed upload shows credit notice and opens its saved result');

  scan=completed; uploadFailure=true;
  await (await openUploader()).click();
  await page.getByRole('alert').filter({hasText:'Check History before uploading again'}).waitFor();
  await page.getByRole('link',{name:'Check Scan History',exact:true}).waitFor();
  uploadFailure=false;
  console.log('PASS: upload connection errors guide users to history');

  uploadDelay=1000;
  await (await openUploader('/dashboard')).click();
  await page.waitForFunction(()=>window.__uploads===1);
  await page.getByRole('link',{name:'Scan History',exact:true}).click();
  await page.getByRole('heading',{name:'Scan History',exact:true}).waitFor();
  await page.waitForTimeout(1300); // Let the old mocked request complete after unmount.
  assert.equal(new URL(page.url()).pathname,'/history','Old uploads must not hijack navigation');
  uploadDelay=0;
  console.log('PASS: leaving Scan Image after dashboard navigation prevents late-result navigation');

  scan=completed;
  await page.goto(origin+'/history');
  await page.getByLabel('Scan ID 1',{exact:true}).waitFor();
  assert.equal((await page.locator('body').innerText()).includes(scan.scan_id),false,'Raw UUID must not appear in History');
  await page.screenshot({path:'.test-results/ui-regressions/history-desktop.png',fullPage:true});
  const deleteButton=page.getByRole('button',{name:'Delete Scan 1',exact:true});
  await deleteButton.click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('heading',{name:'Delete Scan 1 permanently?',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Cancel',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(),0);
  assert.equal(await page.evaluate(()=>window.__deletes||0),0,'Dismissal must not delete');
  await deleteButton.click();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__deletes||0),0);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'.test-results/ui-regressions/history-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await deleteButton.click();
  await page.screenshot({path:'.test-results/ui-regressions/delete-mobile.png',fullPage:true});
  const bounds=await dialog.boundingBox();
  assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390,'Dialog fits mobile viewport');
  await page.evaluate(()=>window.__deleteFailure=true);
  await dialog.getByRole('button',{name:'Delete permanently',exact:true}).click();
  await dialog.getByRole('alert').filter({hasText:'Deletion incomplete'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'review.png',exact:true}).count(),1,'Failed deletion keeps the row');
  await page.evaluate(()=>window.__deleteFailure=false);
  await dialog.getByRole('button',{name:'Delete permanently',exact:true}).evaluate(el=>{el.click();el.click();});
  await page.getByRole('status').filter({hasText:'Scan 1 permanently deleted'}).waitFor();
  await page.getByRole('heading',{name:'No scans found',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__deletes),2,'One failed request plus exactly one retry');
  await page.getByText('Showing 0–0 of 0 scans',{exact:true}).waitFor();
  scan={...completed,status:'processing',analysis:null};
  await page.goto(origin+'/history');
  await page.getByRole('button',{name:'Delete Scan 1',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Delete Scan 1',exact:true}).isDisabled(),true);
  scan={...completed,deletion_pending:true};
  await page.goto(origin+'/history');
  await page.getByText('Deletion incomplete. Retry Delete to finish.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Details',exact:true}).count(),0,'Partial deletions cannot open missing files');
  assert.equal(await page.getByRole('button',{name:'Delete Scan 1',exact:true}).innerText(),'Retry Delete');
  console.log('PASS: friendly IDs, responsive delete dialog, cancellation, retry, duplicate guard, and processing protection');
  scan=completed;
  await page.setViewportSize({width:1440,height:1000});

  await page.goto(origin+'/profile');
  await page.getByRole('button',{name:'Edit profile',exact:true}).click();
  await page.getByRole('textbox',{name:'First name',exact:true}).fill('Updated');
  await page.getByRole('textbox',{name:'Last name',exact:true}).fill('Name');
  await page.evaluate(()=>window.__profileFailure=true);
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Could not save profile'}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'First name',exact:true}).inputValue(),'Updated');
  await page.evaluate(()=>window.__profileFailure=false);
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Profile changes saved'}).waitFor();
  await page.getByRole('button',{name:'Edit profile',exact:true}).click();
  await page.getByRole('textbox',{name:'First name',exact:true}).fill('Unsaved');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'First name',exact:true}).count(),0);
  assert.ok(await page.getByText('Updated',{exact:true}).count()>0);
  await page.screenshot({path:'.test-results/ui-regressions/profile-edit.png',fullPage:true});
  await page.goto(origin+'/forgot-password');
  await page.getByRole('textbox',{name:'Email address',exact:true}).fill('reset@example.test');
  await page.evaluate(()=>window.__resetFailure=true);
  await page.getByRole('button',{name:'Send reset link',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Too many attempts'}).waitFor();
  await page.evaluate(()=>window.__resetFailure=false);
  await page.getByRole('button',{name:'Send reset link',exact:true}).click();
  await page.getByRole('heading',{name:'Check your email',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/Resend available in/}).isDisabled(),true);
  await page.screenshot({path:'.test-results/ui-regressions/password-reset.png',fullPage:true});
  await page.goto(origin+'/reset-password?mode=resetPassword&oobCode=expired');
  await page.getByRole('heading',{name:'Let’s get you a new link'}).waitFor();
  await page.goto(origin+'/reset-password?mode=resetPassword&oobCode=synthetic');
  await page.locator('#new-password').fill('SyntheticOnly!123');
  await page.locator('#confirm-password').fill('DifferentOnly!123');
  await page.getByRole('button',{name:'Save new password'}).click();
  await page.getByRole('alert').filter({hasText:'don’t match'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__passwordSaved||0),0);
  await page.locator('#confirm-password').fill('SyntheticOnly!123');
  await page.getByRole('button',{name:'Show new password'}).click();
  assert.equal(await page.locator('#new-password').getAttribute('type'),'text');
  await page.screenshot({path:'.test-results/ui-regressions/new-password-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Save new password'}).click();
  await page.getByRole('heading',{name:'Password updated',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__passwordSaved),1);
  await page.getByRole('link',{name:'Back to sign in',exact:true}).click();
  assert.equal(new URL(page.url()).pathname,'/login');
  await page.goto(origin+'/scans/'+completed.scan_id);
  const feedback=page.getByRole('region',{name:'Scan feedback'});
  await feedback.getByRole('radio',{name:'4 stars',exact:true}).focus();
  await page.keyboard.press('Space');
  assert.equal(await feedback.getByRole('radio',{name:'4 stars',exact:true}).isChecked(),true);
  await feedback.getByRole('textbox',{name:'Comment (optional)',exact:true}).fill('Helpful explanation');
  await page.setViewportSize({width:390,height:844});
  await feedback.screenshot({path:'.test-results/ui-regressions/feedback-form-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>window.__feedbackFailure=true);
  await feedback.getByRole('button',{name:'Submit feedback',exact:true}).click();
  await feedback.getByRole('alert').filter({hasText:'Could not save feedback'}).waitFor();
  await page.evaluate(()=>window.__feedbackFailure=false);
  await feedback.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  await feedback.getByRole('status').filter({hasText:'Your feedback has been submitted'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__feedbackWrites),2,'one failed request plus one successful request, no double submission');
  assert.deepEqual(await page.evaluate(()=>window.__savedFeedback),{rating:4,comment:'Helpful explanation'});
  assert.equal(await feedback.getByRole('textbox').count(),0);
  assert.equal(await feedback.getByRole('button',{name:'Submit feedback'}).count(),0);
  await page.setViewportSize({width:390,height:844});
  await feedback.screenshot({path:'.test-results/ui-regressions/feedback-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1440,height:1000});
  initialFeedback={rating:4,comment:'Helpful explanation'};
  await page.reload();
  await feedback.getByRole('status').filter({hasText:'Your feedback has been submitted'}).waitFor();
  assert.equal(await feedback.getByRole('radio').count(),0,'saved feedback stays read-only after reload');
  await feedback.getByText('Helpful explanation',{exact:true}).waitFor();
  initialFeedback=null;
  await page.reload();
  await feedback.getByText('Very helpful',{exact:true}).click();
  await page.evaluate(()=>window.__feedbackLostResponse=true);
  await feedback.getByRole('button',{name:'Submit feedback',exact:true}).click();
  await feedback.getByRole('status').filter({hasText:'Your feedback has been submitted'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__feedbackWrites),1,'lost response reconciles without another write');
  console.log('PASS: profile edit/retry/cancel, password reset, immutable feedback, reload, lost response, double-submit protection and narrow layout');

  crash=true;
  await page.goto(origin+'/dashboard');
  await page.getByRole('heading',{name:'This page could not be displayed',exact:true}).waitFor();
  await page.getByRole('link',{name:'Open Scan History',exact:true}).waitFor();
  crash=false;
  console.log('PASS: unexpected render errors show a recovery screen');
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, [], 'No real backend or external requests expected');
  console.log('UI regressions passed with mock data; no cloud accounts or uploads used.');
} finally {
  if (browser) await browser.close();
  await server.close();
}
