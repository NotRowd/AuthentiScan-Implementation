import express from 'express';
import multer from 'multer';
import {avatarRoutes} from './avatar.mjs';
import {withDigitalEditingDisplay,originalImageOnly} from '../shared/digital-editing-display.mjs';
import sharp from 'sharp';
import {createHash,randomUUID} from 'node:crypto';
import {db,bucket,mediaProvider,mediaForRecord} from './firebase.mjs';
import {dayWindow,reserveScan,finishScan,readAllowance} from './allowance.mjs';
import {analyze,readiness} from './ai.mjs';
import {buildScanReport} from './scanReport.cjs';
import {ensureScanNumbers,hardDeleteScan} from './scan-lifecycle.mjs';
import {FieldValue} from 'firebase-admin/firestore';
import {detectObjects,normalizeObjects,unavailableObjects,objectReadiness} from './object-detection.mjs';
import {localizeImage,normalizeLocalization,unavailableLocalization} from './localization.mjs';
import {MESORCH_LOCALIZER_MODEL,MESORCH_MASK_ASSET,unavailableMesorchLocalization} from '../shared/localization-contract.mjs';
import {localizationPreview} from './localization-preview.mjs';
import {explainScene} from './scene.mjs';
import {normalizeScene,SCENE_EXPLANATION_VERSION} from '../shared/scene-provider-contract.mjs';
import {visualErrorCode} from '../shared/visual-review-errors.mjs';
import {CURRENT_AI_RELEASE} from './current-ai-release.mjs';
import {prepareReportImages} from './report-images.mjs';
import {accountFeedbackRoutes} from './account-feedback.mjs';
import {reviewFeatures} from './feature-review.mjs';
import {featureReviewRoutes} from './feature-review-routes.mjs';
import {effectivePlan} from './billing-config.mjs';
import {prepareUploadReview} from './upload-review.mjs';
import {usesTruthScan,runTruthScanPipeline} from './truthscan-pipeline.mjs';

const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const error=(status,message)=>Object.assign(new Error(message),{status});
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const reports=new Set(),inflight=new Set();
const allowedStatuses=new Set(['all','queued','processing','completed','failed','authentic','ai_generated','uncertain']);

function safeScan(row){
  row=withDigitalEditingDisplay(row);
  return {provider_review:row.provider_review||null,upload_review:row.upload_review||null,scan_id:row.scan_id,scan_number:row.scan_number,deletion_pending:Boolean(row.deleting),feature_review:row.feature_review||null,object_detection:row.object_detection||null,localization:originalImageOnly(row.analysis)?null:row.localization||null,scene_analysis:row.scene_analysis||null,original_file_name:row.original_file_name,mime_type:row.mime_type,file_size_bytes:row.file_size_bytes,status:row.status,credit_status:row.status==='failed'?'not_charged':row.status==='completed'?'used':'reserved',created_at:row.created_at,updated_at:row.updated_at||row.created_at,image_url:`/api/v1/scans/${row.scan_id}/image`,analysis_status:row.status,analysis_error:row.analysis_error||null,analysis:row.analysis?{...row.analysis,heatmap_url:row.has_heatmap&&!originalImageOnly(row.analysis)?`/api/v1/scans/${row.scan_id}/heatmap`:null}:null};
}
async function owned(req,id=req.params.scanId){
  if(!idPattern.test(id))throw error(400,'Invalid scan ID.');
  const record=await req.userRef.collection('scans').doc(id).get();
  if(!record.exists)throw error(404,'Scan not found.');
  if(record.data().deleting)throw error(409,'Deletion is incomplete. Return to History and retry Delete.');
  return withDigitalEditingDisplay(record.data());
}
async function scansFor(req){
  const records=await ensureScanNumbers(db,req.userRef);
  const scans=[];
  for(const doc of records.docs){
    let row=doc.data();
    if(row.status==='processing' && !(row.provider_job?.provider==='truthscan'&&row.provider_job.status!=='uploading') && row.lease_expires_at<Date.now() && !inflight.has(`${req.account.uid}:${doc.id}`)) {
      try{row=await finishScan(db,req.account.uid,doc.id,'failed',{analysis_error:{code:'INTERRUPTED',message:'Analysis was interrupted. The reserved credit has been released.'}});}catch(e){if(!['ALREADY_FINAL','NOT_FOUND'].includes(e.code))throw e;row=(await doc.ref.get()).data();}
    }
    if(row)scans.push(withDigitalEditingDisplay(row));
  }
  return scans.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.scan_id.localeCompare(a.scan_id));
}
export function webRoutes({analyzeImage=analyze,checkReadiness=readiness,detectImageObjects=detectObjects,checkObjectReadiness=objectReadiness,localizeScanImage=localizeImage,explainScanScene=explainScene,reviewImageFeatures=reviewFeatures,prepareReviewsOnUpload=true,billing}={}){
  const router=express.Router();
  const runDetection=async bytes=>({...normalizeObjects(await detectImageObjects(bytes)),detected_at:new Date().toISOString()});
  router.use(wrap(async(req,_res,next)=>{
    const account=await req.userRef.get();
    if(!account.exists)throw error(404,'Finish creating your Firebase profile before continuing.');
    if(account.data().status!=='active')throw error(403,'Account unavailable.');
    req.profile=account.data();next();
  }));
  router.get('/auth/me',(req,res)=>res.json({success:true,data:{user:{...req.profile,user_id:req.account.uid,email_verification_required:req.emailVerification?.required===true,email_verified:req.emailVerification?.verified===true},plan:effectivePlan(req.profile)}}));
  accountFeedbackRoutes(router,{db,owned});
  avatarRoutes(router,{db});
  router.get('/billing',wrap(async(req,res)=>res.json({success:true,data:await billing.state(req.account.uid)})));
  router.post('/billing/checkout',wrap(async(req,res)=>{
    if(!req.body||req.body.accept_test_purchase!==true||Object.keys(req.body).some(k=>k!=='accept_test_purchase'))throw error(400,'Confirm the test purchase. Price and plan are set by the server.');
    res.json({success:true,data:await billing.checkout(req.account.uid)});
  }));
  router.post('/billing/orders/:orderId/refresh',wrap(async(req,res)=>res.json({success:true,data:await billing.refresh(req.account.uid,req.params.orderId)})));
  featureReviewRoutes(router,{db,owned,mediaForRecord,reviewFeatures:reviewImageFeatures});
  router.get('/system/health',wrap(async(_req,res)=>{const [ai,objects]=await Promise.all([checkReadiness(),usesTruthScan()?Promise.resolve('disabled'):checkObjectReadiness()]);res.json({success:true,data:{backend:'online',ai,objects,ai_release:usesTruthScan()?'truthscan-label-confidence-60-v2':CURRENT_AI_RELEASE.id,checked_at:new Date().toISOString()}});}));
  router.get('/users/stats',wrap(async(req,res)=>{
    const rows=await scansFor(req), now=Date.now(), window=dayWindow(now), quota=await readAllowance(db,req.account.uid,now);
    res.json({success:true,data:{total_scans:rows.length,allowance_used:quota.used,failed_scans:rows.filter(s=>s.status==='failed').length,reserved_scans:rows.filter(s=>s.status==='processing'&&s.allowance_day===window.key).length,queued_scans:rows.filter(s=>s.status==='queued').length,ai_generated_found:rows.filter(s=>s.analysis?.verdict==='ai_generated').length,scans_remaining:quota.remaining,allowance_period:'daily',allowance_timezone:'Asia/Manila',allowance_starts_at:new Date(window.start).toISOString(),allowance_resets_at:quota.resets_at,server_now:new Date(now).toISOString(),plan:quota.plan}});
  }));
  router.get('/scans',wrap(async(req,res)=>{
    const {q='',status='all',limit='20',offset='0'}=req.query;
    if(typeof q!=='string'||q.length>120||!allowedStatuses.has(status)||typeof limit!=='string'||typeof offset!=='string'||!/^\d+$/.test(limit)||!/^\d+$/.test(offset)||Number(limit)<1||Number(limit)>100||!Number.isSafeInteger(Number(offset)))throw error(400,'Invalid history filters or pagination.');
    const query=q.trim().replace(/^#/,'').toLowerCase();
    const matches=s=>!query||(/^\d+$/.test(query)?String(s.scan_number)===String(Number(query)):s.original_file_name.toLowerCase().includes(query)||s.scan_id===query);
    const rows=(await scansFor(req)).filter(s=>matches(s)&&(status==='all'||s.status===status||(s.status==='completed'&&s.analysis?.verdict===status)));
    res.json({success:true,data:{scans:rows.slice(Number(offset),Number(offset)+Number(limit)).map(safeScan),pagination:{total:rows.length,limit:Number(limit),offset:Number(offset)}}});
  }));
  const upload=multer({storage:multer.memoryStorage(),limits:{files:1,fields:0,fileSize:10*1024*1024}}).single('image');
  router.post('/scans',upload,wrap(async(req,res)=>{
    const file=req.file,id=req.headers['idempotency-key'];
    if(typeof id!=='string'||!idPattern.test(id))throw error(400,'A valid request ID is required.');
    if(!file?.size)throw error(400,'Choose a JPEG, PNG, or WebP image.');
    let type;
    try{
      const decoder=sharp(file.buffer,{limitInputPixels:16000000,failOn:'error'}),meta=await decoder.metadata();
      type={jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[meta.format];
      if(!type||meta.pages>1)throw new Error('Unsupported image.');
      await decoder.resize(1,1).toBuffer();
    }catch{throw error(400,'Choose a valid, non-animated JPEG, PNG, or WebP image (up to 16 million pixels).');}
    const hash=createHash('sha256').update(file.buffer).digest('hex');
    const recordRef=req.userRef.collection('scans').doc(id), prior=await recordRef.get();
    if(prior.exists){if(prior.data().deleting)throw error(409,'This scan is being deleted. Check History.');if(prior.data().file_sha256!==hash)throw error(409,'This request ID belongs to a different image.');return res.json({success:true,data:safeScan(prior.data())});}
    const key=`${req.account.uid}:${id}`;
    if(inflight.has(key))throw error(409,'This scan is already being submitted. Refresh History.');
    inflight.add(key);
    let reserved=false;
    try{
      await scansFor(req); // Release stale reservations from interrupted runs.
      let record;
      const operation=randomUUID();
      try{record=await reserveScan(db,req.account.uid,id,Date.now(),{media_provider:mediaProvider,operation_id:operation,original_file_name:file.originalname.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,240),mime_type:type,file_size_bytes:file.size,file_sha256:hash});}
      catch(e){if(e.code==='DAILY_LIMIT')throw error(403,'Your five daily scans are used or reserved. The allowance resets at midnight Philippine time.');throw e;}
      if(record.operation_id!==operation){
        if(record.file_sha256!==hash)throw error(409,'This request ID belongs to a different image.');
        return res.json({success:true,data:safeScan(record)});
      }
      reserved=true;
      const original=bucket.file(`users/${req.account.uid}/scans/${id}/original`);
      await original.save(file.buffer,{resumable:false,metadata:{contentType:type,cacheControl:'private, no-store'}});
      if(usesTruthScan()){
        await runTruthScanPipeline({record,ref:recordRef,media:bucket,bytes:file.buffer,submit:true,
          finish:details=>finishScan(db,req.account.uid,id,'completed',details)});
      }else{
      const detectionPromise=runDetection(file.buffer).catch(()=>unavailableObjects());
      const localizationPromise=Promise.resolve().then(()=>localizeScanImage(file.buffer))
        .then(value=>{
          const normalized=normalizeLocalization(value,hash);
          return normalized.model_version===MESORCH_LOCALIZER_MODEL&&Buffer.isBuffer(value?.mask_png)
            ?{...normalized,mask_png:value.mask_png}:normalized;
        }).catch(()=>process.env.AUTHENTISCAN_LOCALIZATION_MODE==='mesorch-p'?unavailableMesorchLocalization('invalid_response'):unavailableLocalization('invalid_response'));
      const {result,heatmap}=await analyzeImage(file.buffer,type,record.original_file_name);
      let hasHeatmap=false;
      if(heatmap){
        try{await bucket.file(`users/${req.account.uid}/scans/${id}/heatmap.png`).save(heatmap,{resumable:false,metadata:{contentType:'image/png',cacheControl:'private, no-store'}});hasHeatmap=true;}catch{ /* Preserve a valid classification even if its optional heatmap cannot be stored. */ }
      }
      if(!hasHeatmap&&result.gradcam?.status==='available')result.gradcam={...result.gradcam,status:'unavailable',reason:'storage_failed'};
      const observations=prepareReviewsOnUpload?await prepareUploadReview(file.buffer,hash,{explainScanScene,reviewImageFeatures}):{};
      let localization=await localizationPromise;
      if(localization.model_version===MESORCH_LOCALIZER_MODEL&&localization.status==='available'){
        const mask=localization.mask_png;
        const {mask_png:_transientMask,...metadata}=localization;
        localization=metadata;
        if(Buffer.isBuffer(mask))try{
          await bucket.file(`users/${req.account.uid}/scans/${id}/${MESORCH_MASK_ASSET}`).save(mask,{resumable:false,metadata:{contentType:'image/png',cacheControl:'private, no-store'}});
        }catch{localization=unavailableMesorchLocalization('storage_failed');}
        else localization=unavailableMesorchLocalization('storage_failed');
      }else if(Object.hasOwn(localization,'mask_png')){
        const {mask_png:_transientMask,...metadata}=localization;localization=metadata;
      }
      await finishScan(db,req.account.uid,id,'completed',{analysis:result,has_heatmap:hasHeatmap,object_detection:await detectionPromise,localization,...observations});
      }
    }catch(e){
      if(!reserved)throw e;
      const providerJob=(await recordRef.get()).data()?.provider_job;
      if(providerJob&&providerJob.status!=='uploading'&&!['TRUTHSCAN_ANALYSIS_FAILED','TRUTHSCAN_RESPONSE_INVALID'].includes(e.code)){
        // A timed-out or ambiguous provider call stays resumable without resubmission.
        await recordRef.update({lease_expires_at:Date.now()+720000});
      }else{
      try{await finishScan(db,req.account.uid,id,'failed',{analysis_error:{code:e.code==='AI_ANALYSIS_FAILED'?e.code:'ANALYSIS_FAILED',message:e.code==='AI_ANALYSIS_FAILED'?e.message:usesTruthScan()?'Analysis could not complete. No scan credit was used. Check provider access and remaining credits.':'Analysis could not complete. No scan credit was used. Check local services.'}});}
      catch(finalError){if(finalError.code!=='ALREADY_FINAL')throw error(503,'Could not confirm scan completion. Check History before uploading again.');}
      }
    }finally{inflight.delete(key);}
    const record=(await recordRef.get()).data();
    if(!record)throw error(404,'This scan has been deleted.');
    res.status(201).json({success:true,message:record.status==='completed'?'Image analyzed and saved to Firebase.':record.status==='processing'?'Image saved. Analysis is processing; refresh this saved scan.':'Image saved, but analysis failed. No credit used.',data:safeScan(record)});
  }));
  router.get('/scans/:scanId',wrap(async(req,res)=>{
    let row=await owned(req);
    const key=`${req.account.uid}:${row.scan_id}`;
    if(row.status==='processing'&&row.provider_job?.provider==='truthscan'&&row.provider_job.status!=='uploading'&&!inflight.has(key)){
      inflight.add(key);
      try{
        const ref=req.userRef.collection('scans').doc(row.scan_id);
        await ref.update({lease_expires_at:Date.now()+720000});
        await runTruthScanPipeline({record:row,ref,media:mediaForRecord(row),timeoutMs:10000,
          finish:details=>finishScan(db,req.account.uid,row.scan_id,'completed',details)});
      }catch(e){
        if(['TRUTHSCAN_ANALYSIS_FAILED','TRUTHSCAN_RESPONSE_INVALID'].includes(e.code))
          await finishScan(db,req.account.uid,row.scan_id,'failed',{analysis_error:{code:e.code,message:'Provider analysis failed. No scan credit was used.'}});
      }finally{inflight.delete(key);}
      row=await owned(req);
    }
    res.json({success:true,data:safeScan(row)});
  }));
  router.post('/scans/:scanId/scene',wrap(async(req,res)=>{
    await owned(req);
    const ref=req.userRef.collection('scans').doc(req.params.scanId),operation=randomUUID();
    const row=await db.runTransaction(async tx=>{
      const account=await tx.get(req.userRef),snapshot=await tx.get(ref),record=snapshot.data();
      if(account.data()?.status!=='active')throw error(403,'Account unavailable.');
      if(!record)throw error(404,'Scan not found.');
      if(record.deleting)throw error(409,'This scan is being deleted.');
      if(record.status!=='completed')throw error(409,'Scene explanation requires a completed scan.');
      if(record.analysis?.provider==='truthscan')throw error(409,'This scan uses its saved provider review. Refresh the result to view it.');
      if(record.scene_analysis?.status==='available'&&record.scene_analysis.explanation_version===SCENE_EXPLANATION_VERSION)return record;
      if(record.scene_lease?.expires_at>Date.now())throw error(409,'Scene explanation is running. Wait, then refresh this result.');
      tx.update(ref,{scene_lease:{operation,expires_at:Date.now()+270000}});return record;
    });
    if(row.scene_analysis?.status==='available'&&row.scene_analysis.explanation_version===SCENE_EXPLANATION_VERSION)return res.json({success:true,data:normalizeScene(row.scene_analysis,row.file_sha256)});
    try{
      const [bytes]=await mediaForRecord(row).file(`users/${req.account.uid}/scans/${row.scan_id}/original`).download();
      const hash=createHash('sha256').update(bytes).digest('hex');
      if(hash!==row.file_sha256)throw new Error('Image changed');
      const observation=normalizeScene(await explainScanScene(bytes),hash);
      if(observation.explanation_version!==SCENE_EXPLANATION_VERSION)throw new Error('Outdated scene explanation service');
      await db.runTransaction(async tx=>{
        const account=await tx.get(req.userRef),snapshot=await tx.get(ref),current=snapshot.data();
        if(account.data()?.status!=='active')throw error(403,'Account unavailable.');
        if(!current)throw error(404,'This scan has been deleted.');
        if(current.deleting||current.scene_lease?.operation!==operation)throw error(409,'Scan changed during scene explanation.');
        tx.update(ref,{scene_analysis:observation,scene_lease:FieldValue.delete()});
      });
      res.json({success:true,data:observation});
    }catch(e){
      if(e.status)throw e;
      throw Object.assign(error(e.code==='VISUAL_BUSY'?429:503,'Image description unavailable.'),{code:'SCENE_DESCRIPTION_UNAVAILABLE',visualCode:visualErrorCode(e.code)});
    }finally{
      await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.exists&&current.data().scene_lease?.operation===operation)tx.update(ref,{scene_lease:FieldValue.delete()});}).catch(()=>{});
    }
  }));
  router.post('/scans/:scanId/objects',wrap(async(req,res)=>{
    await owned(req);
    const ref=req.userRef.collection('scans').doc(req.params.scanId),operation=randomUUID();
    const row=await db.runTransaction(async tx=>{
      const account=await tx.get(req.userRef),snapshot=await tx.get(ref),record=snapshot.data();
      if(account.data()?.status!=='active')throw error(403,'Account unavailable.');
      if(!record)throw error(404,'Scan not found.');
      if(record.deleting)throw error(409,'This scan is being deleted.');
      if(record.status!=='completed')throw error(409,'Object context is available for completed scans only.');
      if(record.analysis?.provider==='truthscan')throw error(409,'This scan uses its saved provider review.');
      if(record.object_detection?.status==='available')return record;
      if(record.object_detection_lease?.expires_at>Date.now())throw error(409,'Object detection is already running. Wait a moment and refresh the result.');
      tx.update(ref,{object_detection_lease:{operation,expires_at:Date.now()+90000}});
      return record;
    });
    if(row.object_detection?.status==='available')return res.json({success:true,data:row.object_detection});
    try{
      const [bytes]=await mediaForRecord(row).file(`users/${req.account.uid}/scans/${row.scan_id}/original`).download();
      const detection=await runDetection(bytes);
      await db.runTransaction(async tx=>{
        const account=await tx.get(req.userRef),snapshot=await tx.get(ref),current=snapshot.data();
        if(account.data()?.status!=='active')throw error(403,'Account unavailable.');
        if(!current)throw error(404,'This scan has been deleted.');
        if(current.deleting||current.object_detection_lease?.operation!==operation)throw error(409,'Scan changed while object detection was running. Refresh History.');
        tx.update(ref,{object_detection:detection,object_detection_lease:FieldValue.delete()});
      });
      res.json({success:true,data:detection});
    }catch(e){
      if(e.status)throw e;
      throw Object.assign(error(503,'Object detection is unavailable. Your saved classification and scan credits are unchanged.'),{code:'OBJECT_DETECTION_UNAVAILABLE'});
    }finally{
      await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.exists&&current.data().object_detection_lease?.operation===operation)tx.update(ref,{object_detection_lease:FieldValue.delete()});}).catch(()=>{});
    }
  }));
  router.get('/scans/:scanId/object-image',wrap(async(req,res)=>{
    const row=await owned(req);
    const [bytes]=await mediaForRecord(row).file(`users/${req.account.uid}/scans/${row.scan_id}/original`).download();
    // Strip EXIF without applying rotation: same pixel orientation as classifier and detector.
    const preview=await sharp(bytes,{limitInputPixels:16000000,failOn:'error'}).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toBuffer();
    res.type('image/png').send(preview);
  }));
  router.get('/scans/:scanId/localization-image',wrap(async(req,res)=>{
    const row=await owned(req);
    if(originalImageOnly(row.analysis))throw error(404,'Heatmap not displayed for this result.');
    if(row.analysis?.provider==='truthscan'){
      if(row.status!=='completed'||!row.has_heatmap)throw error(404,'Provider heatmap unavailable.');
      const [image]=await mediaForRecord(row).file(`users/${req.account.uid}/scans/${row.scan_id}/heatmap.png`).download();
      return res.type('image/png').send(image);
    }
    if(row.status!=='completed'||!(row.localization?.status==='available'||(row.localization?.status==='uncertain'&&row.localization?.score_grid)))throw error(404,'Localization preview unavailable.');
    const [bytes]=await mediaForRecord(row).file(`users/${req.account.uid}/scans/${row.scan_id}/original`).download();
    let mask=null;
    if(row.localization.model_version===MESORCH_LOCALIZER_MODEL&&row.localization.status==='available'){
      try{[mask]=await mediaForRecord(row).file(`users/${req.account.uid}/scans/${row.scan_id}/${MESORCH_MASK_ASSET}`).download();}
      catch{throw error(404,'Localization mask unavailable.');}
    }
    const preview=await localizationPreview(bytes,row.localization,mask);
    res.type('image/png').send(preview);
  }));
  router.delete('/scans/:scanId',wrap(async(req,res)=>{
    if(!idPattern.test(req.params.scanId))throw error(400,'Invalid scan ID.');
    if(inflight.has(`${req.account.uid}:${req.params.scanId}`))throw error(409,'Scan is still processing. Try again after it finishes.');
    await scansFor(req);
    const deleted=await hardDeleteScan({db,user:req.userRef,uid:req.account.uid,scanId:req.params.scanId,mediaForRecord});
    res.json({success:true,data:deleted,message:'Scan and stored images permanently deleted. Used credits are unchanged.'});
  }));
  for(const kind of ['image','heatmap'])router.get(`/scans/:scanId/${kind}`,wrap(async(req,res)=>{
    const record=await owned(req);
    if(kind==='heatmap'&&(!record.has_heatmap||originalImageOnly(record.analysis)))throw error(404,'Heatmap unavailable.');
    let bytes;try{[bytes]=await mediaForRecord(record).file(`users/${req.account.uid}/scans/${record.scan_id}/${kind==='image'?'original':'heatmap.png'}`).download();}catch{throw error(404,'Stored image unavailable.');}
    res.type(kind==='image'?record.mime_type:'image/png').send(bytes);
  }));
  router.get('/scans/:scanId/report',wrap(async(req,res)=>{
    await scansFor(req);
    const row=await owned(req),uid=req.account.uid;
    if(reports.has(uid))throw error(429,'A report is already being prepared.');
    reports.add(uid);
    try{
      let heatmap=null;
      if(row.has_heatmap&&!originalImageOnly(row.analysis))try{[heatmap]=await mediaForRecord(row).file(`users/${uid}/scans/${row.scan_id}/heatmap.png`).download();}catch{}
      let reportImages={};
      try{
        const [original]=await mediaForRecord(row).file(`users/${uid}/scans/${row.scan_id}/original`).download();
        let localizationMask=null;
        if(row.localization?.model_version===MESORCH_LOCALIZER_MODEL&&row.localization?.status==='available')
          try{[localizationMask]=await mediaForRecord(row).file(`users/${uid}/scans/${row.scan_id}/${MESORCH_MASK_ASSET}`).download();}catch{}
        reportImages=await prepareReportImages(original,originalImageOnly(row.analysis)?{...row,localization:null}:row,localizationMask);
        if(row.analysis?.provider==='truthscan')reportImages.localizationImage=heatmap;
      }catch{ /* Export classification even if its optional localization preview is unavailable. */ }
      const pdf=await buildScanReport({...row,...row.analysis,result_id:row.analysis?row.scan_id:null},heatmap,new Date(),reportImages.localizationImage,reportImages);
      res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="AuthentiScan-scan-${row.scan_number||row.scan_id}.pdf"`}).send(pdf);
    }finally{reports.delete(uid);}
  }));
  return router;
}
