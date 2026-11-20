import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFeatureReview,ANOMALY_REVIEW_VERSION} from '../shared/feature-review-contract.mjs';
import {visualReviewContext} from '../shared/visual-review-context.mjs';
import {visualReviewParagraph} from '../shared/visual-review-paragraph.mjs';
import {ordinaryPeopleDifference,PEOPLE_DIFFERENCE_NOTE} from '../shared/visual-finding-quality.mjs';
import {featureFixture} from './feature-review-fixture.mjs';
import {graphicEyeFinding,graphicScene} from './graphic-review-fixture.mjs';
const fixture=()=>({...featureFixture(),image_type:'document',anomaly_review_version:ANOMALY_REVIEW_VERSION,
 findings:featureFixture().findings.map(f=>({...f,status:'no_clear_concern',location:'',reason:''}))});

test('actual graphic eye-color claim is withheld and same-image context yields a design explanation',()=>{
 const raw=fixture();raw.findings[0]=graphicEyeFinding;
 const review=normalizeFeatureReview(raw),scene=graphicScene(review.input_sha256);
 assert.equal(review.findings[0].status,'unable_to_assess');
 assert.equal(review.findings[0].observation,PEOPLE_DIFFERENCE_NOTE);
 const paragraph=visualReviewParagraph(review,scene);
 assert.match(paragraph,/designed graphic or collage/);
 assert.match(paragraph,/Normal differences between people are not signs of AI generation/);
 assert.doesNotMatch(paragraph,/eyes.*different color/);
 assert.match(paragraph,/No specific visual problem could be confirmed/);
 for(const verdict of ['authentic','ai_generated','uncertain'])assert.equal(visualReviewParagraph({...review,verdict},scene),paragraph);
});
test('wrong-image, untrusted-version and absent context never become a graphic label',()=>{
 const review=normalizeFeatureReview(fixture()),scene=graphicScene(review.input_sha256);
 for(const invalid of [undefined,{...scene,input_sha256:'b'.repeat(64)},{...scene,model_revision:'unknown'},{...scene,changes_verdict:true}]){
  assert.equal(visualReviewContext(review,invalid),'document');
  assert.doesNotMatch(visualReviewParagraph(review,invalid),/designed graphic/);
 }
 assert.equal(visualReviewContext({...review,original_file_name:'poster.png'},null),'document');
});
test('document type alone does not imply collage; artwork appearance never establishes authorship',()=>{
 const review=normalizeFeatureReview(fixture());
 assert.equal(visualReviewContext(review,null),'document');
 assert.match(visualReviewParagraph({...review,image_type:'logo_graphic'}),/design alone cannot tell us whether AI was used/);
 assert.match(visualReviewParagraph({...review,image_type:'illustration'}),/part of its style/);
});
test('cross-person traits are ordinary but distinct physical defects remain eligible',()=>{
 assert.ok(ordinaryPeopleDifference(graphicEyeFinding));
 assert.ok(ordinaryPeopleDifference({observation:'One person has a different skin tone than the other person.',reason:'The faces have different colors.'}));
 assert.equal(ordinaryPeopleDifference({observation:'The visible eye has two pupils unlike the eyes of the other people.',reason:'Two separate pupils appear inside one iris.'}),false);
 assert.equal(ordinaryPeopleDifference({observation:'The left eye has a different shape from the right eye.',reason:'An extra eyelid edge splits the pupil.'}),false);
});

test('scan 37 wording and general portrait-layout descriptions activate graphic context',()=>{
 const review=normalizeFeatureReview(fixture());
 for(const description of [
  'A graphic displaying four portraits of individuals with names and point totals, set against a colorful background with text in Filipino.',
  'The image shows a collage of portraits and names.',
  'Four headshots are arranged in blue frames with names and scores.',
  'A promotional poster contains photographs and large text.',
 ]){
  const scene={...graphicScene(review.input_sha256),observation:description};
  assert.equal(visualReviewContext(review,scene),'graphic');
  assert.match(visualReviewParagraph(review,scene),/designed graphic or collage/);
 }
 const photo={...graphicScene(review.input_sha256),image_type:'photograph',observation:'A person stands beside a poster on a wall.'};
 assert.equal(visualReviewContext({...review,image_type:'photograph_like'},photo),'photo');
});

test('all supported content types retain honest clear, withheld and unassessable outcomes',()=>{
 for(const type of ['photograph_like','illustration','logo_graphic','screenshot','document','uncertain']){
  const clean={...normalizeFeatureReview(fixture()),image_type:type};
  assert.ok(visualReviewParagraph(clean).length>20);
  const blocked={...clean,findings:clean.findings.map(f=>({...f,status:'unable_to_assess',observation:'This finding was withheld because its evidence was inconclusive.'}))};
  assert.doesNotMatch(visualReviewParagraph(blocked),/Nothing clearly looks|No clear visual problem was found/);
  const unable={...clean,findings:clean.findings.map(f=>({...f,status:'unable_to_assess',observation:'Not enough detail.'}))};
  assert.doesNotMatch(visualReviewParagraph(unable),/Nothing clearly looks|No clear visual problem was found/);
 }
});
