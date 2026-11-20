import {classificationReason,classificationLimit} from '../../shared/result-language.mjs';
export function scorePresentation(result) {
  if(result?.provider==='truthscan'&&result.provider_label==='Digitally Edited')return {label:'Digital-editing confidence',value:result.provider_label_confidence};
  if(result?.provider==='truthscan')return {label:'Provider label confidence',value:result.provider_label_confidence};
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
  if(!['authentic','ai_generated'].includes(g.target))return 'The saved heatmap target is unknown. Do not infer which class its highlights explain.';
  const target=g.target==='authentic'?'Authentic':'AI-generated';
  if(g.palette!=='blue-green-yellow-v1')return `Explains the ${target} score. The saved color scale is unknown, so colors cannot be interpreted reliably. Highlights are not confirmed edits.`;
  return `Explains the ${target} score. Blue: lower; green: intermediate; yellow: higher relative contribution to that score. Yellow does not mean edited, and blue does not mean authentic. Colors are relative within this image, not probabilities or edited boundaries.`;
}

// Explain only recorded classifier evidence. Scene captions are not its reasoning.
export function verdictExplanation(scan) {
  const r=scan?.analysis;
  if(scan?.status!=='completed'||!['authentic','ai_generated','uncertain'].includes(r?.verdict))
    return {summary:scan?.status==='failed'?'Analysis failed, so there is no AI-generated or authentic result to explain.':'The analysis is not complete yet. An explanation will appear when a result is available.',scores:null,heatmap:null,policy:null};
  const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
  const pct=n=>(n*100).toFixed(2)+'%';
  const summary=r.provider==='truthscan'&&r.provider_label==='AI Edited'&&r.verdict==='ai_generated'
    ?'The analysis found signs of AI involvement. This does not mean the entire image was AI-generated. Results are estimates, not proof.'
    :classificationReason(r)+' '+classificationLimit(r);
  if(r.display_grouping==='authentiscan_digital_editing_group_v1')return {summary:'This result does not confirm that the image is unedited or human-made, and it does not rule out AI involvement. Results are estimates, not proof.',scores:null,heatmap:null,policy:'Digitally edited results with at least 60% editing-label confidence use the Authentic application grouping. This does not verify human authorship. The score measures confidence in detecting digital editing, not confidence in authenticity. Separate Authentic and AI-generated scores were not supplied.'};
  if(r.provider==='truthscan')return {
    summary, scores: null, heatmap: null,
    policy:r.decision_rule==='truthscan_label_confidence_60_v2'
      ?'Real requires at least 60% label confidence for Authentic. AI Generated or AI Edited requires at least 60% label confidence for AI-Generated. Lower confidence, Digitally Edited, and unsupported categories map to Uncertain. Confidence retains the returned label meaning; separate binary class scores were not supplied.'
      :'Authentic or AI-Generated requires at least 60% confidence in the corresponding provider label. Lower confidence, editing categories, and unsupported categories map to Uncertain. Provider confidence is not a pair of Authentic and AI-generated class scores.',
  };
  const scores=valid(r.authentic_score)&&valid(r.ai_generated_score)?`Saved class scores: Authentic ${pct(r.authentic_score)} · AI-generated ${pct(r.ai_generated_score)}. These are model scores, not verified probabilities. Displayed percentages are rounded; decisions use unrounded scores.`:null;
  const g=r.gradcam;
  const heatmap=r.heatmap_url&&g?.status==='available'&&g.target===r.verdict&&r.verdict!=='uncertain'
    ?`The Grad-CAM below shows which regions contributed to the ${r.verdict==='authentic'?'Authentic':'AI-generated'} score. It does not tell us which visual feature caused that score or prove an edit.`:null;
  const policy=r.decision_rule==='manuscript_min_score_v1'&&r.minimum_class_score===.6
    ?'Manuscript rule: Authentic when its score is at least 60%; AI-generated when its score is at least 60%; Uncertain when both scores are below 60%. Exactly 60% selects that class. The rule uses unrounded scores.'
    :r.inference_contract_version===2&&valid(r.decision_threshold)&&valid(r.uncertainty_margin)
    ?`The saved rule compares the authentic score with a ${pct(r.decision_threshold)} threshold and a ±${pct(r.uncertainty_margin)} uncertainty band. Scores inside or on the band are uncertain; above it selects Authentic, below it selects AI-generated.`:null;
  return {summary,scores,heatmap,policy};
}
