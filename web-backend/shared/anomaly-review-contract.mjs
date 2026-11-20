// Sparse findings keep a clean result distinct from a failed or withheld review.
export const SPARSE_ANOMALY_VERSION='visual-anomalies-v4';
const categories=new Set(['eyes','shape','texture','lighting','scene']);
const safeText=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const provenance=/\b(ai[ -]generated|authentic|fake|deepfake|photoshop\w*|manipulat\w*|proves?|certainly|definitely)\b/i;
export function normalizeSparseAnomalies(data,hash,{model,revision}){
  if(data?.schema_version!==1||data.review_version!=='visual-features-v1'||data.status!=='completed'||
    data.anomaly_review_version!==SPARSE_ANOMALY_VERSION||data.model_version!==model||data.model_revision!==revision||
    !/^[a-f0-9]{64}$/.test(data.input_sha256||'')||(hash&&data.input_sha256!==hash)||
    data.changes_verdict!==false||data.classifier_reason!==false||data.validation_status!=='not_validated'||
    !['possible_concerns','no_significant_anomalies','inconclusive'].includes(data.review_outcome)||
    !Array.isArray(data.findings)||data.findings.length>2||
    Boolean(data.findings.length)!==(data.review_outcome==='possible_concerns'))throw new Error('Invalid sparse anomaly review.');
  const findings=[];
  for(const item of data.findings){
    if(!item||!categories.has(item.category)||item.status!=='possible_concern'||
      !safeText(item.title,100)||!safeText(item.observation,500)||!safeText(item.location,120)||!safeText(item.reason,300))throw new Error('Missing anomaly evidence.');
    const combined=[item.title,item.observation,item.location,item.reason].join(' ');
    if(provenance.test(combined)||!/[.!?]$/.test(item.observation.trim())||!/[.!?]$/.test(item.reason.trim())||
      item.observation.trim().split(/\s+/).length<6||item.reason.trim().split(/\s+/).length<5||
      item.observation.trim().toLowerCase()===item.reason.trim().toLowerCase())continue;
    if(findings.some(old=>old.observation.toLowerCase()===item.observation.trim().toLowerCase()))continue;
    findings.push({category:item.category,status:'possible_concern',title:item.title.trim(),observation:item.observation.trim(),location:item.location.trim(),reason:item.reason.trim()});
  }
  const outcome=data.review_outcome==='possible_concerns'&&!findings.length?'inconclusive':data.review_outcome;
  return {schema_version:1,review_version:'visual-features-v1',anomaly_review_version:SPARSE_ANOMALY_VERSION,
    status:'completed',model_version:model,model_revision:revision,input_sha256:data.input_sha256,
    review_outcome:outcome,findings,changes_verdict:false,classifier_reason:false,validation_status:'not_validated'};
}
