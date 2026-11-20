import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classificationReason,classificationLimit,OBJECT_SCOPE,VISUAL_LIMIT} from '../shared/result-language.mjs';
import {verdictExplanation,heatmapExplanation} from '../src/utils/analysisPresentation.js';
const current=(a,verdict)=>({verdict,authentic_score:a,ai_generated_score:1-a,decision_rule:'manuscript_min_score_v1',minimum_class_score:.6});

test('result-specific reasons explain all three saved decisions without changing the record',()=>{
  for(const [a,v,expected] of [[.82,'authentic',/Authentic score \(82.00%\) met/],[.18,'ai_generated',/AI-generated score \(82.00%\) met/],[.51,'uncertain',/neither score reached.*Authentic 51.00% and AI-generated 49.00%/],[.6,'authentic',/60.00%.*met/],[.4,'ai_generated',/60.00%.*met/],[.5999999,'uncertain',/neither score reached/]]){
    const r=current(a,v),before=JSON.stringify(r);
    assert.match(classificationReason(r),expected);
    assert.equal(JSON.stringify(r),before);
    assert.match(verdictExplanation({status:'completed',analysis:r}).scores,/rounded/);
  }
});
test('legacy policy, missing metadata and inconsistent records do not acquire new reasons',()=>{
  const old={...current(.45,'authentic'),decision_rule:undefined,inference_contract_version:2,decision_threshold:.38,uncertainty_margin:.05};
  assert.match(classificationReason(old),/above 43.00%/);
  assert.match(classificationReason({...old,verdict:'ai_generated',authentic_score:.2,ai_generated_score:.8}),/below 33.00%/);
  assert.match(classificationReason({...old,verdict:'uncertain',authentic_score:.38,ai_generated_score:.62}),/within the saved uncertainty band/);
  assert.match(classificationReason({...current(.51,'authentic')}),/do not agree/);
  assert.match(classificationReason({verdict:'authentic'}),/incomplete or inconsistent/);
  assert.match(classificationReason({...current(.8,'authentic'),decision_rule:'future'}),/unsupported/);
  assert.match(classificationReason({...current(.8,'authentic'),ai_generated_score:.8}),/inconsistent/);
});
test('captions and objects never become classifier reasons; limitations are explicit',()=>{
  const r=current(.8,'authentic');
  assert.equal(classificationReason({...r,scene_analysis:{observation:'Glowing eyes prove AI'},object_detection:{objects:[{label:'fake'}]}}),classificationReason(r));
  assert.match(classificationLimit(r),/does not rule out filters/);
  assert.match(VISUAL_LIMIT,/does not identify a specific defect/);
  assert.match(OBJECT_SCOPE,/physically impossible/);
});
test('heatmap colors only interpreted for a recorded target and known palette',()=>{
  const r={...current(.8,'authentic'),gradcam:{status:'available',target:'authentic',palette:'blue-green-yellow-v1'}};
  assert.match(heatmapExplanation(r),/Yellow does not mean edited/);
  assert.match(heatmapExplanation({...r,gradcam:{...r.gradcam,palette:'unknown'}}),/color scale is unknown/);
  assert.match(heatmapExplanation({...r,gradcam:{...r.gradcam,target:null}}),/target is unknown/);
  assert.match(heatmapExplanation({...r,gradcam:{reason:'uncertain_prediction'}}),/No single-class/);
});
