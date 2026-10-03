import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const saved=JSON.parse(await readFile('.test-results/full-web-result.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();page.setDefaultTimeout(30000);
  await page.goto('http://127.0.0.1:5174/login');
  await page.getByLabel('Email Address').fill(saved.email);await page.getByLabel('Password',{exact:true}).fill(saved.password);
  await page.locator('button[type=submit]').click();await page.waitForURL('**/dashboard');
  await page.getByText('Connection tools',{exact:true}).click();
  await page.getByRole('button',{name:'Check system readiness'}).click();await page.getByText('Unavailable',{exact:true}).waitFor();
  const stats=await page.evaluate(async()=>{const api=await import('/src/services/api.js');return (await api.fetchUserStats()).data;});
  assert.equal(stats.total_scans,1);assert.equal(stats.scans_remaining,4);
  await page.goto('http://127.0.0.1:5174/scans/'+saved.scanId);
  await page.waitForFunction(()=>[...document.images].filter(i=>['Original image','Grad-CAM heatmap'].includes(i.alt)&&i.complete&&i.naturalWidth>0).length===2);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:`Export PDF for scan ${saved.scanId}`,exact:true}).click()]);
  assert.equal(await download.failure(),null);
  const after=await page.evaluate(async()=>{const api=await import('/src/services/api.js');return (await api.fetchUserStats()).data;});
  assert.equal(after.scans_remaining,4);
  console.log('Restart passed: account, scan, allowance, original, heatmap and PDF persisted with AI stopped.');
}finally{await browser.close();}
