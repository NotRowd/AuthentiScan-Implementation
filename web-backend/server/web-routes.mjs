import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import {createHash,randomUUID} from 'node:crypto';
import {db,bucket,mediaProvider,mediaForRecord} from './firebase.mjs';
import {dayWindow,reserveScan,finishScan,readAllowance} from './allowance.mjs';
import {analyze,readiness} from './ai.mjs';
import {buildScanReport} from './scanReport.cjs';

const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const error=(status,message)=>Object.assign(new Error(message),{status});
const plan={name:'Free',scan_limit:5,billing_cycle:'daily'};
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const reports=new Set(),inflight=new Set();
const allowedStatuses=new Set(['all','queued','processing','completed','failed','authentic','ai_generated','uncertain']);

function safeScan(row){
  return {scan_id:row.scan_id,original_file_name:row.original_file_name,mime_type:row.mime_type,file_size_bytes:row.file_size_bytes,status:row.status,credit_status:row.status==='failed'?'not_charged':row.status==='completed'?'used':'reserved',created_at:row.created_at,updated_at:row.updated_at||row.created_at,image_url:`/api/v1/scans/${row.scan_id}/image`,analysis_status:row.status,analysis_error:row.analysis_error||null,analysis:row.analysis?{...row.analysis,heatmap_url:row.has_heatmap?`/api/v1/scans/${row.scan_id}/heatmap`:null}:null};
}
async function owned(req,id=req.params.scanId){
  if(!idPattern.test(id))throw error(400,'Invalid scan ID.');
  const record=await req.userRef.collection('scans').doc(id).get();
  if(!record.exists)throw error(404,'Scan not found.');
  return record.data();
}
async function scansFor(req){
  const records=await req.userRef.collection('scans').get();
  const scans=[];
  for(const doc of records.docs){
    let row=doc.data();
    if(row.status==='processing' && row.lease_expires_at<Date.now() && !inflight.has(`${req.account.uid}:${doc.id}`)) {
      try{row=await finishScan(db,req.account.uid,doc.id,'failed',{analysis_error:{code:'INTERRUPTED',message:'Analysis was interrupted. The reserved credit has been released.'}});}catch(e){if(e.code!=='ALREADY_FINAL')throw e;row=(await doc.ref.get()).data();}
    }
    scans.push(row);
  }
  return scans.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.scan_id.localeCompare(a.scan_id));
}
export function webRoutes({analyzeImage=analyze,checkReadiness=readiness}={}){
  const router=express.Router();
  router.use(wrap(async(req,_res,next)=>{
    const account=await req.userRef.get();
    if(!account.exists)throw error(404,'Finish creating your Firebase profile before continuing.');
    if(account.data().status!=='active')throw error(403,'Account unavailable.');
    req.profile=account.data();next();
  }));
  router.get('/auth/me',(req,res)=>res.json({success:true,data:{user:{...req.profile,user_id:req.account.uid},plan}}));
  router.get('/system/health',wrap(async(_req,res)=>res.json({success:true,data:{backend:'online',ai:await checkReadiness(),checked_at:new Date().toISOString()}})));
  router.get('/users/stats',wrap(async(req,res)=>{
    const rows=await scansFor(req), now=Date.now(), window=dayWindow(now), quota=await readAllowance(db,req.account.uid,now);
    res.json({success:true,data:{total_scans:rows.length,allowance_used:quota.used,failed_scans:rows.filter(s=>s.status==='failed').length,reserved_scans:rows.filter(s=>s.status==='processing'&&s.allowance_day===window.key).length,queued_scans:rows.filter(s=>s.status==='queued').length,ai_generated_found:rows.filter(s=>s.analysis?.verdict==='ai_generated').length,scans_remaining:quota.remaining,allowance_period:'daily',allowance_timezone:'Asia/Manila',allowance_starts_at:new Date(window.start).toISOString(),allowance_resets_at:quota.resets_at,server_now:new Date(now).toISOString(),plan}});
  }));
  router.get('/scans',wrap(async(req,res)=>{
    const {q='',status='all',limit='20',offset='0'}=req.query;
    if(typeof q!=='string'||q.length>120||!allowedStatuses.has(status)||typeof limit!=='string'||typeof offset!=='string'||!/^\d+$/.test(limit)||!/^\d+$/.test(offset)||Number(limit)<1||Number(limit)>100||!Number.isSafeInteger(Number(offset)))throw error(400,'Invalid history filters or pagination.');
    const query=q.trim().replace(/^#/,'').toLowerCase();
    const rows=(await scansFor(req)).filter(s=>(!query||s.original_file_name.toLowerCase().includes(query)||s.scan_id.includes(query))&&(status==='all'||s.status===status||(s.status==='completed'&&s.analysis?.verdict===status)));
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
    if(prior.exists){if(prior.data().file_sha256!==hash)throw error(409,'This request ID belongs to a different image.');return res.json({success:true,data:safeScan(prior.data())});}
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
      const {result,heatmap}=await analyzeImage(file.buffer,type,record.original_file_name);
      let hasHeatmap=false;
      if(heatmap){
        try{await bucket.file(`users/${req.account.uid}/scans/${id}/heatmap.png`).save(heatmap,{resumable:false,metadata:{contentType:'image/png',cacheControl:'private, no-store'}});hasHeatmap=true;}catch{ /* Preserve a valid classification even if its optional heatmap cannot be stored. */ }
      }
      if(!hasHeatmap&&result.gradcam?.status==='available')result.gradcam={...result.gradcam,status:'unavailable',reason:'storage_failed'};
      await finishScan(db,req.account.uid,id,'completed',{analysis:result,has_heatmap:hasHeatmap});
    }catch(e){
      if(!reserved)throw e;
      try{await finishScan(db,req.account.uid,id,'failed',{analysis_error:{code:e.code==='AI_ANALYSIS_FAILED'?e.code:'ANALYSIS_FAILED',message:e.code==='AI_ANALYSIS_FAILED'?e.message:'Analysis could not complete. No scan credit was used. Check local services.'}});}
      catch(finalError){if(finalError.code!=='ALREADY_FINAL')throw error(503,'Could not confirm scan completion. Check History before uploading again.');}
    }finally{inflight.delete(key);}
    const record=(await recordRef.get()).data();
    res.status(201).json({success:true,message:record.status==='completed'?'Image analyzed and saved to Firebase.':'Image saved, but analysis failed. No credit used.',data:safeScan(record)});
  }));
  router.get('/scans/:scanId',wrap(async(req,res)=>{await scansFor(req);res.json({success:true,data:safeScan(await owned(req))});}));
  for(const kind of ['image','heatmap'])router.get(`/scans/:scanId/${kind}`,wrap(async(req,res)=>{
    const record=await owned(req);
    if(kind==='heatmap'&&!record.has_heatmap)throw error(404,'Heatmap unavailable.');
    let bytes;try{[bytes]=await mediaForRecord(record).file(`users/${req.account.uid}/scans/${record.scan_id}/${kind==='image'?'original':'heatmap.png'}`).download();}catch{throw error(404,'Stored image unavailable.');}
    res.type(kind==='image'?record.mime_type:'image/png').send(bytes);
  }));
  router.get('/scans/:scanId/report',wrap(async(req,res)=>{
    const row=await owned(req),uid=req.account.uid;
    if(reports.has(uid))throw error(429,'A report is already being prepared.');
    reports.add(uid);
    try{
      let heatmap=null;
      if(row.has_heatmap)try{[heatmap]=await mediaForRecord(row).file(`users/${uid}/scans/${row.scan_id}/heatmap.png`).download();}catch{}
      const pdf=await buildScanReport({...row,...row.analysis,result_id:row.analysis?row.scan_id:null},heatmap);
      res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="AuthentiScan-scan-${row.scan_id}.pdf"`}).send(pdf);
    }finally{reports.delete(uid);}
  }));
  return router;
}
