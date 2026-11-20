// Render an offline benchmark report. Never accesses accounts or cloud services.
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const job=process.argv[2];
if(!job)throw new Error('Pass the benchmark run directory.');
const review=resolve(job,'review'),output=join(review,'screenshots');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1200,height:1000},deviceScaleFactor:1});
  await page.route('http://**/*',route=>route.abort());
  await page.route('https://**/*',route=>route.abort());
  await page.goto(pathToFileURL(join(review,'visual-review.html')).href);
  await page.locator('section').first().waitFor();
  await page.screenshot({path:join(output,'summary.png')});
  for(const [index,name] of [[9,'test-authentic-control'],[10,'test-semantic-edit'],[11,'test-random-edit']]){
    const section=page.locator('section').nth(index);
    await section.screenshot({path:join(output,`${name}.png`)});
  }
  console.log('Saved real benchmark review screenshots:',output);
}finally{await browser.close();}
