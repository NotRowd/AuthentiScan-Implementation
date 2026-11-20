import test from 'node:test';
import assert from 'node:assert/strict';
import {withDigitalEditingDisplay,DIGITAL_EDITING_DISPLAY_RULE,originalImageOnly} from '../shared/digital-editing-display.mjs';
import {mapTruthScanClassification} from '../shared/truthscan-policy.mjs';
import {verdictExplanation,scorePresentation} from '../src/utils/analysisPresentation.js';
const row=(label,confidence)=>({status:'completed',scan_id:'test',analysis:mapTruthScanClassification({final_result:label,final_label_confidence:confidence})});
test('read-only editing grouping preserves original evidence and exact confidence',()=>{
  const original=row('Digitally Edited',96.04),before=structuredClone(original);
  Object.freeze(original.analysis);Object.freeze(original);
  const result=withDigitalEditingDisplay(original);
  assert.deepEqual(original,before);assert.equal(result.analysis.verdict,'authentic');assert.equal(result.analysis.original_verdict,'uncertain');assert.equal(result.analysis.original_decision_rule,before.analysis.decision_rule);assert.equal(result.analysis.provider_label,'Digitally Edited');assert.equal(result.analysis.provider_label_confidence,.9604);assert.equal(result.analysis.confidence_score,.9604);assert.equal(result.analysis.authentic_score,null);assert.equal(result.analysis.ai_generated_score,null);assert.equal(result.analysis.display_grouping,DIGITAL_EDITING_DISPLAY_RULE);assert.equal(withDigitalEditingDisplay(result),result);
  assert.match(result.analysis.readable_explanation,/does not verify human authorship or rule out AI involvement/);
  assert.match(verdictExplanation(result).summary,/Digital editing was detected/);assert.match(verdictExplanation(result).policy,/application grouping/);assert.equal(scorePresentation(result.analysis).label,'Digital-editing confidence');
});
test('60% grouping boundary is exact; low and invalid confidence cannot be promoted',()=>{
  assert.equal(withDigitalEditingDisplay(row('Digitally Edited',60)).analysis.verdict,'authentic');
  assert.equal(withDigitalEditingDisplay(row('Digitally Edited',59.999)).analysis.verdict,'uncertain');
  for(const score of [null,undefined,NaN,Infinity,-1,1.1,'0.96']){const input=row('Digitally Edited',96);input.analysis.provider_label_confidence=score;assert.equal(withDigitalEditingDisplay(input),input);}
  const input=row('Digitally Edited',96);input.status='processing';assert.equal(withDigitalEditingDisplay(input),input);
});
test('other classes, policies, credits and scan data are not rewritten',()=>{
  for(const label of ['Real','AI Generated','AI Edited','Unknown']){const input=row(label,96.04);assert.equal(withDigitalEditingDisplay(input),input);}
  const legacy={status:'completed',analysis:{verdict:'uncertain',authentic_score:.55,ai_generated_score:.45,decision_rule:'manuscript_min_score_v1'}};assert.equal(withDigitalEditingDisplay(legacy),legacy);assert.equal(withDigitalEditingDisplay(null),null);
});

test('heatmap policy hides authentic and every digital-editing result, preserving AI heatmaps',()=>{
 for(const confidence of [96.04,60,55.5]){
  const raw=row('Digitally Edited',confidence),before=structuredClone(raw);
  assert.equal(originalImageOnly(raw.analysis),true);
  assert.equal(originalImageOnly(withDigitalEditingDisplay(raw).analysis),true);
  assert.deepEqual(raw,before);
 }
 assert.equal(originalImageOnly(row('Real',90).analysis),true);
 assert.equal(originalImageOnly({verdict:'authentic'}),true);
 for(const label of ['AI Generated','AI Edited'])assert.equal(originalImageOnly(row(label,90).analysis),false);
 assert.equal(originalImageOnly(row('AI Generated',52).analysis),false);
});
