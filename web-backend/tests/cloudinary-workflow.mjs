import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {deleteApp} from 'firebase-admin/app';

assert.equal(process.env.AUTHENTISCAN_LIVE_TEST,'yes');
assert.equal(process.env.AUTHENTISCAN_DATA_MODE,'cloud-hybrid');
const {createApp}=await import('../server/app.mjs');
const {auth,db,firebaseApp,publicConfig,mediaProvider,mediaForRecord}=await import('../server/firebase.mjs');
assert.equal(mediaProvider,'cloudinary');
const {checkCloud}=await import('../server/cloud-check.mjs');
await checkCloud();
const runId=randomUUID(),scanId=randomUUID(),checks=[];
const server=createApp().listen(0,'127.0.0.1');
await new Promise((r,j)=>{server.once('listening',r);server.once('error',j);});
const base=`http://127.0.0.1:${server.address().port}`;
const accounts=[];
async function testAccount(role){
  const email=`cloud-media-${role}-${runId}@example.test`,password=`TestOnly!${randomUUID()}`;
  const user=await auth.createUser({email,password,displayName:'Cloud media verification'});
  accounts.push({uid:user.uid,email});
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${publicConfig.firebase.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true}),signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,'Synthetic account login');
  return {uid:user.uid,token:(await response.json()).idToken};
}
async function call(path,token,options={}){
  return fetch(base+'/api'+path,{...options,headers:{...(token?{Authorization:'Bearer '+token}:{}),...options.headers},signal:AbortSignal.timeout(180000)});
}
try{
  const owner=await testAccount('owner'),other=await testAccount('other');
  for(const account of [owner,other])assert.equal((await call('/me',account.token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'Cloudinary',lastName:'Verification'})})).status,200);
  const bytes=await readFile('src/assets/hero.png'),form=new FormData();form.append('image',new Blob([bytes],{type:'image/png'}),'cloudinary-verification.png');
  const upload=await call('/v1/scans',owner.token,{method:'POST',body:form,headers:{'Idempotency-Key':scanId}});
  assert.equal(upload.status,201);const body=await upload.json();assert.equal(body.data.status,'completed');
  const record=(await db.collection('users').doc(owner.uid).collection('scans').doc(scanId).get()).data();
  assert.equal(record.media_provider,'cloudinary');assert.equal(record.has_heatmap,true);
  assert.equal(JSON.stringify(body).includes('res.cloudinary.com'),false);
  checks.push('real AI scan persisted with Cloudinary provider and heatmap');
  const image=await call(`/v1/scans/${scanId}/image`,owner.token);
  assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
  const heatmap=await call(`/v1/scans/${scanId}/heatmap`,owner.token);
  assert.equal(heatmap.status,200);assert.equal(Buffer.from(await heatmap.arrayBuffer()).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  await assert.rejects(()=>access(`.local-media/authentiscan-bc704/users/${owner.uid}/scans/${scanId}/original`),{code:'ENOENT'});
  checks.push('original byte equality; valid heatmap; no local original copy');
  for(const suffix of ['', '/image','/heatmap','/report']){
    assert.equal((await call(`/v1/scans/${scanId}${suffix}`,null)).status,401);
    assert.equal((await call(`/v1/scans/${scanId}${suffix}`,other.token)).status,404);
  }
  checks.push('anonymous and other-account result, image, heatmap and PDF access denied');
  const report=await call(`/v1/scans/${scanId}/report`,owner.token);assert.equal(report.status,200);
  const pdf=Buffer.from(await report.arrayBuffer());assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  const stats=await (await call('/v1/users/stats',owner.token)).json();assert.equal(stats.data.allowance_used,1);assert.equal(stats.data.scans_remaining,4);
  const history=await (await call('/v1/scans',owner.token)).json();assert.equal(history.data.scans[0].scan_id,scanId);
  checks.push('PDF and history succeed; one credit used, four remaining');
  // Read-only compatibility check of the labelled account created by the earlier smoke test.
  const legacy=JSON.parse(await readFile('.test-results/cloud-smoke-2da1dc57-150d-4922-bab1-645893e7183b.json','utf8'));
  const legacyUser=await auth.getUserByEmail(legacy.email);
  const legacyRecord=(await db.collection('users').doc(legacyUser.uid).collection('scans').doc(legacy.scanId).get()).data();
  assert.equal(legacyRecord.media_provider,undefined);
  const [legacyBytes]=await mediaForRecord(legacyRecord).file(`users/${legacyUser.uid}/scans/${legacy.scanId}/original`).download();
  assert.ok(legacyBytes.length>0);checks.push('legacy local media remains readable');
  await mkdir('.test-results',{recursive:true});
  await writeFile(`.test-results/cloudinary-workflow-${runId}.pdf`,pdf);
  await writeFile(`.test-results/cloudinary-workflow-${runId}.json`,JSON.stringify({runId,scanId,accounts,checks},null,2));
  console.log('Cloudinary workflow passed:',checks.join('; '));
  console.log('Evidence:',`.test-results/cloudinary-workflow-${runId}.json`);
}catch(e){console.error('Cloudinary workflow incomplete:',e.code||e.name,'Completed checks:',checks.join('; '));process.exitCode=1;}
finally{await new Promise(r=>server.close(r));await db.terminate();await deleteApp(firebaseApp);}
