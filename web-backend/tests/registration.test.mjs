import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRegistration,registrationRoutes} from '../server/registration.mjs';
import express from 'express';
function fixture(){
 const rows=new Map(),users=new Map(),messages=[],created=[];let time=1800000000000,tail=Promise.resolve(),deliveryFails=false,profileFails=false;
 const ref=(collection,id)=>({path:collection+'/'+id,get:async()=>snapshot(collection+'/'+id),update:async fields=>{rows.set(collection+'/'+id,{...rows.get(collection+'/'+id),...fields});}});
 function snapshot(path){return {exists:rows.has(path),data:()=>structuredClone(rows.get(path))};}
 const db={collection:name=>({doc:id=>ref(name,id)}),runTransaction(fn){const task=tail.then(async()=>{const writes=[];const tx={get:async r=>snapshot(r.path),create:(r,v)=>{if(rows.has(r.path))throw new Error('already exists');writes.push([r.path,v]);},set:(r,v)=>writes.push([r.path,v]),update:(r,v)=>writes.push([r.path,{...rows.get(r.path),...v}])};const result=await fn(tx);if(profileFails&&writes.some(([path])=>path.startsWith('users/'))){profileFails=false;throw new Error('lost profile write');}for(const [key,value]of writes)rows.set(key,structuredClone(value));return result;});tail=task.catch(()=>{});return task;}};
 const auth={getUser:async uid=>{if(!users.has(uid))throw Object.assign(new Error('missing'),{code:'auth/user-not-found'});return users.get(uid);},createUser:async value=>{if([...users.values()].some(u=>u.email===value.email))throw Object.assign(new Error('exists'),{code:'auth/email-already-exists'});created.push(value);users.set(value.uid,value);return value;}};
 const key=randomBytes(32),service=createRegistration({db,auth,now:()=>time,loadSender:async()=>({key,send:async(email,code)=>{if(deliveryFails)throw new Error('SMTP failed');messages.push({email,code});}})});
 const payload=(challenge,index=messages.length-1)=>({challenge_id:challenge.challenge_id,email:messages[index].email,code:messages[index].code,firstName:'Alex',lastName:'Rivera',password:'SyntheticOnly!123',accept_terms:true});
 return {service,rows,users,created,messages,payload,advance:ms=>time+=ms,failDelivery:()=>deliveryFails=true,failProfile:()=>profileFails=true};
}
test('requesting a code creates no Auth account/profile and stores no plaintext email, name, password or OTP',async()=>{
 const f=fixture(),email='nonexistent@example.test',challenge=await f.service.send(email);assert.equal(f.users.size,0);assert.equal(f.created.length,0);assert.equal([...f.rows.keys()].filter(k=>k.startsWith('users/')).length,0);const stored=JSON.stringify([...f.rows.values()]);for(const secret of [email,f.messages[0].code,'SyntheticOnly!123','Rivera'])assert.ok(!stored.includes(secret));assert.ok(challenge.challenge_id);assert.equal(challenge.resend_after,60);
});
test('only a correct code creates a verified Auth user and profile; retries do not create or overwrite users',async()=>{
 const f=fixture(),c=await f.service.send('alex@example.test'),payload=f.payload(c);await assert.rejects(()=>f.service.complete({...payload,code:payload.code==='000000'?'111111':'000000'}),/incorrect/);assert.equal(f.users.size,0);await f.service.complete(payload);assert.equal(f.users.size,1);assert.equal(f.created[0].emailVerified,true);assert.equal([...f.rows.keys()].filter(k=>k.startsWith('users/')).length,1);await f.service.complete({...payload,firstName:'Changed',password:'AnotherPassword123'});assert.equal(f.created.length,1);assert.equal([...f.rows.values()].find(v=>v.first_name)?.first_name,'Alex');
});
test('wrong email, missing proof, missing consent, expired code and five failed attempts cannot create an account',async()=>{
 const f=fixture(),c=await f.service.send('alex@example.test'),p=f.payload(c);await assert.rejects(()=>f.service.complete({...p,email:'someone@example.test'}));await assert.rejects(()=>f.service.complete({...p,challenge_id:undefined}));await assert.rejects(()=>f.service.complete({...p,accept_terms:false}));for(let i=0;i<5;i++)await assert.rejects(()=>f.service.complete({...p,code:p.code==='000000'?'111111':'000000'}));await assert.rejects(()=>f.service.complete(p));assert.equal(f.created.length,0);
 const g=fixture(),expired=await g.service.send('alex@example.test');g.advance(600001);await assert.rejects(()=>g.service.complete(g.payload(expired)));assert.equal(g.created.length,0);
});
test('resend invalidates the old code, cooldown/hourly/global limits and failed delivery prevent abuse',async()=>{
 const f=fixture(),first=await f.service.send('alex@example.test'),old=f.payload(first);await assert.rejects(()=>f.service.send('alex@example.test'),/wait/);f.advance(60000);const second=await f.service.send('alex@example.test');await assert.rejects(()=>f.service.complete(old));await f.service.complete(f.payload(second));
 f.advance(60000);await f.service.send('alex@example.test');f.advance(60000);await assert.rejects(()=>f.service.send('alex@example.test'),/limit/);
 const g=fixture();g.failDelivery();await assert.rejects(()=>g.service.send('alex@example.test'),/could not be sent/);assert.equal(g.created.length,0);assert.ok([...g.rows.values()].some(v=>v.delivery==='failed'&&v.code_hash===null));
 const h=fixture();h.rows.set('_emailVerificationLimits/daily',{day:Math.floor(1800000000000/86400000),count:100});await assert.rejects(()=>h.service.send('alex@example.test'),/temporarily limited/);
});
test('parallel completions and interrupted profile writes preserve a single verified identity and original password',async()=>{
 const f=fixture(),c=await f.service.send('alex@example.test'),p=f.payload(c);const results=await Promise.allSettled([f.service.complete(p),f.service.complete(p)]);assert.ok(results.some(v=>v.status==='fulfilled'));assert.equal(f.created.length,1);
 const g=fixture(),d=await g.service.send('alex@example.test'),q=g.payload(d);g.failProfile();await assert.rejects(()=>g.service.complete(q),/may already exist/);assert.equal(g.created.length,1);await g.service.complete(q);assert.equal(g.created.length,1);assert.equal([...g.rows.keys()].filter(k=>k.startsWith('users/')).length,1);
});
test('existing email cannot be promoted, reset, or assigned a second profile through registration',async()=>{
 const f=fixture();f.users.set('existing',{uid:'existing',email:'alex@example.test',emailVerified:false,password:'ExistingPassword'});const c=await f.service.send('alex@example.test');await assert.rejects(()=>f.service.complete(f.payload(c)),/already has an account/);assert.equal(f.users.get('existing').emailVerified,false);assert.equal(f.created.length,0);assert.equal([...f.rows.keys()].filter(k=>k.startsWith('users/')).length,0);
});
test('public registration endpoints reject unexpected fields and never need an existing login',async()=>{
 const f=fixture(),app=express();app.use(express.json());registrationRoutes(app,f.service);app.use((e,_req,res,_next)=>res.status(e.status||500).json({message:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/api/v1/auth/registration';
 const post=(path,data)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 try{assert.equal((await post('/send-code',{email:'alex@example.test',password:'Do not accept here'})).status,400);const response=await post('/send-code',{email:'alex@example.test'});assert.equal(response.status,200);const {data}=await response.json();assert.equal(f.created.length,0);assert.equal((await post('/complete',{...f.payload(data),email_verified:true})).status,400);assert.equal((await post('/complete',f.payload(data))).status,200);assert.equal(f.created.length,1);}finally{await new Promise(r=>server.close(r));}
});
