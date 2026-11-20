import {createHash,createHmac,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {loadEmailSender} from './email-sender.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const validName=value=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=100&&!/[\u0000-\u001f\u007f]/.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const emailAddress=value=>{
 if(typeof value!=='string'||value.length>254||! /^[^\s<>,;:"\\]+@[^\s<>,;:"\\]+\.[^\s<>,;:"\\]+$/.test(value.trim()))throw fail(400,'Enter a valid email address.');
 return value.trim().toLowerCase();
};
const signature=(key,id,email,code)=>createHmac('sha256',key).update(JSON.stringify(['signup-v1',id,email,code])).digest('hex');
const same=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
// Anonymous challenges contain only hashes/rate counters. No Auth user, profile,
// name, password or plaintext email is written before mailbox ownership is proved.
export function createRegistration({db,auth,loadSender=loadEmailSender,now=Date.now}){
 async function send(raw){
  const email=emailAddress(raw),emailHash=hash(email),sender=await loadSender(),t=now(),id=randomUUID();
  const code=String(randomInt(0,1000000)).padStart(6,'0');
  const ref=db.collection('_registrationChallenges').doc(id),mailRef=db.collection('_registrationLimits').doc(emailHash);
  const globalRef=db.collection('_emailVerificationLimits').doc('daily');
  await db.runTransaction(async tx=>{
   const [previous,total]=await Promise.all([tx.get(mailRef),tx.get(globalRef)]),row=previous.data()||{},global=total.data()||{};
   if((row.next_send_at||0)>t)throw fail(429,'Please wait before requesting another code.');
   const count=row.window_start>t-3600000?(row.count||0):0;
   if(count>=3)throw fail(429,'Code sending limit reached. Try again in an hour.');
   const day=Math.floor(t/86400000),totalCount=global.day===day?(global.count||0):0;
   if(totalCount>=100)throw fail(429,'Email sending is temporarily limited. Please try again later.');
   // A resend supersedes any earlier pending challenge for this address.
   tx.set(mailRef,{count:count+1,window_start:count?row.window_start:t,next_send_at:t+60000,challenge_id:id});
   tx.set(globalRef,{day,count:totalCount+1});
   tx.create(ref,{email_hash:emailHash,code_hash:signature(sender.key,id,emailHash,code),attempts:0,status:'pending',delivery:'pending',expires_at:t+600000,delete_after:new Date(t+86400000)});
  });
  try{await sender.send(email,code);await ref.update({delivery:'sent'});}
  catch{await ref.update({delivery:'failed',code_hash:null});throw fail(503,'Verification email could not be sent. Please try again later.');}
  return {challenge_id:id,resend_after:60,expires_in:600,message:'If you can access this inbox, enter the code from the verification email. Your account has not been created.'};
 }
 async function complete(input){
  const {email:raw,challenge_id:id,code,firstName,lastName,password}=input||{};
  const email=emailAddress(raw);
  if(typeof id!=='string'||! /^[a-f0-9-]{36}$/.test(id)||typeof code!=='string'||! /^\d{6}$/.test(code))throw fail(400,'Enter the six-digit code from your registration email.');
  if(!validName(firstName)||!validName(lastName)||typeof password!=='string'||password.length<8||password.length>4096||input.accept_terms!==true)throw fail(400,'Provide valid names, a password of at least eight characters, and accept the research terms.');
  const sender=await loadSender(),emailHash=hash(email),ref=db.collection('_registrationChallenges').doc(id),mailRef=db.collection('_registrationLimits').doc(emailHash),t=now(),operation=randomUUID();
  const claim=await db.runTransaction(async tx=>{
   const [snapshot,mail]=await Promise.all([tx.get(ref),tx.get(mailRef)]),row=snapshot.data();
   if(!row||row.email_hash!==emailHash||mail.data()?.challenge_id!==id||row.delivery!=='sent'||row.expires_at<=t||row.attempts>=5)return {invalid:true};
   if(!same(row.code_hash,signature(sender.key,id,emailHash,code))){tx.update(ref,{attempts:row.attempts+1});return {invalid:true};}
   if(row.status==='completed')return {completed:true,uid:row.uid};
   if(row.status==='creating'&&row.lease_expires_at>t)throw fail(409,'Registration is already being completed. Please wait, then try signing in.');
   const uid=row.uid||randomUUID();
   tx.update(ref,{uid,status:'creating',operation,lease_expires_at:t+60000});return {uid};
  });
  if(claim.invalid)throw fail(400,'The code is incorrect, expired, or replaced by a newer code. Request another code if needed.');
  if(claim.completed)return {created:true};
  try{
   let user;
   try{user=await auth.getUser(claim.uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
   if(!user)user=await auth.createUser({uid:claim.uid,email,emailVerified:true,password,displayName:firstName.trim()+' '+lastName.trim()});
   if(user.email?.toLowerCase()!==email||!user.emailVerified||user.disabled)throw new Error('Unexpected registration identity');
   const profile=db.collection('users').doc(claim.uid);
   await db.runTransaction(async tx=>{
    const [prior,challenge]=await Promise.all([tx.get(profile),tx.get(ref)]);
    if(challenge.data()?.operation!==operation)throw fail(409,'Registration is being completed. Try signing in.');
    if(!prior.exists)tx.create(profile,{uid:claim.uid,email,first_name:firstName.trim(),last_name:lastName.trim(),plan:'Free',status:'active',created_at:new Date(now()).toISOString()});
    tx.update(ref,{status:'completed',lease_expires_at:0});
   });
   return {created:true};
  }catch(e){
   await db.runTransaction(async tx=>{const current=(await tx.get(ref)).data();if(current?.operation===operation&&current.status!=='completed')tx.update(ref,{status:'pending',lease_expires_at:0});});
   if(e.code==='auth/email-already-exists')throw fail(409,'This email already has an account. Sign in or reset your password.');
   if(e.status)throw e;
   throw fail(503,'Registration could not be confirmed. Your account may already exist; try signing in before starting again.');
  }
 }
 return {send,complete};
}
export function registrationRoutes(app,registration){
 const windows=new Map();
 function budget(req,res,next){
  const t=Date.now(),key=req.ip||'shared',prior=windows.get(key),row=prior&&prior.until>t?prior:{until:t+60000,count:0};
  if(row.count>=60)return res.status(429).json({success:false,message:'Too many registration requests. Please wait a minute.'});
  row.count++;windows.set(key,row);if(windows.size>10000)for(const [id,value]of windows)if(value.until<=t)windows.delete(id);
  next();
 }
 const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 app.post('/api/v1/auth/registration/send-code',budget,run(async(req,res)=>{
  if(!req.body||Object.keys(req.body).some(k=>k!=='email'))throw fail(400,'Provide only your email address.');
  res.json({success:true,data:await registration.send(req.body.email)});
 }));
 app.post('/api/v1/auth/registration/complete',budget,run(async(req,res)=>{
  const allowed=['email','challenge_id','code','firstName','lastName','password','accept_terms'];
  if(!req.body||Object.keys(req.body).some(k=>!allowed.includes(k)))throw fail(400,'Unexpected registration fields.');
  res.json({success:true,data:await registration.complete(req.body)});
 }));
}
