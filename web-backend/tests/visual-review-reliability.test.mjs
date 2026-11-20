import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVisualReviewQueue} from '../server/visual-review-queue.mjs';
import {startScene} from '../scripts/scene-service.mjs';
import {SCENE_MODEL,SCENE_REVISION,SCENE_EXPLANATION_VERSION} from '../shared/scene-provider-contract.mjs';
import {FEATURE_REVIEW_VERSION} from '../shared/feature-review-contract.mjs';
import {explainScene} from '../server/scene.mjs';
import {reviewFeatures} from '../server/feature-review.mjs';
import {featureFixture} from './feature-review-fixture.mjs';
import {logVisualFailure,visualHttpError,visualTransportError} from '../server/visual-review-diagnostics.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('diagnostics distinguish offline, timeout, busy and unusable output without leaking input',()=>{
  const messages=[];
  for(const error of [visualTransportError(new Error('PRIVATE')),visualTransportError({name:'TimeoutError'}),visualHttpError(429),visualHttpError(503),new Error('PRIVATE IMAGE CONTENT'),{code:'toString',message:'PRIVATE'}])logVisualFailure('Visual review',error,message=>messages.push(message));
  assert.match(messages[0],/not reachable/);assert.match(messages[1],/timed out/);assert.match(messages[2],/busy/);assert.match(messages[3],/could not complete/);assert.match(messages[4],/unusable/);assert.doesNotMatch(messages.join(' '),/PRIVATE|toString/);
});

test('normal and experimental startup both launch visual review; explicit opt-out does not',async()=>{
  for(const env of [{},{AUTHENTISCAN_LOCALIZATION_MODE:'experimental'},{AUTHENTISCAN_LOCALIZATION_MODE:'off'}]){
    let starts=0;
    const stop=await startScene({env,probe:async()=>null,fileExists:()=>true,log:()=>{},supervise:async()=>{starts++;return ()=>{};}});
    assert.equal(starts,1);await stop();
  }
  await startScene({env:{AUTHENTISCAN_SCENE_MODE:'off'},probe:async()=>assert.fail('Disabled service must not probe'),log:()=>{}});
});
test('existing services are never replaced or killed; missing assets do not launch',async()=>{
  const healthy={service:'authentiscan-scene',model_loaded:true,model_version:SCENE_MODEL,explanation_version:SCENE_EXPLANATION_VERSION,feature_review_version:FEATURE_REVIEW_VERSION,lifecycle_version:1};
  for(const existing of [healthy,{service:'unrelated'}]){
    const stop=await startScene({env:{},probe:async()=>existing,log:()=>{},supervise:async()=>assert.fail('Must not launch over existing service')});await stop();
  }
  await startScene({env:{},probe:async()=>null,fileExists:()=>false,log:()=>{},supervise:async()=>assert.fail('Missing assets')});
});
test('queue preserves order and releases its slot after failure',async()=>{
  const run=createVisualReviewQueue(),gate=deferred(),order=[];
  const first=run(async()=>{order.push(1);await gate.promise;throw new Error('Model failure');});
  const failure=assert.rejects(first,/Model failure/);
  const second=run(async()=>{order.push(2);return 'saved';});
  const third=run(async()=>{order.push(3);});
  assert.deepEqual(order,[1]);gate.resolve();await failure;assert.equal(await second,'saved');await third;assert.deepEqual(order,[1,2,3]);
});
test('full and expired queues reject without running their work; later calls recover',async()=>{
  const run=createVisualReviewQueue({maxQueued:1,waitMs:15}),gate=deferred();
  const active=run(()=>gate.promise);
  const waiting=run(()=>assert.fail('Expired work must not execute'));
  const expired=assert.rejects(waiting,/timed out/);
  await assert.rejects(run(()=>assert.fail('Queue overflow must not execute')),/full/);
  await expired;gate.resolve();await active;assert.equal(await run(()=>7),7);
});
test('description and feature adapters share one queue and keep image-bound output',async t=>{
  const bytes=Buffer.from('synthetic fixture'),hash=createHash('sha256').update(bytes).digest('hex'),gate=deferred(),started=deferred();let calls=0;
  t.mock.method(globalThis,'fetch',async url=>{
    calls++;
    if(String(url).endsWith('/explain')){
      started.resolve();await gate.promise;
      return Response.json({success:true,data:{schema_version:1,status:'available',assessment:'tentative',model_version:SCENE_MODEL,model_revision:SCENE_REVISION,input_sha256:hash,explanation_version:3,image_type:'logo',observation:'A synthetic logo is visible.',visual_assessment:'Not assessed.',changes_verdict:false}});
    }
    return Response.json({success:true,data:featureFixture(hash)});
  });
  const scene=explainScene(bytes);await started.promise;const features=reviewFeatures(bytes);
  assert.equal(calls,1);gate.resolve();assert.equal((await scene).input_sha256,hash);assert.equal((await features).input_sha256,hash);assert.equal(calls,2);
});
