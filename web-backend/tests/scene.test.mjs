import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScene,SCENE_MODEL,SCENE_REVISION,SCENE_DISCLAIMER} from '../shared/scene-contract.mjs';
import {verdictExplanation} from '../src/utils/analysisPresentation.js';
export const sceneFixture=hash=>({schema_version:1,status:'available',assessment:'tentative',model_version:SCENE_MODEL,
  model_revision:SCENE_REVISION,input_sha256:hash,observation:'A person is visible on a road. Their position is unclear.',changes_verdict:false});
test('scene observations are bounded, hash-bound and cannot change the verdict or suppress the disclaimer',()=>{
  const hash='a'.repeat(64),value=sceneFixture(hash);
  assert.equal(normalizeScene({...value,disclaimer:'certain',verdict:'fake'},hash).disclaimer,SCENE_DISCLAIMER);
  assert.equal(normalizeScene(value,hash).verdict,undefined);
  for(const patch of [{changes_verdict:true},{assessment:'confirmed'},{model_revision:'unknown'},{input_sha256:'b'.repeat(64)},
    {observation:''},{observation:'x'.repeat(1601)},{observation:'bad\u0000text'}])assert.throws(()=>normalizeScene({...value,...patch},hash));
});
test('structured explanation accepts known image types and preserves legacy descriptions',()=>{
  const value={...sceneFixture('a'.repeat(64)),explanation_version:2,image_type:'logo',visual_assessment:'The design contains geometric shapes.'};
  assert.equal(normalizeScene(value).image_type,'logo');
  assert.equal(normalizeScene(sceneFixture('a'.repeat(64))).explanation_version,undefined);
  for(const patch of [{image_type:'real'},{image_type:'toString'},{explanation_version:99},{visual_assessment:''},{visual_assessment:'x'.repeat(1601)}])
    assert.throws(()=>normalizeScene({...value,...patch}));
});

test('automatic verdict explanation uses saved classification, not scene guesses or majority score',()=>{
  const scan={status:'completed',analysis:{verdict:'ai_generated',authentic_score:.6,ai_generated_score:.4,
    inference_contract_version:2,decision_threshold:.7,uncertainty_margin:.05,
    heatmap_url:'/saved',gradcam:{status:'available',target:'ai_generated'}},
    scene_analysis:{observation:'The eyes prove this is authentic.'}};
  const ai=verdictExplanation(scan);
  assert.match(ai.summary,/labeled this image AI-generated/);
  assert.match(ai.scores,/Authentic 60.00% · AI-generated 40.00%/);
  assert.match(ai.policy,/70.00%/);assert.match(ai.heatmap,/AI-generated/);
  assert.doesNotMatch(JSON.stringify(ai),/eyes|higher score|more likely/);
  const authentic=verdictExplanation({...scan,analysis:{...scan.analysis,verdict:'authentic'}});
  assert.match(authentic.summary,/does not rule out filters/);
  assert.equal(authentic.heatmap,null,'Do not attribute a mismatched heatmap');
  const uncertain=verdictExplanation({...scan,analysis:{...scan.analysis,verdict:'uncertain'}});
  assert.match(uncertain.summary,/Uncertain/);assert.equal(uncertain.heatmap,null);
  assert.equal(verdictExplanation({status:'completed',analysis:{verdict:'authentic'}}).scores,null);
  assert.equal(verdictExplanation({status:'failed',analysis:scan.analysis}).scores,null);
  assert.match(verdictExplanation({status:'queued'}).summary,/not complete/);
});
