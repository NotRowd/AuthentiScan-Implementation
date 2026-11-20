import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {createApp} from '../server/app.mjs';
import {db,bucket} from '../server/firebase.mjs';
import {reserveScan} from '../server/allowance.mjs';
import {hardDeleteScan} from '../server/scan-lifecycle.mjs';
import {objectFixture} from './object-fixture.mjs';
import {localizationFixture} from './localization-fixture.mjs';
import {experimentalFixture} from './experimental-localization-fixture.mjs';
import {SCENE_MODEL,SCENE_REVISION} from '../shared/scene-provider-contract.mjs';
import {SCENE_MODEL as LEGACY_SCENE_MODEL,SCENE_REVISION as LEGACY_SCENE_REVISION} from '../shared/scene-contract.mjs';
import {currentFeatureFixture} from './feature-review-fixture.mjs';

let server,base,png,calls=0;
let objectCalls=0,objectFail=false,objectDelay=0;
let localizationMode='unavailable';
let sceneCalls=0,sceneFail=false,sceneRelease=null,sceneStarted=null;
let featureCalls=0,featureFail=false,featureRelease=null,featureStarted=null,featureBadHash=false;
const result={verdict:'authentic',confidence_score:0.8,authentic_score:0.8,ai_generated_score:0.2,readable_explanation:'Synthetic fixture, not a model prediction.',model_version:'test-fixture',analyzed_at:new Date().toISOString(),inference_contract_version:2,policy_version:'test-policy',preprocessing_version:'rgb-pillow-bilinear-224-v1',decision_threshold:.38,uncertainty_margin:.05,gradcam:{status:'available',target:'authentic',reason:null,method:'gradcam',palette:'blue-green-yellow-v1',overlay_alpha:.4,source_grid:[7,7]}};
before(async()=>{
  png=await sharp({create:{width:32,height:32,channels:3,background:'#4499cc'}}).png().toBuffer();
  server=createApp({prepareReviewsOnUpload:false,reviewImageFeatures:async bytes=>{
    featureCalls++;featureStarted?.();if(featureRelease)await featureRelease;
    if(featureFail)throw new Error('private review failure');
    return currentFeatureFixture(featureBadHash?'b'.repeat(64):createHash('sha256').update(bytes).digest('hex'));
  },explainScanScene:async bytes=>{
    sceneCalls++;sceneStarted?.();if(sceneRelease)await sceneRelease;
    if(sceneFail)throw new Error('private model error');
    return {schema_version:1,status:'available',assessment:'tentative',model_version:SCENE_MODEL,model_revision:SCENE_REVISION,
      input_sha256:createHash('sha256').update(bytes).digest('hex'),observation:'Synthetic scene fixture, not a real prediction.',changes_verdict:false,
      explanation_version:3,image_type:'logo',visual_assessment:'Synthetic assessment fixture.'};
  },localizeScanImage:async bytes=>{
    if(localizationMode==='failure')throw new Error('private localizer error');
    if(localizationMode==='available')return experimentalFixture(createHash('sha256').update(bytes).digest('hex'));
    if(localizationMode==='scores')return {...experimentalFixture(createHash('sha256').update(bytes).digest('hex')),status:'uncertain',reason:'no_candidate_region',mask:null,score_scale:10000,score_grid:Array(1024).fill(3200)};
    return {schema_version:1,status:'unavailable',reason:'validation_pending'};
  },checkReadiness:async()=> 'ready',checkObjectReadiness:async()=>objectFail?'unavailable':'ready',detectImageObjects:async()=>{objectCalls++;if(objectDelay)await new Promise(r=>setTimeout(r,objectDelay));if(objectFail)throw new Error('private detector failure');return objectFixture();},analyzeImage:async(_bytes,_type,name)=>{
    calls++;
    if(name==='fail.png')throw Object.assign(new Error('Test AI outage'),{code:'AI_ANALYSIS_FAILED'});
    if(name==='manuscript-uncertain.png')return {result:{...result,verdict:'uncertain',authentic_score:.5102,ai_generated_score:.4898,confidence_score:.5102,
      confidence_kind:'max_class_score_no_verdict',decision_rule:'manuscript_min_score_v1',minimum_class_score:.6,
      decision_threshold:.5,uncertainty_margin:.1,policy_version:'manuscript-policy-fixture',
      gradcam:{...result.gradcam,status:'unavailable',target:null,reason:'uncertain_prediction'}},heatmap:null};
    if(name==='uncertain.png')return {result:{...result,verdict:'uncertain',authentic_score:.38,ai_generated_score:.62,confidence_score:.62,gradcam:{...result.gradcam,status:'unavailable',target:null,reason:'uncertain_prediction'}},heatmap:null};
    return {result:structuredClone(result),heatmap:name==='no-heatmap.png'?null:png};
  }}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api`;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.terminate();});
async function account(){
  const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-test-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`web-${randomUUID()}@example.test`,password:'LocalTestOnly!234',returnSecureToken:true})});
  assert.equal(r.status,200);const body=await r.json(),user={token:body.idToken,uid:body.localId};
  assert.equal((await api(user,'/me',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'Web',lastName:'Test'})})).status,200);return user;
}
const api=(user,path,options={})=>fetch(base+path,{...options,headers:{Authorization:'Bearer '+user.token,...options.headers}});
async function upload(user,name='test.png',id=randomUUID(),bytes=png){
  const form=new FormData();form.append('image',new Blob([bytes],{type:'image/png'}),name);
  const r=await api(user,'/v1/scans',{method:'POST',body:form,headers:{'Idempotency-Key':id}});return {status:r.status,body:await r.json()};
}
const stats=async user=>(await (await api(user,'/v1/users/stats')).json()).data;

test('feature review is owner-only, cached, hash-bound and free without changing classification',async()=>{
  const user=await account(),other=await account(),scan=await upload(user),id=scan.body.data.scan_id;
  const route=`/v1/scans/${id}/features`,ref=db.collection('users').doc(user.uid).collection('scans').doc(id);
  const prior=(await ref.get()).data(),credits=await stats(user),before=featureCalls;
  assert.equal((await api(other,route,{method:'POST'})).status,404);
  try{
    featureFail=true;const unavailable=await api(user,route,{method:'POST'});assert.equal(unavailable.status,503);
    assert.match((await unavailable.json()).message,/The model returned a response we could not use/);
    assert.equal((await ref.get()).data().feature_review_lease,undefined);
    featureFail=false;featureBadHash=true;
    assert.equal((await api(user,route,{method:'POST'})).status,503);
    assert.equal((await ref.get()).data().feature_review,undefined);
    featureBadHash=false;
    const first=await api(user,route,{method:'POST'});assert.equal(first.status,200);
    const value=(await first.json()).data;assert.equal(value.findings.length,5);assert.equal(value.classifier_reason,false);
    assert.equal((await api(user,route,{method:'POST'})).status,200);assert.equal(featureCalls,before+3);
    const saved=(await ref.get()).data();assert.deepEqual(saved.analysis,prior.analysis);
    assert.deepEqual(saved.object_detection,prior.object_detection);assert.deepEqual(saved.localization,prior.localization);
    assert.equal((await stats(user)).scans_remaining,credits.scans_remaining);
    assert.deepEqual((await (await api(user,`/v1/scans/${id}`)).json()).data.feature_review,value);
    const failed=await upload(user,'fail.png');
    assert.equal((await api(user,`/v1/scans/${failed.body.data.scan_id}/features`,{method:'POST'})).status,409);
  }finally{featureFail=false;featureBadHash=false;}
});

test('feature review lease prevents duplicates and cannot restore deleted scans',async()=>{
  const user=await account(),scan=await upload(user),id=scan.body.data.scan_id,route=`/v1/scans/${id}/features`;
  let release;featureRelease=new Promise(resolve=>{release=resolve;});
  const started=new Promise(resolve=>{featureStarted=resolve;});
  try{
    const pending=api(user,route,{method:'POST'});await started;
    assert.equal((await api(user,route,{method:'POST'})).status,409);
    assert.equal((await api(user,`/v1/scans/${id}`,{method:'DELETE'})).status,200);
    release();assert.equal((await pending).status,404);
    assert.equal((await db.collection('users').doc(user.uid).collection('scans').doc(id).get()).exists,false);
  }finally{release();featureRelease=null;featureStarted=null;}
});

test('scan feedback is private, immutable, bounded and deleted with its scan without AI calls or credits',async()=>{
  const user=await account(),other=await account(),scan=await upload(user),id=scan.body.data.scan_id;
  const route=`/v1/scans/${id}/feedback`,ref=db.collection('users').doc(user.uid).collection('scans').doc(id);
  const before=(await ref.get()).data(),credits=await stats(user),counts=[calls,objectCalls,sceneCalls];
  const put=body=>({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await (await api(user,route)).json()).data,null);
  const first=await api(user,route,put({rating:4,comment:' Useful report. '}));assert.equal(first.status,200);
  const saved=(await first.json()).data;assert.equal(saved.comment,'Useful report.');
  const second=await api(user,route,put({rating:5,comment:'Updated from the other client'}));assert.equal(second.status,409);
  const retry=await api(user,route,put({rating:4,comment:'Useful report.'}));assert.equal(retry.status,200);
  assert.deepEqual((await retry.json()).data,saved,'identical retries do not update timestamps or create feedback');
  assert.deepEqual((await (await api(user,route)).json()).data,saved);
  for(const body of [{rating:0},{rating:6},{rating:2.5},{rating:'5'},{rating:4,comment:'x'.repeat(501)},
    {rating:4,comment:'bad\u0000'},{rating:4,uid:other.uid},{rating:4,verdict:'authentic'},null,[]])
    assert.equal((await api(user,route,put(body))).status,400);
  for(const options of [{},put({rating:1})])assert.equal((await api(other,route,options)).status,404);
  assert.equal((await fetch(base+route)).status,401);
  const after=(await ref.get()).data();delete after.feedback;assert.deepEqual(after,before);
  assert.deepEqual([calls,objectCalls,sceneCalls],counts);assert.equal((await stats(user)).scans_remaining,credits.scans_remaining);
  const failed=await upload(user,'fail.png');assert.equal((await api(user,`/v1/scans/${failed.body.data.scan_id}/feedback`,put({rating:3}))).status,409);
  await ref.update({deleting:true});assert.equal((await api(user,route,put({rating:2}))).status,409);
  await ref.update({deleting:false});assert.equal((await api(user,`/v1/scans/${id}`,{method:'DELETE'})).status,200);
  assert.equal((await api(user,route)).status,404);assert.equal((await api(user,route,put({rating:3}))).status,404);
  assert.equal((await ref.get()).exists,false);
});

test('concurrent feedback submissions preserve only the first response',async()=>{
  const user=await account(),scan=await upload(user),route=`/v1/scans/${scan.body.data.scan_id}/feedback`;
  const replies=await Promise.all([1,5].map(rating=>api(user,route,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating,comment:'Concurrent test'})})));
  assert.deepEqual(replies.map(reply=>reply.status).sort(),[200,409]);
  const saved=(await replies.find(reply=>reply.status===200).json()).data;
  assert.deepEqual((await (await api(user,route)).json()).data,saved);
});

test('manuscript uncertain policy persists through history and PDF without rewriting older scans',async()=>{
  const user=await account(),older=await upload(user),scan=await upload(user,'manuscript-uncertain.png');
  assert.equal(scan.status,201);const id=scan.body.data.scan_id;
  const detail=(await (await api(user,`/v1/scans/${id}`)).json()).data;
  assert.equal(detail.analysis.verdict,'uncertain');assert.equal(detail.analysis.minimum_class_score,.6);
  assert.equal(detail.analysis.decision_rule,'manuscript_min_score_v1');
  assert.equal(detail.analysis.gradcam.target,null);assert.equal(detail.analysis.heatmap_url,null);
  const saved=(await db.collection('users').doc(user.uid).collection('scans').doc(id).get()).data().analysis;
  assert.equal(saved.policy_version,'manuscript-policy-fixture');
  const history=(await (await api(user,'/v1/scans?status=uncertain')).json()).data;
  assert.equal(history.scans.length,1);assert.equal(history.scans[0].scan_id,id);
  const pdf=await api(user,`/v1/scans/${id}/report`);assert.equal(pdf.status,200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  const previous=(await (await api(user,`/v1/scans/${older.body.data.scan_id}`)).json()).data.analysis;
  assert.equal(previous.policy_version,'test-policy');assert.equal(previous.decision_threshold,.38);
  assert.equal(previous.verdict,'authentic');assert.equal(previous.minimum_class_score,undefined);
});

test('scene explanation is private, cached, persisted and free; service failures remain retryable',async()=>{
  const user=await account(),other=await account(),scan=await upload(user),id=scan.body.data.scan_id;
  const path=`/v1/scans/${id}/scene`,ref=db.collection('users').doc(user.uid).collection('scans').doc(id);
  const originalAnalysis=(await ref.get()).data().analysis;
  const legacy={schema_version:1,status:'available',assessment:'tentative',model_version:LEGACY_SCENE_MODEL,model_revision:LEGACY_SCENE_REVISION,
    input_sha256:(await ref.get()).data().file_sha256,observation:'Older saved description.',changes_verdict:false};
  await ref.update({scene_analysis:legacy});
  assert.equal((await api(other,path,{method:'POST'})).status,404);
  const before=sceneCalls;
  try{
    sceneFail=true;const unavailable=await api(user,path,{method:'POST'});assert.equal(unavailable.status,503);
    assert.match((await unavailable.json()).message,/The model returned a response we could not use/);
    assert.equal((await ref.get()).data().scene_lease,undefined);
    assert.equal((await ref.get()).data().scene_analysis.observation,legacy.observation,'Failed update preserves old explanation');
    sceneFail=false;
    const response=await api(user,path,{method:'POST'});assert.equal(response.status,200);
    assert.equal((await response.json()).data.assessment,'tentative');
    assert.equal((await api(user,path,{method:'POST'})).status,200);assert.equal(sceneCalls,before+2);
    const saved=(await ref.get()).data();assert.equal(saved.scene_analysis.model_version,SCENE_MODEL);
    assert.equal(saved.scene_analysis.explanation_version,3);assert.equal(saved.scene_analysis.image_type,'logo');
    assert.deepEqual(saved.analysis,originalAnalysis);assert.equal((await stats(user)).scans_remaining,4);
    const detail=await (await api(user,`/v1/scans/${id}`)).json();assert.equal(detail.data.scene_analysis.assessment,'tentative');
    const failed=await upload(user,'fail.png');assert.equal((await api(user,`/v1/scans/${failed.body.data.scan_id}/scene`,{method:'POST'})).status,409);
  }finally{sceneFail=false;}
});

test('scene lease prevents duplicate inference and completion cannot recreate a deleted scan',async()=>{
  const user=await account(),scan=await upload(user),id=scan.body.data.scan_id,path=`/v1/scans/${id}/scene`;
  let release;sceneRelease=new Promise(resolve=>{release=resolve;});
  const started=new Promise(resolve=>{sceneStarted=resolve;});
  try{
    const pending=api(user,path,{method:'POST'});await started;
    assert.equal((await api(user,path,{method:'POST'})).status,409);
    assert.equal((await api(user,`/v1/scans/${id}`,{method:'DELETE'})).status,200);
    release();assert.equal((await pending).status,404);
    assert.equal((await db.collection('users').doc(user.uid).collection('scans').doc(id).get()).exists,false);
  }finally{release();sceneRelease=null;sceneStarted=null;}
});

test('uncertain localization retains real scores and owner-only aligned preview without changing verdict',async()=>{
  try{
    localizationMode='scores';const user=await account(),other=await account(),scan=await upload(user),id=scan.body.data.scan_id;
    assert.equal(scan.body.data.localization.status,'uncertain');assert.equal(scan.body.data.localization.score_grid.length,1024);
    assert.equal(scan.body.data.analysis.verdict,'authentic');
    const preview=await api(user,`/v1/scans/${id}/localization-image`);assert.equal(preview.status,200);
    assert.equal((await api(other,`/v1/scans/${id}/localization-image`)).status,404);
  }finally{localizationMode='unavailable';}
});

test('web scan saves result and private images, supports history/detail/PDF and idempotent replay',async()=>{
  const user=await account(),other=await account(),id=randomUUID(),before=calls;
  const scan=await upload(user,'sample.png',id);assert.equal(scan.status,201);assert.equal(scan.body.data.status,'completed');
  assert.equal(scan.body.data.analysis.model_version,'test-fixture');assert.equal((await stats(user)).scans_remaining,4);
  assert.equal(scan.body.data.object_detection.objects[0].label,'person');
  assert.equal(scan.body.data.analysis.policy_version,'test-policy');
  assert.equal(scan.body.data.analysis.gradcam.target,'authentic');
  const persisted=(await db.collection('users').doc(user.uid).collection('scans').doc(id).get()).data().analysis;
  assert.equal(persisted.preprocessing_version,'rgb-pillow-bilinear-224-v1');
  assert.equal(persisted.decision_threshold,.38);
  assert.equal((await upload(user,'sample.png',id)).status,200);assert.equal(calls,before+1);
  const different=await sharp(png).negate().png().toBuffer();assert.equal((await upload(user,'sample.png',id,different)).status,409);
  for(const suffix of ['', '/image','/heatmap','/report','/object-image']){
    const r=await api(user,`/v1/scans/${id}${suffix}`);assert.equal(r.status,200,suffix);
    if(suffix==='/image'||suffix==='/heatmap')assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);
    if(suffix==='/report')assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
    assert.equal((await api(other,`/v1/scans/${id}${suffix}`)).status,404);
  }
  for(const account of [user,other])assert.equal((await api(account,`/v1/scans/${id}/localization-image`)).status,404,'No preview without an available localization map');
  const list=await (await api(user,'/v1/scans?q=sample&status=authentic&limit=1&offset=0')).json();
  assert.equal(list.data.pagination.total,1);assert.equal(list.data.scans[0].scan_id,id);
  assert.equal((await (await api(user,'/v1/scans?q=absent')).json()).data.pagination.total,0);
  assert.equal((await api(user,'/v1/scans?limit=0')).status,400);
  assert.equal((await api(user,'/v1/scans?limit[x]=1')).status,400);
  assert.equal((await stats(user)).scans_remaining,4);assert.equal(calls,before+1);
  assert.equal((await stats(other)).total_scans,0);
});
test('AI failure refunds credit once and missing/deleted heatmap never prevents PDF export',async()=>{
  const user=await account(),id=randomUUID();
  const failed=await upload(user,'fail.png',id);assert.equal(failed.status,201);assert.equal(failed.body.data.status,'failed');
  await upload(user,'fail.png',id);assert.equal((await stats(user)).scans_remaining,5);
  const absent=await upload(user,'no-heatmap.png');assert.equal(absent.body.data.analysis.heatmap_url,null);
  assert.equal((await api(user,`/v1/scans/${absent.body.data.scan_id}/report`)).status,200);
  const stored=await upload(user),savedId=stored.body.data.scan_id;
  await bucket.file(`users/${user.uid}/scans/${savedId}/heatmap.png`).delete(); // Only this synthetic test object.
  assert.equal((await api(user,`/v1/scans/${savedId}/heatmap`)).status,404);
  assert.equal((await api(user,`/v1/scans/${savedId}/report`)).status,200);
  assert.equal((await stats(user)).scans_remaining,3);
});
test('seven concurrent real upload routes allow only five charged analyses',async()=>{
  const user=await account();const responses=await Promise.all(Array.from({length:7},()=>upload(user)));
  assert.equal(responses.filter(r=>r.status===201&&r.body.data.status==='completed').length,5);
  assert.equal(responses.filter(r=>r.status===403).length,2);assert.equal((await stats(user)).scans_remaining,0);
  assert.deepEqual(responses.filter(r=>r.status===201).map(r=>r.body.data.scan_number).sort((a,b)=>a-b),[1,2,3,4,5]);
});

test('hard delete removes owner record and both media objects without refund or reused numbers',async()=>{
  const user=await account(),other=await account();
  const first=await upload(user,'first.png'),second=await upload(user,'second.png');
  const id=first.body.data.scan_id;
  assert.equal(first.body.data.scan_number,1);assert.equal(second.body.data.scan_number,2);
  assert.equal((await upload(other,'other.png')).body.data.scan_number,1);
  assert.equal((await api(other,`/v1/scans/${id}`,{method:'DELETE'})).status,404);
  assert.equal((await fetch(base+`/v1/scans/${id}`,{method:'DELETE'})).status,401);
  assert.equal((await api(user,'/v1/scans/not-an-id',{method:'DELETE'})).status,400);
  assert.equal((await api(user,`/v1/scans/${id}`,{method:'DELETE'})).status,200);
  assert.equal((await db.collection('users').doc(user.uid).collection('scans').doc(id).get()).exists,false);
  for(const name of ['original','heatmap.png'])await assert.rejects(()=>bucket.file(`users/${user.uid}/scans/${id}/${name}`).download());
  for(const suffix of ['','/image','/heatmap','/report'])assert.equal((await api(user,`/v1/scans/${id}${suffix}`)).status,404);
  assert.equal((await api(user,`/v1/scans/${id}`,{method:'DELETE'})).status,404);
  const current=await stats(user);assert.equal(current.total_scans,1);assert.equal(current.scans_remaining,3);
  const next=await upload(user,'third.png');assert.equal(next.body.data.scan_number,3);
  const numbered=await (await api(user,'/v1/scans?q=%232')).json();
  assert.equal(numbered.data.scans[0].scan_id,second.body.data.scan_id);
  assert.equal(numbered.data.scans[0].scan_number,2);
  const pdf=await api(user,`/v1/scans/${next.body.data.scan_id}/report`);
  assert.match(pdf.headers.get('content-disposition'),/scan-3\.pdf/);
});

test('existing unnumbered scans migrate oldest-first, independently per account, and keep numbers after deletion',async()=>{
  const user=await account(),ref=db.collection('users').doc(user.uid),old=randomUUID(),newer=randomUUID();
  for(const [id,date] of [[newer,'2026-09-02'],[old,'2026-09-01']])await ref.collection('scans').doc(id).create({scan_id:id,owner_uid:user.uid,original_file_name:'legacy.png',status:'failed',created_at:date+'T00:00:00Z'});
  const lists=await Promise.all([api(user,'/v1/scans'),api(user,'/v1/scans')]);
  for(const response of lists){const {data}=await response.json();assert.equal(data.scans.find(s=>s.scan_id===old).scan_number,1);assert.equal(data.scans.find(s=>s.scan_id===newer).scan_number,2);}
  assert.equal((await api(user,`/v1/scans/${old}`,{method:'DELETE'})).status,200);
  assert.equal((await upload(user)).body.data.scan_number,3);
});

test('processing scans cannot be deleted; partial storage failure stays retryable and inaccessible',async()=>{
  const user=await account(),ref=db.collection('users').doc(user.uid),pending=randomUUID();
  await reserveScan(db,user.uid,pending,Date.now(),{original_file_name:'pending.png'});
  assert.equal((await api(user,`/v1/scans/${pending}`,{method:'DELETE'})).status,409);
  const uploaded=await upload(user,'fail.png'),id=uploaded.body.data.scan_id;
  let outage=true;const deleted=[];
  const media=()=>({file:name=>({delete:async options=>{assert.equal(options.ignoreNotFound,true);if(name.endsWith('heatmap.png')&&outage)throw new Error('provider secret');deleted.push(name);}})});
  await assert.rejects(()=>hardDeleteScan({db,user:ref,uid:user.uid,scanId:id,mediaForRecord:media}),e=>e.status===503&&e.code==='SCAN_DELETE_INCOMPLETE'&&!e.message.includes('secret'));
  assert.equal((await ref.collection('scans').doc(id).get()).data().deleting,true);
  for(const suffix of ['','/image','/heatmap','/report'])assert.equal((await api(user,`/v1/scans/${id}${suffix}`)).status,409);
  const before=await stats(user);
  outage=false;await hardDeleteScan({db,user:ref,uid:user.uid,scanId:id,mediaForRecord:media});
  assert.equal((await ref.collection('scans').doc(id).get()).exists,false);
  assert.equal((await stats(user)).scans_remaining,before.scans_remaining);
  assert.equal(deleted.filter(n=>n.endsWith('/original')).length,2,'Retry repeats idempotent cleanup');
});
test('uncertain classification persists explicit no-heatmap metadata and still exports',async()=>{
  const user=await account();const scan=await upload(user,'uncertain.png');
  assert.equal(scan.body.data.status,'completed');assert.equal(scan.body.data.analysis.verdict,'uncertain');
  assert.equal(scan.body.data.analysis.heatmap_url,null);assert.equal(scan.body.data.analysis.gradcam.target,null);
  assert.equal(scan.body.data.analysis.gradcam.reason,'uncertain_prediction');
  assert.equal((await api(user,`/v1/scans/${scan.body.data.scan_id}/report`)).status,200);
  assert.equal((await stats(user)).scans_remaining,4);
});

test('object context is optional, cached, private, and does not charge for older results',async()=>{
  const user=await account(),other=await account();objectFail=true;
  const uploaded=await upload(user),id=uploaded.body.data.scan_id,ref=db.collection('users').doc(user.uid).collection('scans').doc(id);
  assert.equal(uploaded.body.data.status,'completed');assert.equal(uploaded.body.data.object_detection.status,'unavailable');
  const originalAnalysis=(await ref.get()).data().analysis;
  assert.equal((await api(other,`/v1/scans/${id}/objects`,{method:'POST'})).status,404);
  assert.equal((await api(other,`/v1/scans/${id}/object-image`)).status,404);
  const failure=await api(user,`/v1/scans/${id}/objects`,{method:'POST'});assert.equal(failure.status,503);assert.match((await failure.json()).message,/credits are unchanged/);
  objectFail=false;const before=objectCalls;
  const detected=await api(user,`/v1/scans/${id}/objects`,{method:'POST'});assert.equal(detected.status,200);assert.equal((await detected.json()).data.objects.length,2);
  assert.equal((await api(user,`/v1/scans/${id}/objects`,{method:'POST'})).status,200);assert.equal(objectCalls,before+1,'Saved detections are not rerun');
  assert.deepEqual((await ref.get()).data().analysis,originalAnalysis);assert.equal((await stats(user)).scans_remaining,4);
  assert.equal((await ref.get()).data().object_detection_lease,undefined);
});

test('object context lease prevents duplicates and cannot recreate a deleted scan',async()=>{
  const user=await account();objectFail=true;
  const uploaded=await upload(user),id=uploaded.body.data.scan_id;
  objectFail=false;objectDelay=2000;
  try{
    const before=objectCalls,pending=api(user,`/v1/scans/${id}/objects`,{method:'POST'});
    for(let i=0;i<100&&objectCalls===before;i++)await new Promise(r=>setTimeout(r,10));
    assert.equal(objectCalls,before+1);
    assert.equal((await api(user,`/v1/scans/${id}/objects`,{method:'POST'})).status,409);
    assert.equal((await api(user,`/v1/scans/${id}`,{method:'DELETE'})).status,200);
    assert.equal((await pending).status,404);
    assert.equal((await db.collection('users').doc(user.uid).collection('scans').doc(id).get()).exists,false);
    assert.equal((await stats(user)).scans_remaining,4);
  }finally{objectDelay=0;objectFail=false;}
});
test('invalid image is rejected before allowance or AI usage; interrupted lease refunds on refresh',async()=>{
  const user=await account(),before=calls;
  assert.equal((await upload(user,'bad.png',randomUUID(),Buffer.from('bad data'))).status,400);
  assert.equal((await upload(user,'huge.png',randomUUID(),Buffer.alloc(10*1024*1024+1))).status,413);
  assert.equal(calls,before);assert.equal((await stats(user)).scans_remaining,5);
  const id=randomUUID();await reserveScan(db,user.uid,id,Date.now(),{original_file_name:'interrupted.png',mime_type:'image/png',file_size_bytes:png.length});
  await db.collection('users').doc(user.uid).collection('scans').doc(id).update({lease_expires_at:Date.now()-1});
  assert.equal((await stats(user)).scans_remaining,5);
  const scan=await (await api(user,`/v1/scans/${id}`)).json();assert.equal(scan.data.status,'failed');assert.equal(scan.data.analysis_error.code,'INTERRUPTED');
  assert.equal((await stats(user)).scans_remaining,5);
});

test('localization is saved separately, private, deleted with its scan, and optional on failure',async()=>{
  const user=await account(),other=await account();
  try{
    localizationMode='available';
    const first=await upload(user),id=first.body.data.scan_id;
    assert.equal(first.body.data.status,'completed');
    assert.equal(first.body.data.localization.status,'available');
    assert.equal(first.body.data.localization.validation_status,'failed');
    assert.equal(first.body.data.localization.release_approved,false);
    assert.equal(first.body.data.analysis.verdict,'authentic');
    const ref=db.collection('users').doc(user.uid).collection('scans').doc(id);
    assert.equal((await ref.get()).data().localization.mask.length,1024);
    const preview=await api(user,`/v1/scans/${id}/localization-image`);
    assert.equal(preview.status,200);assert.match(preview.headers.get('content-type'),/image\/png/);
    assert.equal((await api(other,`/v1/scans/${id}/localization-image`)).status,404);
    assert.equal((await api(other,`/v1/scans/${id}/report`)).status,404);
    const pdf=await api(user,`/v1/scans/${id}/report`);
    assert.equal(pdf.status,200);
    assert.match(pdf.headers.get('content-type'),/application\/pdf/);
    assert.ok((await pdf.arrayBuffer()).byteLength>1000);
    assert.equal((await api(user,`/v1/scans/${id}`,{method:'DELETE'})).status,200);
    assert.equal((await ref.get()).exists,false);
    assert.equal((await api(user,`/v1/scans/${id}/localization-image`)).status,404);
    localizationMode='failure';
    const next=await upload(user);
    assert.equal(next.body.data.status,'completed');
    assert.equal(next.body.data.localization.status,'unavailable');
    assert.equal(next.body.data.analysis.verdict,'authentic');
  }finally{localizationMode='unavailable';}
});
