// Real offline inference through the startup helper + backend adapter. No account/cloud writes.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startLocalization} from '../scripts/localization-service.mjs';
import {localizeImage} from '../server/localization.mjs';
import {localizationPreview} from '../server/localization-preview.mjs';

process.env.AUTHENTISCAN_LOCALIZATION_MODE='experimental';
const stop=await startLocalization();
try{
  const results=[];
  for(const asset of ['real/406129.png','fake/segm_flux1dev/406129.png','fake/random_flux1dev/406129.png']){
    const bytes=await readFile(new URL('../../ai-localization/datasets/supervised-localization-v1/assets/validation/'+asset,import.meta.url));
    const start=performance.now(),result=await localizeImage(bytes);
    assert.ok(['available','uncertain'].includes(result.status));
    assert.equal(result.validation_status,'failed');assert.equal(result.release_approved,false);
    assert.equal(result.input_sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.threshold,.97);assert.equal(result.usage_mode,'experimental');
    assert.equal('verdict' in result,false);
    assert.equal(result.score_grid.length,1024);assert.equal(result.score_scale,10000);
    assert.ok((await localizationPreview(bytes,result)).length>0);
    results.push({asset,seconds:(performance.now()-start)/1000,result});
    console.log(JSON.stringify({asset,status:result.status,cells:result.mask?.reduce((a,b)=>a+b,0)??0,seconds:results.at(-1).seconds}));
  }
  assert.ok(results.some(r=>r.result.status==='available'),'Known validation example must retain its actual candidate map');
  assert.ok(results.some(r=>r.result.status==='uncertain'),'No-region example must abstain');
  await mkdir('.test-results/experimental-localization',{recursive:true});
  await writeFile('.test-results/experimental-localization/real-inference.json',JSON.stringify({production_approved:false,cloud_writes:false,results},null,2));
  console.log('PASS: real model -> HTTP service -> backend normalization -> aligned preview');
}finally{stop();}
