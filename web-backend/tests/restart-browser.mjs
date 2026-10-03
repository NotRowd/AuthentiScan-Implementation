import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {email}=JSON.parse(await readFile('.test-results/browser-result.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:5174/foundation.html');
  await page.locator('#auth-panel').waitFor({state:'visible'});
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('LocalBrowserTest!123');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Download test copy',exact:true}).waitFor();
  assert.equal(await page.locator('#remaining').textContent(),'5 / 5 scans available');
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download test copy',exact:true}).click();
  const download=await downloadPromise;
  const bytes=await readFile(await download.path());
  assert.equal(bytes.toString('base64'),'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==');
  console.log('Restart verification passed: Auth account, Firestore profile, allowance, and Storage image survived export/import.');
}finally{await browser.close();}
