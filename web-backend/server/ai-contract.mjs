// Validate/retain explainability metadata without trusting arbitrary model fields.
export function normalizeAnalysis(data) {
  const verdicts=['authentic','ai_generated','uncertain'];
  if(!verdicts.includes(data?.verdict))throw new Error('Invalid AI verdict.');
  for(const key of ['confidence_score','authentic_score','ai_generated_score'])
    if(typeof data[key]!=='number'||!Number.isFinite(data[key])||data[key]<0||data[key]>1)throw new Error('Invalid AI score.');
  if(Math.abs(data.authentic_score+data.ai_generated_score-1)>1e-5)throw new Error('Inconsistent class scores.');
  for(const [key,max] of [['readable_explanation',8000],['model_version',200]])
    if(typeof data[key]!=='string'||!data[key].trim()||data[key].length>max)throw new Error('Invalid AI metadata.');
  const confidence=data.verdict==='authentic'?data.authentic_score:data.verdict==='ai_generated'?data.ai_generated_score:Math.max(data.authentic_score,data.ai_generated_score);
  const kind=data.verdict==='uncertain'?'max_class_score_no_verdict':'verdict_class_score';
  const result={verdict:data.verdict,confidence_score:confidence,confidence_kind:kind,
    authentic_score:data.authentic_score,ai_generated_score:data.ai_generated_score,
    readable_explanation:data.readable_explanation,model_version:data.model_version};
  if(data.inference_contract_version===undefined)return result; // Older service: target remains unknown.
  if(data.inference_contract_version!==2)throw new Error('Unsupported inference contract.');
  if(Math.abs(data.confidence_score-confidence)>1e-5||data.confidence_kind!==kind)throw new Error('Confidence semantics mismatch.');
  if(!Number.isFinite(data.decision_threshold)||data.decision_threshold<=0||data.decision_threshold>=1||
     !Number.isFinite(data.uncertainty_margin)||data.uncertainty_margin<0||data.uncertainty_margin>=0.5)throw new Error('Invalid decision policy.');
  const distance=Math.abs(data.authentic_score-data.decision_threshold);
  const expected=distance<=data.uncertainty_margin+1e-12?'uncertain':data.authentic_score>=data.decision_threshold?'authentic':'ai_generated';
  if(data.verdict!==expected)throw new Error('Verdict does not match policy.');
  for(const key of ['policy_version','preprocessing_version'])
    if(typeof data[key]!=='string'||!data[key].trim()||data[key].length>200)throw new Error('Invalid version.');
  const g=data.gradcam;
  const reasons=['uncertain_prediction','no_positive_attribution','nonfinite_attribution','missing_gradients','generation_failed'];
  if(!g||!['available','unavailable'].includes(g.status)||g.method!=='gradcam'||g.palette!=='blue-green-yellow-v1'||g.overlay_alpha!==0.4||
     g.target!==(data.verdict==='uncertain'?null:data.verdict))throw new Error('Invalid Grad-CAM metadata.');
  if(g.status==='available') {
    if(!g.target||g.reason!==null||!/^\/heatmaps\/[a-zA-Z0-9_-]{1,128}\.png$/.test(data.heatmap_path||'')||
      !Array.isArray(g.source_grid)||g.source_grid.length!==2||!g.source_grid.every(n=>Number.isInteger(n)&&n>0&&n<=4096))throw new Error('Invalid available heatmap.');
  } else if(!reasons.includes(g.reason)||data.heatmap_path!==null)throw new Error('Invalid unavailable heatmap.');
  if((g.reason==='uncertain_prediction')!==(data.verdict==='uncertain'))throw new Error('Invalid uncertain explanation.');
  Object.assign(result,{inference_contract_version:2,policy_version:data.policy_version,
    preprocessing_version:data.preprocessing_version,decision_threshold:data.decision_threshold,uncertainty_margin:data.uncertainty_margin,
    gradcam:{status:g.status,target:g.target,reason:g.reason,method:g.method,palette:g.palette,overlay_alpha:g.overlay_alpha,
      ...(g.status==='available'?{source_grid:g.source_grid}: {})}});
  return result;
}
