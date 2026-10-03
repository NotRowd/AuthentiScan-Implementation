import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createApp} from '../server/app.mjs';
import {db,bucket} from '../server/firebase.mjs';
import {reserveScan} from '../server/allowance.mjs';

let server,base,png,calls=0;
const result={verdict:'authentic',confidence_score:0.8,authentic_score:0.8,ai_generated_score:0.2,readable_explanation:'Synthetic fixture, not a model prediction.',model_version:'test-fixture',analyzed_at:new Date().toISOString(),inference_contract_version:2,policy_version:'test-policy',preprocessing_version:'rgb-pillow-bilinear-224-v1',decision_threshold:.38,uncertainty_margin:.05,gradcam:{status:'available',target:'authentic',reason:null,method:'gradcam',palette:'blue-green-yellow-v1',overlay_alpha:.4,source_grid:[7,7]}};
before(async()=>{
  png=await sharp({create:{width:32,height:32,channels:3,background:'#4499cc'}}).png().toBuffer();
  server=createApp({checkReadiness:async()=> 'ready',analyzeImage:async(_bytes,_type,name)=>{
    calls++;
    if(name==='fail.png')throw Object.assign(new Error('Test AI outage'),{code:'AI_ANALYSIS_FAILED'});
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

test('web scan saves result and private images, supports history/detail/PDF and idempotent replay',async()=>{
  const user=await account(),other=await account(),id=randomUUID(),before=calls;
  const scan=await upload(user,'sample.png',id);assert.equal(scan.status,201);assert.equal(scan.body.data.status,'completed');
  assert.equal(scan.body.data.analysis.model_version,'test-fixture');assert.equal((await stats(user)).scans_remaining,4);
  assert.equal(scan.body.data.analysis.policy_version,'test-policy');
  assert.equal(scan.body.data.analysis.gradcam.target,'authentic');
  const persisted=(await db.collection('users').doc(user.uid).collection('scans').doc(id).get()).data().analysis;
  assert.equal(persisted.preprocessing_version,'rgb-pillow-bilinear-224-v1');
  assert.equal(persisted.decision_threshold,.38);
  assert.equal((await upload(user,'sample.png',id)).status,200);assert.equal(calls,before+1);
  const different=await sharp(png).negate().png().toBuffer();assert.equal((await upload(user,'sample.png',id,different)).status,409);
  for(const suffix of ['', '/image','/heatmap','/report']){
    const r=await api(user,`/v1/scans/${id}${suffix}`);assert.equal(r.status,200,suffix);
    if(suffix==='/image'||suffix==='/heatmap')assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);
    if(suffix==='/report')assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
    assert.equal((await api(other,`/v1/scans/${id}${suffix}`)).status,404);
  }
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
});
test('uncertain classification persists explicit no-heatmap metadata and still exports',async()=>{
  const user=await account();const scan=await upload(user,'uncertain.png');
  assert.equal(scan.body.data.status,'completed');assert.equal(scan.body.data.analysis.verdict,'uncertain');
  assert.equal(scan.body.data.analysis.heatmap_url,null);assert.equal(scan.body.data.analysis.gradcam.target,null);
  assert.equal(scan.body.data.analysis.gradcam.reason,'uncertain_prediction');
  assert.equal((await api(user,`/v1/scans/${scan.body.data.scan_id}/report`)).status,200);
  assert.equal((await stats(user)).scans_remaining,4);
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
