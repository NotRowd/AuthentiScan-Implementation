import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {db,auth,isCloud} from '../server/firebase.mjs';
import {createEmailVerification} from '../server/email-verification.mjs';
import {createApp} from '../server/app.mjs';
assert.equal(isCloud,false,'Verification tests must never access production');
after(()=>db.terminate());
async function fixture(){
  const uid='verify-'+randomUUID(),email=uid+'@example.test';
  const user={uid,email,emailVerified:false};let time=1800000000000,failDelivery=false;
  const messages=[],key=randomBytes(32);
  await db.collection('users').doc(uid).set({status:'active',plan:'Free',first_name:'Test',last_name:'Only'});
  const service=createEmailVerification({db,auth:{getUser:async()=>user},required:true,now:()=>time,
    loadSender:async()=>({key,send:async(to,code)=>{if(failDelivery)throw new Error('Simulated delivery failure');messages.push({to,code});}})});
  return {uid,user,messages,service,advance:ms=>time+=ms,fail:()=>failDelivery=true,
    record:async()=>(await db.collection('_emailVerification').doc(uid).get()).data()};
}
test('codes are masked, hashed, email-bound, single-use and do not modify plan',async()=>{
  const f=await fixture();assert.equal((await f.service.status(f.uid)).verified,false);
  const sent=await f.service.send(f.uid);assert.equal(sent.sent,true);assert.equal(sent.resend_after,60);
  assert.equal(sent.code,undefined);assert.equal(sent.code_hash,undefined);assert.ok(!sent.masked_email.includes(f.user.email));
  assert.equal(f.messages[0].to,f.user.email);assert.match(f.messages[0].code,/^\d{6}$/);
  assert.notEqual((await f.record()).code_hash,f.messages[0].code);
  assert.equal((await f.service.confirm(f.uid,f.messages[0].code)).verified,true);
  assert.equal((await f.record()).code_hash,null);
  await assert.rejects(f.service.confirm(f.uid,f.messages[0].code),{status:400});
  assert.equal((await db.collection('users').doc(f.uid).get()).data().plan,'Free');
  f.user.email='changed-'+randomUUID()+'@example.test';assert.equal((await f.service.status(f.uid)).verified,false);
});
test('expiry, five wrong attempts and resending invalidate old codes',async()=>{
  const f=await fixture();await f.service.send(f.uid);const old=f.messages[0].code;
  f.advance(600001);await assert.rejects(f.service.confirm(f.uid,old),{status:400});
  await f.service.send(f.uid);const fresh=f.messages[1].code;
  const wrong=String((Number(fresh)+1)%1000000).padStart(6,'0');
  for(let i=0;i<5;i++)await assert.rejects(f.service.confirm(f.uid,wrong),{status:400});
  await assert.rejects(f.service.confirm(f.uid,fresh),{status:400});assert.equal((await f.record()).delivery,'locked');
  f.advance(60001);await f.service.send(f.uid);
  if(old!==f.messages[2].code)await assert.rejects(f.service.confirm(f.uid,old),{status:400});
  assert.equal((await f.service.confirm(f.uid,f.messages[2].code)).verified,true);
});
test('parallel sends enforce cooldown, hourly limits survive requests and failed delivery cannot verify',async()=>{
  const f=await fixture();const results=await Promise.allSettled([f.service.send(f.uid),f.service.send(f.uid)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.messages.length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.status,429);
  for(let i=0;i<2;i++){f.advance(60001);await f.service.send(f.uid);}
  f.advance(60001);await assert.rejects(f.service.send(f.uid),{status:429});
  f.advance(3600001);await f.service.send(f.uid);assert.equal(f.messages.length,4);
  const failed=await fixture();failed.fail();await assert.rejects(failed.service.send(failed.uid));
  assert.equal((await failed.record()).code_hash,null);assert.equal((await failed.service.status(failed.uid)).sent,false);
});
test('recipient budget survives different accounts; simultaneous confirmations consume a code once',async()=>{
  const f=await fixture();for(let i=0;i<3;i++){await f.service.send(f.uid);f.advance(60001);}
  const other=await fixture();other.user.email=f.user.email;
  await assert.rejects(other.service.send(other.uid),{status:429});
  const concurrent=await fixture();await concurrent.service.send(concurrent.uid);
  const results=await Promise.allSettled([concurrent.service.confirm(concurrent.uid,concurrent.messages[0].code),concurrent.service.confirm(concurrent.uid,concurrent.messages[0].code)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('disabled accounts, malformed codes, and changed emails cannot verify',async()=>{
  const f=await fixture();await f.service.send(f.uid);
  for(const value of [123456,'12345','1234567',null,'abcdef'])await assert.rejects(f.service.confirm(f.uid,value),{status:400});
  f.user.email='new-'+randomUUID()+'@example.test';await assert.rejects(f.service.confirm(f.uid,f.messages[0].code),{status:400});
  f.user.disabled=true;await assert.rejects(f.service.status(f.uid),{status:403});
});
test('HTTP gate rejects unverified access and overrides, allows only verified access with no extra credits',async()=>{
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-test-key',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'verify-http-'+randomUUID()+'@example.test',password:'TestOnly!12345',returnSecureToken:true})});
  assert.equal(response.status,200);const user=await response.json();let code;
  const service=createEmailVerification({db,auth,required:true,loadSender:async()=>({key:randomKey,send:async(_email,value)=>{code=value;}})});
  const randomKey=randomBytes(32),server=createApp({emailVerification:service}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api';
  const call=(path,body,token=user.idToken)=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  try{
    assert.equal((await call('/v1/auth/email-verification/send',{},null)).status,401);
    assert.equal((await call('/me',{firstName:'Test',lastName:'Email'})).status,200);
    for(const path of ['/v1/scans','/v1/users/stats','/v1/billing','/files']){
      const denied=await call(path);assert.equal(denied.status,403);assert.equal((await denied.json()).code,'EMAIL_VERIFICATION_REQUIRED');
    }
    assert.equal((await call('/v1/scans',{})).status,403);
    assert.equal((await (await call('/v1/auth/me')).json()).data.user.email_verified,false);
    assert.equal((await call('/v1/auth/email-verification/send',{email:'override@example.test'})).status,400);
    assert.equal((await call('/v1/auth/email-verification/send',{})).status,200);
    assert.equal((await call('/v1/auth/email-verification/confirm',{code,email_verified:true})).status,400);
    assert.equal((await call('/v1/auth/email-verification/confirm',{code})).status,200);
    assert.equal((await (await call('/v1/auth/me')).json()).data.user.email_verified,true);
    assert.equal((await call('/v1/scans')).status,200);
    const stats=await (await call('/v1/users/stats')).json();assert.equal(stats.data.scans_remaining,5);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
