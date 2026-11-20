import {createHash,randomUUID} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {normalizeFeatureReview,isCurrentFeatureReview} from '../shared/feature-review-contract.mjs';
import {visualErrorCode} from '../shared/visual-review-errors.mjs';

const error=(status,message)=>Object.assign(new Error(message),{status});
export function featureReviewRoutes(router,{db,owned,mediaForRecord,reviewFeatures}){
  router.post('/scans/:scanId/features',(req,res,next)=>run(req,res).catch(next));
  async function run(req,res){
    const saved=await owned(req);
    if(saved.analysis?.provider==='truthscan')throw error(409,'This scan uses saved provider analysis. Refresh the report to view it.');
    const ref=req.userRef.collection('scans').doc(req.params.scanId),operation=randomUUID();
    const row=await db.runTransaction(async tx=>{
      const account=await tx.get(req.userRef),snapshot=await tx.get(ref),record=snapshot.data();
      if(account.data()?.status!=='active')throw error(403,'Account unavailable.');
      if(!record)throw error(404,'Scan not found.');
      if(record.deleting)throw error(409,'This scan is being deleted.');
      if(record.status!=='completed')throw error(409,'Visual review requires a completed scan.');
      if(isCurrentFeatureReview(record.feature_review)){try{normalizeFeatureReview(record.feature_review,record.file_sha256);return record;}catch{/* Unsupported saved reviews must be regenerated. */}}
      if(record.feature_review_lease?.expires_at>Date.now())throw error(409,'Visual review is running. Wait, then refresh this result.');
      tx.update(ref,{feature_review_lease:{operation,expires_at:Date.now()+390000}});
      return record;
    });
    if(isCurrentFeatureReview(row.feature_review)){try{return res.json({success:true,data:normalizeFeatureReview(row.feature_review,row.file_sha256)});}catch{/* Regenerate unsupported review. */}}
    try{
      const [bytes]=await mediaForRecord(row).file(`users/${req.account.uid}/scans/${row.scan_id}/original`).download();
      const hash=createHash('sha256').update(bytes).digest('hex');
      if(hash!==row.file_sha256)throw new Error('Image changed');
      const review=normalizeFeatureReview(await reviewFeatures(bytes),hash);
      if(!isCurrentFeatureReview(review))throw new Error('Updated anomaly review unavailable.');
      await db.runTransaction(async tx=>{
        const account=await tx.get(req.userRef),snapshot=await tx.get(ref),current=snapshot.data();
        if(account.data()?.status!=='active')throw error(403,'Account unavailable.');
        if(!current)throw error(404,'This scan has been deleted.');
        if(current.deleting||current.feature_review_lease?.operation!==operation||current.file_sha256!==hash)
          throw error(409,'Scan changed during visual review.');
        tx.update(ref,{feature_review:review,feature_review_lease:FieldValue.delete()});
      });
      res.json({success:true,data:review});
    }catch(e){
      if(e.status)throw e;
      throw Object.assign(error(e.code==='VISUAL_BUSY'?429:503,'Visual review unavailable.'),{code:'VISUAL_REVIEW_UNAVAILABLE',visualCode:visualErrorCode(e.code)});
    }finally{
      await db.runTransaction(async tx=>{const snapshot=await tx.get(ref);if(snapshot.exists&&snapshot.data().feature_review_lease?.operation===operation)tx.update(ref,{feature_review_lease:FieldValue.delete()});}).catch(()=>{});
    }
  }
}
