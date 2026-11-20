import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const base='https://authentiscan.52-65-43-68.sslip.io';
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=['index.html','theme-init.js',...(await readdir('dist/assets')).map(f=>'assets/'+f)];
for(const file of files){const response=await fetch(base+'/'+file);assert.equal(response.status,200,file);assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(await readFile('dist/'+file)),file);}
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({colorScheme:'light',reducedMotion:'reduce'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await mkdir('.test-results/theme/live',{recursive:true});
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/login');const picker=page.getByRole('combobox',{name:'Appearance',exact:true});await picker.selectOption('dark');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();await page.screenshot({path:`.test-results/theme/live/dark-${width}.png`,fullPage:true});await page.reload();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');await picker.selectOption('light');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
 }
 await page.getByRole('combobox',{name:'Appearance',exact:true}).selectOption('system');await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');await page.emulateMedia({media:'print'});await page.waitForFunction(()=>getComputedStyle(document.body).backgroundColor==='rgb(255, 255, 255)');assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 255, 255)');
 assert.deepEqual(errors,[]);const result={status:'passed',verified_files:files.length,checks:['Live public HTTPS','Built assets exact SHA256','Desktop and mobile controls','Light/Dark','Reload persistence','System changes','Print white background','No page errors'],deployed:'20261120T042523Z'};await writeFile('../output/theme-option-b-20261120/live-checks.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
