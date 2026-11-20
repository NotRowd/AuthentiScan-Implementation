import {effectivePlan} from './billing-config.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function validateProfile(body){
  if(!plain(body)||Object.keys(body).some(key=>!['firstName','lastName'].includes(key))||
    !['firstName','lastName'].every(key=>typeof body[key]==='string'&&body[key].trim().length>=1&&body[key].trim().length<=100&&!/[\u0000-\u001f\u007f]/.test(body[key])))
    throw fail(400,'Enter first and last names (1-100 characters each). Only names can be changed here.');
  return {first_name:body.firstName.trim(),last_name:body.lastName.trim()};
}
export function validateFeedback(body){
  if(!plain(body)||Object.keys(body).some(key=>!['rating','comment'].includes(key))||!Number.isInteger(body.rating)||body.rating<1||body.rating>5||
    (body.comment!==undefined&&(typeof body.comment!=='string'||body.comment.length>500||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(body.comment))))
    throw fail(400,'Choose 1-5 stars and an optional comment of up to 500 characters.');
  return {rating:body.rating,comment:(body.comment||'').trim()};
}
export function accountFeedbackRoutes(router,{db,owned}){
  router.patch('/auth/me',wrap(async(req,res)=>{
    const names=validateProfile(req.body);
    const user=await db.runTransaction(async tx=>{
      const current=await tx.get(req.userRef);
      if(!current.exists||current.data().status!=='active')throw fail(403,'Account unavailable.');
      const changes={...names,updated_at:new Date().toISOString()};
      tx.update(req.userRef,changes);
      return {...current.data(),...changes,user_id:req.account.uid};
    });
    res.json({success:true,data:{user:{...user,email_verification_required:req.emailVerification?.required===true,email_verified:req.emailVerification?.verified===true},plan:effectivePlan(user)}});
  }));
  router.get('/scans/:scanId/feedback',wrap(async(req,res)=>{
    const row=await owned(req);
    res.json({success:true,data:row.feedback||null});
  }));
  router.put('/scans/:scanId/feedback',wrap(async(req,res)=>{
    const input=validateFeedback(req.body);
    await owned(req); // Validate UUID and ownership before constructing the reference.
    const ref=req.userRef.collection('scans').doc(req.params.scanId);
    const feedback=await db.runTransaction(async tx=>{
      const [account,record]=await Promise.all([tx.get(req.userRef),tx.get(ref)]);
      if(!account.exists||account.data().status!=='active')throw fail(403,'Account unavailable.');
      if(!record.exists)throw fail(404,'Scan not found.');
      const scan=record.data();
      if(scan.deleting)throw fail(409,'This scan is being deleted.');
      if(scan.status!=='completed'||!scan.analysis)throw fail(409,'Feedback is available for completed analyses only.');
      // Immutable per owned scan. Replaying the same request is safe after a lost response.
      if(scan.feedback){
        if(scan.feedback.rating===input.rating&&(scan.feedback.comment||'')===input.comment)return scan.feedback;
        throw fail(409,'Feedback has already been submitted for this report and cannot be changed.');
      }
      const now=new Date().toISOString();
      const value={...input,created_at:now,updated_at:now};
      tx.update(ref,{feedback:value});
      return value;
    });
    res.json({success:true,data:feedback});
  }));
}
