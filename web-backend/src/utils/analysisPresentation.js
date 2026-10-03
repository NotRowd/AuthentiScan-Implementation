export function scorePresentation(result) {
  if(result?.verdict==='authentic')return {label:'Authentic class score',value:result.authentic_score};
  if(result?.verdict==='ai_generated')return {label:'AI-generated class score',value:result.ai_generated_score};
  return {label:'Highest class score (uncertain)',value:result&&Number.isFinite(result.authentic_score)&&Number.isFinite(result.ai_generated_score)?Math.max(result.authentic_score,result.ai_generated_score):null};
}
export function heatmapExplanation(result) {
  const g=result?.gradcam;
  if(!g)return 'This older result did not record its heatmap target or palette. Do not infer which class its colors explain.';
  if(g.reason==='uncertain_prediction')return 'The prediction is uncertain. No single-class heatmap is shown.';
  if(g.reason==='no_positive_attribution')return 'No usable positive attribution was found. This does not prove authenticity.';
  if(g.status!=='available')return 'Grad-CAM is unavailable for this saved result. The classification scores are unchanged.';
  return `Explains the ${g.target==='authentic'?'authentic':'AI-generated'} score. Blue: low; green: intermediate; yellow: higher relative contribution. Values from about 0.67 to 1 share yellow. Colors are normalized per image and blended 40% over the original; they are not probabilities or edited boundaries.`;
}
