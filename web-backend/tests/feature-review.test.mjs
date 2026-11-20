import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFeatureReview,isCurrentFeatureReview,ANOMALY_REVIEW_VERSION} from '../shared/feature-review-contract.mjs';
import {featureFixture} from './feature-review-fixture.mjs';
import {createHash} from 'node:crypto';
import {reviewFeatures} from '../server/feature-review.mjs';

test('more than two valid observations are bounded without losing the review',()=>{
  const base=featureFixture();
  const data={...base,anomaly_review_version:ANOMALY_REVIEW_VERSION,findings:base.findings.map(f=>({...f,status:'unable_to_assess',location:'',reason:''}))};
  for(const [index,observation,location,reason] of [
    [0,'The left pupil has two separate outlines inside the iris.','Face at the center','The pupil has a second edge inside the same eye.'],
    [1,'Several fingers merge together at the lower left hand.','Lower left hand','The finger outlines join while the palm has a clear edge.'],
    [3,'The wall shadow points away from the neighboring tree shadow.','Wall at the right','The two shadows point in different directions under the same light.'],
  ])Object.assign(data.findings[index],{status:'possible_concern',observation,location,reason});
  const result=normalizeFeatureReview(data);
  assert.equal(result.findings.filter(f=>f.status==='possible_concern').length,2);
  assert.match(result.findings[3].observation,/not shown/);
});

test('tentative findings allow different wording but reject category mismatches',()=>{
  const base=featureFixture();
  const data={...base,anomaly_review_version:ANOMALY_REVIEW_VERSION,findings:base.findings.map(f=>({...f,status:'unable_to_assess',location:'',reason:''}))};
  data.findings[1]={category:'shape',status:'possible_concern',observation:'Several fingers seem fused together along the lower edge.',location:'Lower left hand',reason:'The anatomy has an interrupted outline instead of separate digits.'};
  assert.equal(normalizeFeatureReview(data).findings[1].status,'possible_concern');
  data.findings[3]={category:'lighting',status:'possible_concern',observation:'The lighting on the arm appears different from the landscape.',location:'Raised arm at the center',reason:'The hand has an unnatural position for a swimming motion.'};
  assert.equal(normalizeFeatureReview(data).findings[3].status,'unable_to_assess');
  data.findings[3].reason='The arm has bright highlights while the adjacent surface remains evenly shaded.';
  assert.equal(normalizeFeatureReview(data).findings[3].status,'possible_concern');
});

test('physical explanations survive while duplicate and unrelated findings are withheld',()=>{
  const old=featureFixture();
  const finding={category:'shape',status:'possible_concern',observation:'The person appears to emerge through the solid road surface.',location:'Center-right, at the torso and road contact',reason:'A human body cannot naturally pass through a solid asphalt road.'};
  const data={...old,anomaly_review_version:ANOMALY_REVIEW_VERSION,findings:old.findings.map(f=>({...f,status:'no_clear_concern',location:'',reason:''}))};
  data.findings[1]=finding;data.findings[4]={...finding,category:'scene'};
  const normalized=normalizeFeatureReview(data);
  assert.equal(normalized.findings[1].status,'possible_concern');
  assert.equal(normalized.findings[4].status,'unable_to_assess');
  const mismatch={...data,findings:data.findings.map((f,i)=>i===1?{...f,reason:'Lighting casts shadows toward the opposite side of the building.'}:f)};
  assert.equal(normalizeFeatureReview(mismatch).findings[1].status,'unable_to_assess');
  const contradiction={...data,findings:data.findings.map((f,i)=>i===1?{...f,reason:'The arm is in contact with the road surface, which is a plausible occlusion.'}:f)};
  assert.equal(normalizeFeatureReview(contradiction).findings[1].status,'unable_to_assess');
  assert.equal(isCurrentFeatureReview(normalizeFeatureReview({...data,anomaly_review_version:'visual-anomalies-v2'})),false);
});

test('updated anomalies retain what, where and why; historical reviews need an update',()=>{
  const old=featureFixture();
  assert.equal(isCurrentFeatureReview(normalizeFeatureReview(old)),false);
  const data={...old,anomaly_review_version:ANOMALY_REVIEW_VERSION,findings:old.findings.map(f=>({...f,status:'no_clear_concern',location:'',reason:''}))};
  data.findings[1]={category:'shape',status:'possible_concern',observation:'The fingertips merge into one continuous shape on the hand.',location:'Hand in the lower left',reason:'The finger boundaries disappear while the palm remains clearly outlined.'};
  const value=normalizeFeatureReview(data);
  assert.ok(isCurrentFeatureReview(value));
  assert.deepEqual(value.findings[1],data.findings[1]);
  for(const patch of [{location:''},{reason:''},{reason:data.findings[1].observation},{reason:'This proves the image was manipulated.'}])
    assert.throws(()=>normalizeFeatureReview({...data,findings:data.findings.map((f,i)=>i===1?{...f,...patch}:f)}));
  assert.throws(()=>normalizeFeatureReview({...data,anomaly_review_version:'unknown'}));
  const contradictory={...data,findings:data.findings.map((f,i)=>i===1?{...f,observation:'The shield has a pointed bottom consistent with a standard shield design.',reason:'The shape does not show any visible anomalies in its outline.'}:f)};
  const filtered=normalizeFeatureReview(contradictory).findings[1];
  assert.equal(filtered.status,'unable_to_assess');assert.equal(filtered.location,'');assert.equal(filtered.reason,'');
  const inventedRule={...data,findings:data.findings.map((f,i)=>i===1?{...f,reason:'The sign should point toward the right to indicate a stop.'}:f)};
  assert.equal(normalizeFeatureReview(inventedRule).findings[1].status,'unable_to_assess');
});
test('visual review is bound to its image, version and five unique categories',()=>{
  const data=featureFixture(),hash='a'.repeat(64);
  assert.equal(normalizeFeatureReview(data,hash).findings.length,5);
  for(const patch of [{input_sha256:'b'.repeat(64)},{model_revision:'unreviewed'},{review_version:'other'},
    {changes_verdict:true},{classifier_reason:true},{validation_status:'validated'},
    {findings:data.findings.slice(0,4)},{findings:[data.findings[0],...data.findings.slice(0,4)]}])
    assert.throws(()=>normalizeFeatureReview({...data,...patch},hash));
});

test('local review adapter bounds responses and rejects failed or unrelated output',async t=>{
  const bytes=Buffer.from('test-image'),hash=createHash('sha256').update(bytes).digest('hex');
  let reply=()=>Response.json({success:true,data:featureFixture(hash)});
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'http://127.0.0.1:5005/features');
    assert.equal(options.redirect,'error');assert.equal(options.method,'POST');
    assert.equal(options.headers['X-AuthentiScan-Features'],'visual-features-v1');
    assert.equal(options.body,bytes);assert.ok(options.signal instanceof AbortSignal);
    return reply();
  });
  assert.equal((await reviewFeatures(bytes)).input_sha256,hash);
  for(const invalid of [
    ()=>new Response('busy',{status:429}),
    ()=>new Response('x'.repeat(16001)),
    ()=>new Response('not-json'),
    ()=>Response.json({success:false,data:featureFixture(hash)}),
    ()=>Response.json({success:true,data:featureFixture('b'.repeat(64))}),
  ]){reply=invalid;await assert.rejects(()=>reviewFeatures(bytes));}
});
test('untrusted fields and verdicts do not become classifier explanations',()=>{
  const data=featureFixture();
  const review=normalizeFeatureReview({...data,verdict:'authentic',confidence:1});
  assert.equal(review.verdict,undefined);assert.equal(review.confidence,undefined);
  for(const item of [{category:'__proto__'},{status:'confirmed_edit'},{observation:'x'.repeat(601)},{observation:'bad\u0000text'}])
    assert.throws(()=>normalizeFeatureReview({...data,findings:[{...data.findings[0],...item},...data.findings.slice(1)]}));
  for(const observation of ['This proves the image is AI-generated.', 'An odd eye.'])
    assert.throws(()=>normalizeFeatureReview({...data,findings:[{...data.findings[0],status:'possible_concern',observation},...data.findings.slice(1)]}));
  for(const observation of ['The model cannot reliably assess the eyes.', 'There is no clear inconsistency in the eyes.'])
    assert.equal(normalizeFeatureReview({...data,findings:[{...data.findings[0],status:'possible_concern',observation},...data.findings.slice(1)]}).findings[0].status,'unable_to_assess');
  assert.throws(()=>normalizeFeatureReview({...data,findings:[null,...data.findings.slice(1)]}));
});
