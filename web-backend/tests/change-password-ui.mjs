// Exercise the real password-change adapter and UI with a fake Firebase SDK.
// No request may reach Firebase and no real account/password is changed.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const sdk=`
const user={uid:'password-fixture',email:'profile@example.test',displayName:'Profile Fixture',getIdToken:async force=>{if(force)window.__tokenRefreshes=(window.__tokenRefreshes||0)+1;return 'fixture-token';}};
const auth={currentUser:user,authStateReady:()=>Promise.resolve()};
export const getAuth=()=>auth,connectAuthEmulator=()=>{},onAuthStateChanged=(auth,cb)=>cb(user);
export const browserLocalPersistence={},browserSessionPersistence={};
export const setPersistence=async()=>{},createUserWithEmailAndPassword=async()=>{},signInWithEmailAndPassword=async()=>{},signOut=async()=>{},updateProfile=async()=>{},sendPasswordResetEmail=async()=>{},verifyPasswordResetCode=async()=>{},confirmPasswordReset=async()=>{};
export const EmailAuthProvider={credential:(email,password)=>({email,password})};
export async function reauthenticateWithCredential(subject,credential){
  window.__reauthChecks=(window.__reauthChecks||0)+1;
  if(subject!==user||credential.email!==user.email)throw Error('Wrong account');
  if(window.__offline)throw Object.assign(Error('Offline'),{code:'auth/network-request-failed'});
  if(credential.password!=='CurrentFixture!123')throw Object.assign(Error('Incorrect'),{code:'auth/invalid-credential'});
  window.__verified=true;
}
export async function updatePassword(subject,password){
  if(subject!==user||!window.__verified)throw Error('Reauthentication required');
  window.__passwordUpdates=(window.__passwordUpdates||0)+1;
  window.__updatedPassword=password;
  await new Promise(resolve=>setTimeout(resolve,200));
}
`;
const profile={user:{user_id:'password-fixture',first_name:'Profile',last_name:'Fixture',email:'profile@example.test'},plan:{name:'Pro (Test)',scan_limit:null}};
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false,proxy:{}}});
let browser;
try{
  await server.listen();
  const origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  const blocked=[],errors=[];
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin){blocked.push(url.origin);return route.abort();}
    if(url.pathname.endsWith('/firebase_auth.js'))return route.fulfill({contentType:'application/javascript',body:sdk});
    if(url.pathname==='/api/config')return route.fulfill({json:{mode:'cloud-hybrid',media:'cloudinary',firebase:{apiKey:'fixture',projectId:'authentiscan-bc704'},authEmulatorUrl:null}});
    if(url.pathname==='/api/v1/auth/me')return route.fulfill({json:{success:true,data:profile}});
    if(url.pathname.startsWith('/api/')){blocked.push(url.pathname);return route.abort();}
    return route.continue();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(15000);
  await mkdir('.test-results/change-password',{recursive:true});
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1100});
    await page.goto(origin+'/profile');
    const form=page.getByRole('form',{name:'Change password'});
    await form.waitFor();
    assert.equal(await page.getByText('Pro (Test)',{exact:true}).count(),0);
    assert.equal(await page.getByRole('link',{name:'Reset password',exact:true}).count(),0);
    const current=form.getByLabel('Current password',{exact:true});
    const next=form.getByLabel('New password',{exact:true});
    const confirm=form.getByLabel('Confirm new password',{exact:true});
    const submit=form.getByRole('button',{name:'Update password',exact:true});
    await current.fill('CurrentFixture!123');await next.fill('NewFixture!456');await confirm.fill('MismatchFixture!789');
    await submit.click();
    await form.getByRole('alert').filter({hasText:'do not match'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__reauthChecks||0),0);
    await current.fill('WrongFixture!123');await confirm.fill('NewFixture!456');await submit.click();
    await form.getByRole('alert').filter({hasText:'current password is incorrect'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__passwordUpdates||0),0);
    assert.equal(await current.inputValue(),'');
    await current.fill('CurrentFixture!123');await next.fill('NewFixture!456');await confirm.fill('NewFixture!456');
    await page.evaluate(()=>window.__offline=true);await submit.click();
    await form.getByRole('alert').filter({hasText:'Check your internet connection'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__passwordUpdates||0),0);
    await page.evaluate(()=>window.__offline=false);
    await current.fill('CurrentFixture!123');await next.fill('NewFixture!456');await confirm.fill('NewFixture!456');
    await form.getByRole('button',{name:'Show new password',exact:true}).click();
    assert.equal(await next.getAttribute('type'),'text');
    await submit.evaluate(button=>{button.click();button.click();});
    await form.getByRole('status').filter({hasText:'Password updated successfully'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__passwordUpdates),1);
    assert.equal(await page.evaluate(()=>window.__tokenRefreshes),1);
    assert.equal(await current.inputValue(),'');assert.equal(await next.inputValue(),'');assert.equal(await confirm.inputValue(),'');
    assert.equal(await next.getAttribute('type'),'password');
    assert.equal(new URL(page.url()).pathname,'/profile');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:'.test-results/change-password/profile-'+width+'.png',fullPage:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log('PASS: desktop/mobile profile password change, mismatch, wrong current password, network failure, visibility, duplicate-submit guard, token refresh, cleared fields and Pro label. No real accounts changed.');
}finally{if(browser)await browser.close();await server.close();}
