import {createHash,createHmac,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {loadEmailSender} from './email-sender.mjs';
const fail=(status,message,code='EMAIL_VERIFICATION_ERROR')=>Object.assign(new Error(message),{status,code});
const address=email=>typeof email==='string'?email.trim().toLowerCase():'';
const emailHash=email=>createHash('sha256').update(email).digest('hex');
const signature=(key,uid,email,id,code)=>createHmac('sha256',key).update(JSON.stringify([uid,email,id,code])).digest('hex');
const same=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
export function createEmailVerification({db,auth,required,loadSender=loadEmailSender,now=Date.now}){
  const refFor=uid=>db.collection('_emailVerification').doc(uid);
  async function identity(uid){
    const user=await auth.getUser(uid),email=address(user.email);
    if(user.disabled||!email)throw fail(403,'Account unavailable.');
    return {email,providerVerified:user.emailVerified===true};
  }
  async function status(uid){
    if(!required)return {required:false,verified:true};
    const {email,providerVerified}=await identity(uid),row=(await refFor(uid).get()).data()||{},t=now();
    const challenge=row.email===email?row:null;
    return {required:true,verified:providerVerified||row.verified_email===email,
      masked_email:email.replace(/^(.).*@(.).*$/, '$1***@$2***'),
      sent:challenge?.delivery==='sent'&&challenge.expires_at>t&&challenge.attempts<5,
      resend_after:Math.max(0,Math.ceil(((challenge?.next_send_at||0)-t)/1000)),
      expires_at:challenge?.delivery==='sent'?challenge.expires_at:null};
  }
  async function send(uid){
    if(!required)return status(uid);
    const current=await status(uid);if(current.verified)return current;
    const {email}=await identity(uid),sender=await loadSender();
    const code=String(randomInt(0,1000000)).padStart(6,'0'),id=randomUUID(),t=now(),ref=refFor(uid);
    const recipient=db.collection('_emailVerificationLimits').doc('email-'+emailHash(email));
    const global=db.collection('_emailVerificationLimits').doc('daily');
    await db.runTransaction(async tx=>{
      const [snap,mailSnap,totalSnap,profile]=await Promise.all([tx.get(ref),tx.get(recipient),tx.get(global),tx.get(db.collection('users').doc(uid))]);
      if(profile.data()?.status!=='active')throw fail(403,'Complete your account profile first.');
      const row=snap.data()||{},mail=mailSnap.data()||{},total=totalSnap.data()||{};
      if(row.verified_email===email)throw fail(409,'Your email is already verified. Refresh this page.');
      if((row.next_send_at||0)>t)throw fail(429,'Please wait before requesting another code.');
      const uidCount=row.window_start>t-3600000?(row.send_count||0):0;
      const mailCount=mail.window_start>t-3600000?(mail.count||0):0;
      const day=Math.floor(t/86400000),totalCount=total.day===day?(total.count||0):0;
      if(uidCount>=3||mailCount>=3)throw fail(429,'Code sending limit reached. Try again in an hour.');
      if(totalCount>=100)throw fail(429,'Email sending is temporarily limited. Please try again later.');
      tx.set(ref,{...row,email,id,code_hash:signature(sender.key,uid,email,id,code),attempts:0,
        expires_at:t+600000,next_send_at:t+60000,delivery:'pending',send_count:uidCount+1,
        window_start:uidCount?row.window_start:t});
      tx.set(recipient,{count:mailCount+1,window_start:mailCount?mail.window_start:t});
      tx.set(global,{day,count:totalCount+1});
    });
    let sent=false;
    try{await sender.send(email,code);sent=true;}
    finally{
      await db.runTransaction(async tx=>{const row=(await tx.get(ref)).data();
        if(row?.id===id)tx.update(ref,{delivery:sent?'sent':'failed',...(sent?{}:{code_hash:null})});});
    }
    return status(uid); // SMTP acceptance is not a guarantee of inbox delivery.
  }
  async function confirm(uid,code){
    if(!required)return status(uid);
    if(typeof code!=='string'||!/^\d{6}$/.test(code))throw fail(400,'Enter the six-digit code.');
    const {email}=await identity(uid),sender=await loadSender(),ref=refFor(uid),t=now();
    const result=await db.runTransaction(async tx=>{
      const row=(await tx.get(ref)).data();
      if(!row||row.email!==email||row.delivery!=='sent'||row.expires_at<=t||row.attempts>=5)
        return false;
      const valid=same(row.code_hash,signature(sender.key,uid,email,row.id,code));
      if(!valid){tx.update(ref,{attempts:row.attempts+1,...(row.attempts>=4?{code_hash:null,delivery:'locked'}:{})});return false;}
      tx.update(ref,{verified_email:email,verified_at:t,code_hash:null,delivery:'consumed',attempts:5});
      return true;
    });
    if(!result)throw fail(400,'The code is incorrect, expired, or already used. Request a new code if needed.');
    // This app-owned verification is bound to the live Auth email, not a client flag.
    // Do not race an email change by setting Firebase's emailVerified flag separately.
    return status(uid);
  }
  return {required,status,send,confirm};
}
