import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unsupportedVisualFinding} from '../shared/visual-finding-quality.mjs';
import {normalizeFeatureReview,ANOMALY_REVIEW_VERSION} from '../shared/feature-review-contract.mjs';
import {visualReviewParagraph,REVIEW_WITHHELD} from '../shared/visual-review-paragraph.mjs';
import {featureFixture} from './feature-review-fixture.mjs';
import {returnedFindings as returned} from './visual-finding-quality-fixture.mjs';

// Actual returned model text from the user's screenshot; not a reference answer
// hardcoded for any input image. The same rules apply to every review.
test('actual contradictory eyes and unsupported body/object overlap are withheld in current and saved reviews',()=>{
  for(const version of [ANOMALY_REVIEW_VERSION,'visual-anomalies-v3-tentative-1','visual-anomalies-v2']){
    const base=featureFixture();
    const review={...base,anomaly_review_version:version,findings:base.findings.map(f=>({...f,status:'no_clear_concern',location:'',reason:''}))};
    for(const item of returned)review.findings[review.findings.findIndex(f=>f.category===item.category)]=item;
    const normalized=normalizeFeatureReview(review);
    assert.equal(normalized.findings.filter(f=>f.status==='possible_concern').length,0);
    assert.equal(visualReviewParagraph(normalized),REVIEW_WITHHELD);
    assert.doesNotMatch(visualReviewParagraph(normalized),/Nothing clearly looks unusual/);
  }
});
test('ordinary visibility limits and closed eyes do not become suspicious details',()=>{
  for(const observation of ['The hand is partly hidden behind the bag.','The face is obscured by a hat.','The eyes appear to be closed in this portrait.'])
    assert.equal(unsupportedVisualFinding({category:'eyes',observation,reason:'The details cannot be seen in this view.'}),true);
});
test('concrete defects and apparent physical interactions remain eligible',()=>{
  for(const item of [
    {category:'shape',observation:'Several fingertips merge into one shape.',reason:'The finger boundaries disappear while the palm remains outlined.'},
    {category:'eyes',observation:'One eye is partly hidden, but the visible iris has two pupils.',reason:'Two separate pupils appear inside the same iris.'},
    {category:'scene',observation:'The person appears to emerge through the road surface.',reason:'The body appears to pass through solid pavement.'},
    {category:'scene',observation:'The goat appears to carry the person in its front legs.',reason:'The front legs appear to act like arms holding an adult.'},
    {category:'shape',observation:'A held object appears to extend from the shoulder.',reason:'The object outline merges into the skin and its boundary disappears at the junction.'},
  ])assert.equal(unsupportedVisualFinding(item),false);
});
