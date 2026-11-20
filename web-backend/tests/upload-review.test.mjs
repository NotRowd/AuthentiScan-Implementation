import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {createApp} from '../server/app.mjs';
import {db,isCloud} from '../server/firebase.mjs';
import {SCENE_MODEL,SCENE_REVISION} from '../shared/scene-provider-contract.mjs';
import {currentFeatureFixture} from './feature-review-fixture.mjs';
assert.equal(isCloud,false);
let server,base,png,mode='normal',sceneCalls=0,featureCalls=0,classifierCalls=0,releaseScene,startedScene;
const classification={verdict:'authentic',confidence_score:.8,authentic_score:.8,ai_generated_score:.2,model_version:'synthetic-test',readable_explanation:'Synthetic classification, not real inference.'};
const scene=bytes=>({schema_version:1,status:'available',assessment:'tentative',model_version:SCENE_MODEL,model_revision:SCENE_REVISION,explanation_version:3,input_sha256:createHash('sha256').update(bytes).digest('hex'),observation:'A synthetic square fixture.',image_type:'illustration',visual_assessment:'Synthetic observation.',changes_verdict:false});
before(async()=>{
  png=await sharp({create:{width:10,height:10,channels:3,background:'#ffffff'}}).png().toBuffer();
  server=createApp({analyzeImage:async()=>{classifierCalls++;if(mode==='classifier-failure')throw new Error('Test classifier failure');return {result:{...classification},heatmap:null};},
    detectImageObjects:async()=>{throw new Error('No test detector');},localizeScanImage:async()=>{throw new Error('No test localizer');},
    explainScanScene:async bytes=>{sceneCalls++;if(mode.startsWith('VISUAL_'))throw Object.assign(new Error('PRIVATE'),{code:mode});startedScene?.();if(releaseScene)await releaseScene;if(mode==='unavailable')throw new Error('Private scene failure');return {...scene(bytes),...(mode==='wrong-hash'?{input_sha256:'0'.repeat(64)}:{})};},
    reviewImageFeatures:async bytes=>{featureCalls++;if(mode.startsWith('VISUAL_'))throw Object.assign(new Error('PRIVATE'),{code:mode});if(mode==='unavailable')throw new Error('Private feature failure');return currentFeatureFixture(mode==='wrong-hash'?'0'.repeat(64):createHash('sha256').update(bytes).digest('hex'));},
  }).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port+'/api';
});
after(async()=>{await new Promise(r=>server.close(r));await db.terminate();});
async function account(){
  const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-test-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'upload-review-'+randomUUID()+'@example.test',password:'SyntheticOnly!123',returnSecureToken:true})});
  assert.equal(r.status,200);const data=await r.json();
  const user={token:data.idToken,uid:data.localId};
  assert.equal((await call(user,'/me',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'Upload',lastName:'Test'})})).status,200);return user;
}
const call=(u,path,options={})=>fetch(base+path,{...options,headers:{Authorization:'Bearer '+u.token,...options.headers}});
async function upload(u,id=randomUUID()){
  const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'fixture.png');
  const r=await call(u,'/v1/scans',{method:'POST',body:form,headers:{'Idempotency-Key':id}});assert.ok([200,201].includes(r.status));return (await r.json()).data;
}
test('upload stays processing until both observations are saved; details and retries reuse them with one credit',async()=>{
  const u=await account(),other=await account(),id=randomUUID();let resume,started;
  releaseScene=new Promise(r=>resume=r);const waiting=new Promise(r=>started=r);startedScene=started;
  const counts=[sceneCalls,featureCalls,classifierCalls];let finished=false;
  const request=upload(u,id).then(row=>{finished=true;return row;});
  try{
    await waiting;assert.equal(finished,false);
    assert.equal((await (await call(u,'/v1/scans/'+id)).json()).data.status,'processing');
    const duplicate=await upload(u,id);assert.equal(duplicate.status,'processing');
    assert.equal((await call(u,'/v1/scans/'+id+'/scene',{method:'POST'})).status,409);
    assert.equal((await call(u,'/v1/scans/'+id+'/features',{method:'POST'})).status,409);
  }finally{resume();releaseScene=null;startedScene=null;}
  const row=await request;assert.equal(row.status,'completed');
  assert.equal(row.upload_review.scene,'completed');assert.equal(row.upload_review.features,'completed');
  assert.equal(row.scene_analysis.observation,'A synthetic square fixture.');assert.equal(row.feature_review.findings.length,5);
  assert.equal(row.analysis.authentic_score,.8);assert.equal(row.credit_status,'used');
  assert.equal((await (await call(u,'/v1/scans/'+id)).json()).data.scene_analysis.observation,row.scene_analysis.observation);
  assert.equal((await call(other,'/v1/scans/'+id)).status,404);
  assert.equal((await call(u,'/v1/scans/'+id+'/scene',{method:'POST'})).status,200);
  assert.equal((await call(u,'/v1/scans/'+id+'/features',{method:'POST'})).status,200);
  await upload(u,id);assert.deepEqual([sceneCalls,featureCalls,classifierCalls],counts.map(n=>n+1));
  assert.equal((await (await call(u,'/v1/users/stats')).json()).data.scans_remaining,4);
});
test('failed optional reviews preserve classification and allow explicit free retry',async()=>{
  const u=await account();mode='unavailable';const row=await upload(u);mode='normal';
  assert.equal(row.status,'completed');assert.deepEqual(row.upload_review,{version:1,scene:'unavailable',features:'unavailable',scene_error:'VISUAL_INVALID_RESPONSE',features_error:'VISUAL_INVALID_RESPONSE'});
  assert.equal(row.scene_analysis,null);assert.equal(row.feature_review,null);assert.equal(row.analysis.authentic_score,.8);
  assert.equal((await call(u,'/v1/scans/'+row.scan_id+'/scene',{method:'POST'})).status,200);
  assert.equal((await call(u,'/v1/scans/'+row.scan_id+'/features',{method:'POST'})).status,200);
  assert.equal((await (await call(u,'/v1/users/stats')).json()).data.scans_remaining,4);
});
test('wrong-image responses are not saved as observations',async()=>{
  const u=await account();mode='wrong-hash';const row=await upload(u);mode='normal';
  assert.equal(row.status,'completed');assert.equal(row.scene_analysis,null);assert.equal(row.feature_review,null);
});
test('classifier failure does not run review and refunds the reserved credit',async()=>{
  const u=await account(),counts=[sceneCalls,featureCalls];mode='classifier-failure';const row=await upload(u);mode='normal';
  assert.equal(row.status,'failed');assert.deepEqual([sceneCalls,featureCalls],counts);
  assert.equal((await (await call(u,'/v1/users/stats')).json()).data.scans_remaining,5);
});


test('retry routes and saved upload failures preserve reasons without charging again',async()=>{
  for(const [code,words] of [['VISUAL_BUSY',/busy/],['VISUAL_OFFLINE',/offline/],['VISUAL_INVALID_RESPONSE',/could not use/],['VISUAL_TIMEOUT',/too long/]]){
    const u=await account();mode=code;
    try{
      const row=await upload(u);
      assert.equal(row.upload_review.scene_error,code);assert.equal(row.upload_review.features_error,code);
      for(const endpoint of ['scene','features']){
        const response=await call(u,'/v1/scans/'+row.scan_id+'/'+endpoint,{method:'POST'});
        assert.equal(response.status,code==='VISUAL_BUSY'?429:503);
        const body=await response.json();assert.match(body.message,words);
        assert.doesNotMatch(body.message,/PRIVATE|restart/);
      }
      assert.equal((await (await call(u,'/v1/users/stats')).json()).data.scans_remaining,4);
    }finally{mode='normal';}
  }
});
