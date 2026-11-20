import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeFeatureReview} from '../shared/feature-review-contract.mjs';
import {visualErrorMessage} from '../shared/visual-review-errors.mjs';
import {explainScene} from '../server/scene.mjs';
import {reviewFeatures} from '../server/feature-review.mjs';
import {prepareUploadReview} from '../server/upload-review.mjs';

test('exact returned and saved findings normalize individually; original input stays intact',()=>{
  const cases=JSON.parse(readFileSync(new URL('./fixtures/visual-review-regression.json',import.meta.url)));
  for(const row of cases){
    const before=JSON.stringify(row.features),review=normalizeFeatureReview(row.features);
    assert.equal(JSON.stringify(row.features),before);
    if(row.sample==='sheep-original'){
      assert.equal(review.findings[0].status,'unable_to_assess');
      assert.match(review.findings[0].observation,/inconclusive/);
      assert.deepEqual(review.findings.slice(1),row.features.findings.slice(1));
    }else assert.deepEqual(review,row.features);
    assert.equal(review.changes_verdict,false);
  }
});

test('both adapters preserve fixed failure reasons through upload status and user messages',async t=>{
  t.mock.method(console,'warn',()=>{});
  let response;
  t.mock.method(globalThis,'fetch',async()=>{
    if(response instanceof Error)throw response;
    return response();
  });
  for(const [code,value,word] of [
    ['VISUAL_BUSY',()=>Response.json({code:'VISUAL_BUSY',message:'PRIVATE'},{status:429}),/busy/],
    ['VISUAL_INVALID_RESPONSE',()=>Response.json({code:'VISUAL_INVALID_RESPONSE'},{status:502}),/could not use/],
    ['VISUAL_TIMEOUT',()=>Response.json({code:'VISUAL_TIMEOUT'},{status:504}),/too long/],
    ['VISUAL_OFFLINE',new TypeError('PRIVATE'),/offline/],
  ]){
    response=value;
    for(const fn of [explainScene,reviewFeatures])await assert.rejects(fn(Buffer.from('fixture')),error=>error.code===code);
    const result=await prepareUploadReview(Buffer.from('fixture'),'a'.repeat(64),{explainScanScene:explainScene,reviewImageFeatures:reviewFeatures});
    assert.equal(result.upload_review.scene_error,code);assert.equal(result.upload_review.features_error,code);
    const message=visualErrorMessage(code);
    assert.match(message,word);assert.match(message,/credits are unchanged/);assert.doesNotMatch(message,/PRIVATE|restart/);
  }
});
