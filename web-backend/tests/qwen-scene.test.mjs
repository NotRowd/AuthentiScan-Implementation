import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScene,isCurrentScene,SCENE_MODEL,SCENE_REVISION} from '../shared/scene-provider-contract.mjs';
import {normalizeFeatureReview} from '../shared/feature-review-contract.mjs';
const hash='a'.repeat(64);
test('Qwen provider is versioned and preserves historical SmolVLM records',()=>{
  const value={schema_version:1,status:'available',assessment:'tentative',model_version:SCENE_MODEL,
    model_revision:SCENE_REVISION,input_sha256:hash,explanation_version:3,image_type:'logo',
    observation:'A blue shield logo is visible.',visual_assessment:'No clear concern reported.',changes_verdict:false};
  assert.ok(isCurrentScene(normalizeScene(value,hash)));
  for(const patch of [{explanation_version:2},{changes_verdict:true},{input_sha256:'b'.repeat(64)},{model_revision:'other'}])
    assert.throws(()=>normalizeScene({...value,...patch},hash));
  const old={...value,model_version:'smolvlm-500m-scene-v1',model_revision:'a7da5b986cb59b408707209984f360a5f4ad7e47',explanation_version:2};
  assert.equal(normalizeScene(old,hash).model_version,old.model_version);
  assert.equal(isCurrentScene(old),false);
});
test('Qwen feature responses retain explicit uncertainty and reject unsupported provenance',()=>{
  const value={schema_version:1,review_version:'visual-features-v1',status:'completed',model_version:SCENE_MODEL,
    model_revision:SCENE_REVISION,input_sha256:hash,changes_verdict:false,classifier_reason:false,validation_status:'not_validated',
    findings:['eyes','shape','texture','lighting','scene'].map(category=>({category,status:'unable_to_assess',observation:'Not enough detail to assess.'}))};
  assert.equal(normalizeFeatureReview(value,hash).findings.length,5);
  assert.throws(()=>normalizeFeatureReview({...value,classifier_reason:true},hash));
  assert.throws(()=>normalizeFeatureReview({...value,model_revision:'other'},hash));
});
