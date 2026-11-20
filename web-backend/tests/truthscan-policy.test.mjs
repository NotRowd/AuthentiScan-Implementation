import test from 'node:test';
import assert from 'node:assert/strict';
import {mapTruthScanClassification} from '../shared/truthscan-policy.mjs';
import {classificationReason} from '../shared/result-language.mjs';
import {verdictExplanation, scorePresentation} from '../src/utils/analysisPresentation.js';

const mapped = (label, confidence) => mapTruthScanClassification({final_result: label, final_label_confidence: confidence});

test('exact 60 selects the returned binary class; unrounded scores below 60 abstain', () => {
  for (const [label, verdict] of [['Real', 'authentic'], ['AI Generated', 'ai_generated'], ['AI Edited', 'ai_generated']]) {
    assert.equal(mapped(label, 60).verdict, verdict);
    assert.equal(mapped(label, 59.999999).verdict, 'uncertain');
    assert.equal(mapped(label, 0).verdict, 'uncertain');
    assert.equal(mapped(label, 100).verdict, verdict);
  }
});

test('editing and unknown labels never invent a binary result, even at full confidence', () => {
  for (const label of ['Digitally Edited', 'Unknown', 'Uncertain']) {
    const result = mapped(label, 100);
    assert.equal(result.verdict, 'uncertain');
    assert.equal(result.provider_label, label);
    assert.equal(result.provider_label_confidence, 1);
    assert.equal(result.authentic_score, null);
    assert.equal(result.ai_generated_score, null);
  }
  assert.match(mapped('Digitally Edited', 95).readable_explanation, /possible editing/);
});

test('AI editing keeps the exact returned confidence and explains the grouped category', () => {
  const result=mapped('AI Edited',97.25);
  assert.equal(result.verdict,'ai_generated');
  assert.equal(result.provider_label,'AI Edited');
  assert.equal(result.provider_label_confidence,.9725);
  assert.equal(result.confidence_score,.9725);
  assert.equal(result.decision_rule,'truthscan_label_confidence_60_v2');
  assert.equal(result.ai_generated_score,null);
  assert.match(result.readable_explanation,/does not mean the entire image/);
});

test('invalid provider values are rejected rather than treated as uncertain', () => {
  for (const value of [null, undefined, '60', NaN, Infinity, -1, 101]) {
    assert.throws(() => mapped('Real', value));
  }
  assert.throws(() => mapped('', 99));
  assert.throws(() => mapTruthScanClassification({is_valid: false, final_result: 'Real', final_label_confidence: 99}));
});

test('web and PDF explanation uses the provider rule without claiming binary scores', () => {
  const result = mapped('Digitally Edited', 92);
  const explanation = verdictExplanation({status: 'completed', analysis: result});
  assert.match(classificationReason(result), /possible editing/);
  assert.match(explanation.policy, /60% label confidence/);
  assert.equal(explanation.scores, null);
  assert.equal(scorePresentation(result).label, 'Digital-editing confidence');
});

test('historical manuscript-policy results retain their original explanation', () => {
  const result = {verdict: 'ai_generated', authentic_score: .2, ai_generated_score: .8,
    decision_rule: 'manuscript_min_score_v1', minimum_class_score: .6};
  assert.match(classificationReason(result), /80.00%/);
  assert.match(verdictExplanation({status: 'completed', analysis: result}).policy, /Manuscript rule/);
});
