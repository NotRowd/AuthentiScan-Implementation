import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

await mkdir('.test-results',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900}});
const unexpected=[];
await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(!['127.0.0.1','localhost'].includes(url.hostname)){unexpected.push(url.origin);return route.abort();}
  return route.continue();
});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const email=`browser-${randomUUID()}@example.test`,password='LocalBrowserTest!123';
async function create(email) {
  await page.locator('#email').fill(email);await page.locator('#password').fill(password);
  await page.getByRole('button',{name:'Create test account',exact:true}).click();
  await page.locator('#profile-panel').waitFor({state:'visible'});
  await page.locator('#first-name').fill('Browser');await page.locator('#last-name').fill('Test');
  await page.getByRole('button',{name:'Save profile',exact:true}).click();
  await page.locator('#account-panel').waitFor({state:'visible'});
}
try{
  await page.goto('http://127.0.0.1:5174/foundation.html');
  await page.locator('#auth-panel').waitFor({state:'visible'});
  await create(email);
  assert.equal(await page.locator('#remaining').textContent(),'5 / 5 scans available');
  await page.locator('#image').setInputFiles({name:'browser-test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==','base64')});
  await page.getByRole('button',{name:'Test image storage',exact:true}).click();
  await page.getByText('Image saved in local emulator. No AI analysis or scan credit used.',{exact:true}).waitFor();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download test copy',exact:true}).click();
  const download=await downloadPromise;assert.equal(download.suggestedFilename(),'browser-test.png');
  await page.screenshot({path:'.test-results/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'.test-results/narrow.png',fullPage:true});
  await page.locator('#account-panel .logout').click();
  await page.locator('#auth-panel').waitFor({state:'visible'});
  await page.locator('#email').fill(email);await page.locator('#password').fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Download test copy',exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Download test copy',exact:true}).waitFor();
  await page.locator('#account-panel .logout').click();await page.locator('#auth-panel').waitFor({state:'visible'});
  await create(`other-${randomUUID()}@example.test`);
  await page.getByText('No local test images yet.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await writeFile('.test-results/browser-result.json',JSON.stringify({status:'passed',email,checks:['signup','profile','upload','download','login','session reload','account isolation','390px layout','no page errors','no external browser requests']},null,2));
  console.log('Browser checks passed: signup, profile, upload/download, login, reload, isolation, narrow layout; no page errors or external requests.');
}finally{await browser.close();}
