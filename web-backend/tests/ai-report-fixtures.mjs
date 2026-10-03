import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {normalizeAnalysis} from '../server/ai-contract.mjs';
import {buildScanReport} from '../server/scanReport.cjs';

const root=fileURLToPath(new URL('../../ai-work/2026-09-27/',import.meta.url));
const response=JSON.parse(await fs.readFile(path.join(root,'real-smoke/response.json'),'utf8'));
const result=normalizeAnalysis(response.data);
assert.equal(result.inference_contract_version,2);
assert.equal(result.gradcam.target,'authentic');
const heatmap=await fs.readFile(path.join(root,'real-smoke',path.basename(response.data.heatmap_path)));
const originalName='AI-baseline-diagnostic-'.repeat(7)+'image.png';
const base={scan_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',result_id:'test',status:'completed',original_file_name:originalName,
  created_at:'2026-09-27T10:00:00Z',analyzed_at:'2026-09-27T10:00:05Z'};
const out=path.join(root,'report-qa');await fs.mkdir(out,{recursive:true});
const fixtures={
  available:{...base,...result},
  uncertain:{...base,...result,verdict:'uncertain',authentic_score:.38,ai_generated_score:.62,confidence_score:.62,
    gradcam:{...result.gradcam,status:'unavailable',target:null,reason:'uncertain_prediction'}},
  legacy:{...base,verdict:'authentic',authentic_score:.45,ai_generated_score:.55,confidence_score:.55,model_version:'legacy-test-fixture'}
};
for(const [name,scan] of Object.entries(fixtures)) {
  const bytes=await buildScanReport(scan,name==='uncertain'?null:heatmap,new Date('2026-09-27T10:01:00Z'));
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  await fs.writeFile(path.join(out,name+'.pdf'),bytes);
}
console.log('Real AI contract accepted by backend. Three diagnostic PDFs generated (no cloud writes).');
