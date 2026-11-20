// Synthetic PDFs only. Rendered pages remain test artifacts, not user reports.
import {readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const dir='.test-results/report-layout';
const files=await readdir(dir);
for(const variant of ['sample','uncertain','missing','invalid','failed','long']){
  const text=execFileSync(process.env.PDF_QA_PYTHON||'python',['-c','import sys; from pypdf import PdfReader; print("\\n".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))',`${dir}/${variant}.pdf`],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}}).replace(/\s+/g,' ');
  if(variant==='sample'){
    assert.match(text,/AI-generated score \(82.00%\) met the saved 60%/);
    assert.match(text,/Yellow is not proof of editing/);
    assert.match(text,/Objects only - not edited regions, authenticity, or impossible scenes/);
    assert.match(text,/Detection score: 92.00%/);
  }
  if(variant==='uncertain')assert.match(text,/neither score reached the required 60%/);
  if(variant==='failed')assert.doesNotMatch(text,/because its AI-generated score/);
  if(variant==='invalid')assert.doesNotMatch(text,/INVALID SCENE MUST NOT APPEAR/);
  const pages=files.filter(f=>new RegExp(`^${variant}-final-\\d+\\.png$`).test(f)).sort();
  assert.ok(pages.length,'Render fixtures with pdftoppm before running this check');
  const tiles=await Promise.all(pages.map(async(f,i)=>({input:await sharp(`${dir}/${f}`).resize({width:390}).png().toBuffer(),left:i%3*400,top:Math.floor(i/3)*565})));
  await sharp({create:{width:Math.min(3,pages.length)*400,height:Math.ceil(pages.length/3)*565,channels:3,background:'#dce7ee'}}).composite(tiles).png().toFile(`${dir}/${variant}-contact.png`);
}
console.log('PASS saved decision reasons, heatmap/object limits, failed/invalid report states; QA contact sheets created.');
