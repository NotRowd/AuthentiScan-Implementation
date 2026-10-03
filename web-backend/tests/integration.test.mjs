import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {db,auth,bucket,emulatorHealth} from '../server/firebase.mjs';
import {reserveScan,finishScan,readAllowance} from '../server/allowance.mjs';
import {PROJECT_ID,BUCKET} from '../local-config.mjs';

let server, base, alice, bob;
const password='LocalTestOnly!234';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==','base64');
async function identity(action,body) {
  const r=await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${action}?key=local-test-key`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
}
async function account() {
  const email=`local-${randomUUID()}@example.test`;
  const r=await identity('signUp',{email,password,returnSecureToken:true});
  assert.equal(r.status,200);return {email,uid:r.body.localId,token:r.body.idToken};
}
async function api(user,path,options={}) {
  return fetch(base+path,{...options,headers:{...(user?{Authorization:'Bearer '+user.token}:{}),...options.headers}});
}
const json=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function saveProfile(user) {
  const r=await api(user,'/me',json({firstName:'Local',lastName:'Tester'}));assert.equal(r.status,200);
}
function imageForm(bytes=png,type='image/png',name='test.png') {const form=new FormData();form.append('image',new Blob([bytes],{type}),name);return {method:'POST',body:form};}
before(async()=>{
  assert.deepEqual(await emulatorHealth(),{authentication:true,firestore:true,storage:true});
  server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  base=`http://127.0.0.1:${server.address().port}/api`;
  alice=await account();bob=await account();await saveProfile(alice);await saveProfile(bob);
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.terminate();});

test('registration, login, duplicate signup, wrong passwords, and invalid tokens',async()=>{
  assert.equal((await identity('signInWithPassword',{email:alice.email,password,returnSecureToken:true})).status,200);
  assert.equal((await identity('signInWithPassword',{email:alice.email,password:'wrong-password',returnSecureToken:true})).status,400);
  assert.equal((await identity('signUp',{email:alice.email,password,returnSecureToken:true})).status,400);
  assert.equal((await api(null,'/me')).status,401);
  assert.equal((await api({token:'invalid'},'/me')).status,401);
});
test('profiles are private, retry-safe, and cannot elevate a plan',async()=>{
  const a=await (await api(alice,'/me')).json(),b=await (await api(bob,'/me')).json();
  assert.equal(a.profile.uid,alice.uid);assert.equal(b.profile.uid,bob.uid);assert.equal(a.allowance.remaining,5);
  assert.equal((await api(alice,'/me',json({firstName:'Bad',lastName:'Plan',plan:'Pro'}))).status,400);
  await saveProfile(alice);assert.equal((await (await api(alice,'/me')).json()).profile.plan,'Free');
});
test('Storage upload and download preserves bytes; another account cannot access them',async()=>{
  const r=await api(alice,'/files',imageForm());assert.equal(r.status,201);
  const {file}=await r.json();
  const download=await api(alice,'/files/'+file.id);assert.equal(download.status,200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),png);
  assert.equal((await api(bob,'/files/'+file.id)).status,404);
  assert.equal((await api(null,'/files/'+file.id)).status,401);
  assert.equal((await (await api(bob,'/files')).json()).files.length,0);
  assert.equal((await (await api(alice,'/me')).json()).allowance.remaining,5);
});
test('invalid, oversized uploads and foreign website origins are rejected',async()=>{
  assert.equal((await api(alice,'/files',imageForm(Buffer.from('not a real image'),'image/png'))).status,400);
  assert.equal((await api(alice,'/files',imageForm(png,'image/jpeg'))).status,400);
  assert.equal((await api(alice,'/files',imageForm(Buffer.alloc(10*1024*1024+1)))).status,413);
  assert.equal((await api(alice,'/me',{headers:{Origin:'https://example.com'}})).status,403);
});
test('direct client Firestore/Storage access cannot bypass API ownership or credit controls',async()=>{
  for(const token of [null,alice.token]) {
    const headers=token?{Authorization:'Bearer '+token}:{};
    const read=await fetch(`http://127.0.0.1:8085/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${bob.uid}`,{headers});
    assert.equal(read.status,403);
    const write=await fetch(`http://127.0.0.1:8085/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${alice.uid}`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({fields:{plan:{stringValue:'Pro'}}})});
    assert.equal(write.status,403);
    const upload=await fetch(`http://127.0.0.1:9199/v0/b/${BUCKET}/o?uploadType=media&name=forbidden.png`,{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:png});
    assert.equal(upload.status,403);
  }
});
test('concurrent reservations allow only five scans; retries and failed refunds are idempotent',async()=>{
  const user=await account();await saveProfile(user);
  const now=Date.parse('2026-09-21T10:00:00Z');
  const operations=Array.from({length:7},()=>randomUUID());
  const result=await Promise.allSettled(operations.map(id=>reserveScan(db,user.uid,id,now)));
  const successes=result.map((r,i)=>r.status==='fulfilled'?operations[i]:null).filter(Boolean);
  assert.equal(successes.length,5);
  for(const r of result.filter(r=>r.status==='rejected'))assert.equal(r.reason.code,'DAILY_LIMIT');
  await reserveScan(db,user.uid,successes[0],now);assert.equal((await readAllowance(db,user.uid,now)).remaining,0);
  await finishScan(db,user.uid,successes[0],'failed');await finishScan(db,user.uid,successes[0],'failed');
  assert.equal((await readAllowance(db,user.uid,now)).remaining,1);
  await reserveScan(db,user.uid,randomUUID(),now);assert.equal((await readAllowance(db,user.uid,now)).remaining,0);
  await finishScan(db,user.uid,successes[1],'completed');
  await assert.rejects(()=>finishScan(db,user.uid,successes[1],'failed'),{code:'ALREADY_FINAL'});
});
test('daily reset preserves history and late refunds do not alter the next day',async()=>{
  const user=await account();await saveProfile(user);
  const before=Date.parse('2026-09-21T15:59:59Z'),after=before+1000,id=randomUUID();
  await reserveScan(db,user.uid,id,before);
  assert.equal((await readAllowance(db,user.uid,before)).remaining,4);
  assert.equal((await readAllowance(db,user.uid,after)).remaining,5);
  await reserveScan(db,user.uid,randomUUID(),after);
  await finishScan(db,user.uid,id,'failed');
  assert.equal((await readAllowance(db,user.uid,after)).remaining,4);
  assert.equal((await readAllowance(db,user.uid,before)).remaining,5);
  assert.equal((await db.collection('users').doc(user.uid).collection('scans').get()).size,2);
});
test('disabled accounts and forged completion endpoints are rejected',async()=>{
  const user=await account();await saveProfile(user);await auth.updateUser(user.uid,{disabled:true});
  assert.equal((await api(user,'/me')).status,401);
  assert.equal((await api(alice,'/scans/anything/complete',json({status:'completed'}))).status,404);
});
