import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

await mkdir('.test-results',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const errors=[],external=[];
await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['http:','https:'].includes(url.protocol)&&!['localhost','127.0.0.1'].includes(url.hostname)){external.push(url.origin);return route.abort();}
  return route.continue();
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
const email=`fullweb-${randomUUID()}@example.test`,password='LocalBrowserOnly!234';
try{
  await page.goto('http://127.0.0.1:5174/register');
  await page.getByPlaceholder('Alex',{exact:true}).fill('Firebase');
  await page.getByPlaceholder('Johnson',{exact:true}).fill('Tester');
  await page.locator('input[type=email]').fill(email);await page.locator('input[type=password]').fill(password);
  await page.locator('input[type=checkbox]').check();
  await page.locator('button[type=submit]').click();await page.waitForURL('**/dashboard');
  await page.getByRole('heading',{name:'Welcome back, Firebase.'}).waitFor();
  await page.getByText('Connection tools',{exact:true}).click();
  await page.getByRole('button',{name:'Check system readiness'}).click();await page.getByText('Ready',{exact:true}).waitFor();
  await page.goto('http://127.0.0.1:5174/scan');
  await page.getByLabel('Choose image for analysis').setInputFiles('src/assets/hero.png');
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/v1/scans')&&r.request().method()==='POST',{timeout:155000});
  await page.getByRole('button',{name:'Upload Image for Analysis',exact:true}).click();
  const response=await saved,body=await response.json();assert.equal(response.status(),201,JSON.stringify(body));assert.equal(body.data.status,'completed',JSON.stringify(body));
  const scanId=body.data.scan_id;
  await page.getByText('Analysis completed',{exact:true}).waitFor();
  await page.getByAltText('Grad-CAM heatmap',{exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.images].some(i=>i.alt==='Grad-CAM heatmap'&&i.complete&&i.naturalWidth>0));
  await page.screenshot({path:'.test-results/firebase-web-scan.png',fullPage:true});
  await page.getByRole('link',{name:'View full saved result'}).click();await page.getByRole('heading',{name:'Scan details',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.images].filter(i=>['Original image','Grad-CAM heatmap'].includes(i.alt)&&i.complete&&i.naturalWidth>0).length===2);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:`Export PDF for scan ${scanId}`,exact:true}).click()]);
  assert.equal(await download.failure(),null);await download.saveAs('.test-results/firebase-web-report.pdf');
  await page.screenshot({path:'.test-results/firebase-web-details.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'.test-results/firebase-web-narrow.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5174/history');await page.getByText('hero.png',{exact:true}).waitFor();
  await page.reload();await page.getByText('hero.png',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Log Out',exact:true}).first().click();await page.waitForURL('**/login');
  await page.getByLabel('Email Address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.locator('button[type=submit]').click();await page.waitForURL('**/dashboard');
  await page.goto('http://127.0.0.1:5174/history');await page.getByText('hero.png',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await writeFile('.test-results/full-web-result.json',JSON.stringify({email,password,scanId,model:body.data.analysis.model_version,checks:['signup','real AI classification','private heatmap','details original','PDF download','390px layout','history','refresh persistence','logout/login','no browser exceptions','no remote browser calls']},null,2));
  console.log('Full Firebase web browser workflow passed:',scanId);
}catch(e){await page.screenshot({path:'.test-results/firebase-browser-failure.png',fullPage:true}).catch(()=>{});console.error('Browser errors:',errors);throw e;}
finally{await browser.close();}
