// Actual offline model -> loopback HTTP -> backend adapter. No account/cloud writes.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startScene} from '../scripts/scene-service.mjs';
import {explainScene} from '../server/scene.mjs';
process.env.AUTHENTISCAN_LOCALIZATION_MODE='experimental';
const stop=await startScene();
try{
  const sources=[new URL('../../ai-localization/datasets/supervised-localization-v1/assets/validation/real/406129.png',import.meta.url)];
  if(process.env.SCENE_SMOKE_IMAGE)sources.push(process.env.SCENE_SMOKE_IMAGE);
  const results=[];
  for(const source of sources){
    const bytes=await readFile(source),start=performance.now(),result=await explainScene(bytes);
    assert.equal(result.input_sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.assessment,'tentative');assert.equal(result.changes_verdict,false);
    assert.equal(result.explanation_version,2);assert.ok(result.visual_assessment.length>0);
    assert.ok(result.observation.length>0);assert.equal('verdict' in result,false);
    const record={seconds:(performance.now()-start)/1000,result};results.push(record);console.log(JSON.stringify(record));
  }
  await mkdir('.test-results/scene',{recursive:true});
  await writeFile('.test-results/scene/real-inference.json',JSON.stringify({accuracy_validated:false,cloud_writes:false,results},null,2));
  console.log('PASS: real local scene inference and backend response contract. This does not establish anomaly accuracy.');
}finally{stop();}
