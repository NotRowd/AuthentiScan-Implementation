import {loadReportHeatmap} from './scanReport.cjs';
import {normalizeAnalysis} from './ai-contract.mjs';

export function aiBase() {
  const url=new URL(process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001');
  if(url.protocol!=='http:' || !['127.0.0.1','localhost'].includes(url.hostname) || url.username || url.password || url.pathname!=='/' || url.search || url.hash) throw new Error('Only a loopback AI service is allowed in local mode.');
  return url.origin;
}
export async function readiness() {
  try {
    const r=await fetch(aiBase()+'/health',{redirect:'error',signal:AbortSignal.timeout(5000)});
    const body=await r.json();
    return r.ok && body.success===true && body.model_loaded===true ? 'ready':'not_ready';
  }catch{return 'unavailable';}
}
export async function analyze(bytes,type,name) {
  const form=new FormData();form.append('image',new Blob([bytes],{type}),name);
  let data,result;
  try {
    const response=await fetch(aiBase()+'/predict',{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw new Error('AI service rejected or could not analyze this image.');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>128000)throw new Error('AI response too large.');chunks.push(Buffer.from(chunk));}
    const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));data=payload.data;
    if(payload.success!==true)throw new Error('Invalid AI response.');
    result=normalizeAnalysis(data);
  }catch(e){throw Object.assign(new Error(e.name==='TimeoutError'?'AI analysis timed out. No scan credit is used for a failed scan.':'AI analysis unavailable or invalid. Check the AI service terminal and model loading.',{cause:e}),{code:'AI_ANALYSIS_FAILED'});}
  const heatmap=await loadReportHeatmap(data.heatmap_path,{baseUrl:aiBase()});
  result.analyzed_at=new Date().toISOString();
  if(!heatmap&&result.gradcam?.status==='available')result.gradcam={...result.gradcam,status:'unavailable',reason:'delivery_failed'};
  return {result,heatmap};
}
