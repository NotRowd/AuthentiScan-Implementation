// Explicit live-project smoke test. Creates one labelled synthetic account and scan.
// Never imports, deletes, or alters existing users. No credentials are logged.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

assert.equal(process.env.AUTHENTISCAN_LIVE_TEST,'yes','Set AUTHENTISCAN_LIVE_TEST=yes to authorize a labelled live test account/scan.');
const base='http://127.0.0.1:5174';
const config=await (await fetch(base+'/api/config')).json();
assert.equal(config.mode,'cloud-hybrid');
assert.equal(config.firebase.projectId,'authentiscan-bc704');
assert.equal(config.authEmulatorUrl,null);
const runId=randomUUID();
await mkdir('.test-results',{recursive:true});
const evidence=`.test-results/cloud-smoke-${runId}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.setDefaultTimeout(45000);
const email=`migration-check-${runId}@example.test`,password=`TestOnly!${randomUUID()}`;
const checks=[];
let scanId;
try {
  await page.goto(base+'/register');
  await page.getByPlaceholder('Alex',{exact:true}).fill('Migration');
  await page.getByPlaceholder('Johnson',{exact:true}).fill('Verification');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('input[type=checkbox]').check();
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard'); checks.push('live Firebase signup and profile');
  await page.goto(base+'/scan');
  await page.getByLabel('Choose image for analysis').setInputFiles('src/assets/hero.png');
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/v1/scans')&&r.request().method()==='POST',{timeout:155000});
  await page.getByRole('button',{name:'Upload Image for Analysis',exact:true}).click();
  const response=await saved,body=await response.json();
  assert.equal(response.status(),201,'Scan submission must succeed');
  assert.equal(body.data.status,'completed','AI scan must complete');
  scanId=body.data.scan_id; checks.push('real AI classification saved through cloud backend');
  await page.getByRole('link',{name:'View full saved result'}).click();
  await page.getByRole('heading',{name:'Scan details',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.images].filter(i=>['Original image','Grad-CAM heatmap'].includes(i.alt)&&i.complete&&i.naturalWidth>0).length===2);
  checks.push('authenticated original image and heatmap');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:`Export PDF for scan ${scanId}`,exact:true}).click()]);
  assert.equal(await download.failure(),null);
  await download.saveAs(evidence+'.pdf'); checks.push('PDF download');
  await page.goto(base+'/history'); await page.getByText('hero.png',{exact:true}).waitFor();
  await page.reload(); await page.getByText('hero.png',{exact:true}).waitFor(); checks.push('history survives page reload');
  await page.getByRole('button',{name:'Log Out',exact:true}).first().click();
  await page.waitForURL('**/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.locator('button[type=submit]').click(); await page.waitForURL('**/dashboard');
  await page.goto(base+'/history'); await page.getByText('hero.png',{exact:true}).waitFor();
  checks.push('cloud login restores saved history');
  assert.deepEqual(errors,[]); checks.push('no uncaught browser errors');
  await writeFile(evidence+'.json',JSON.stringify({runId,project:config.firebase.projectId,email,scanId,checks,scope:'Cloud Auth/Firestore with local images and AI; not full hosting'},null,2));
  console.log('Cloud browser smoke test passed. Checks:',checks.join('; '));
  console.log('Evidence:',evidence+'.json');
} catch(e) {
  await writeFile(evidence+'.json',JSON.stringify({runId,email,scanId,checks,status:'incomplete',error:e.name},null,2));
  console.error('Cloud smoke test incomplete. Completed checks:',checks.join('; '));
  throw e;
} finally {await browser.close();}
