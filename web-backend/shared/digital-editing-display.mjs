// Read-only application grouping. Preserve the stored classifier result and scores.
export const DIGITAL_EDITING_DISPLAY_RULE='authentiscan_digital_editing_group_v1';
export function withDigitalEditingDisplay(row){
  const a=row?.analysis,c=a?.provider_label_confidence;
  if(row?.status!=='completed'||a?.provider!=='truthscan'||a.provider_label!=='Digitally Edited'||typeof c!=='number'||!Number.isFinite(c)||c<.6||c>1||a.display_grouping===DIGITAL_EDITING_DISPLAY_RULE)return row;
  return {...row,analysis:{...a,verdict:'authentic',display_grouping:DIGITAL_EDITING_DISPLAY_RULE,
    original_verdict:a.verdict,original_decision_rule:a.decision_rule,decision_rule:DIGITAL_EDITING_DISPLAY_RULE,
    confidence_kind:'digital_editing_confidence',authentic_score:null,ai_generated_score:null,
    readable_explanation:'Digital editing was detected. AuthentiScan groups this result under Authentic, but the analysis does not verify human authorship or rule out AI involvement.'}};
}

// Display policy only: saved analysis and stored media remain unchanged.
export function originalImageOnly(analysis){
  return analysis?.verdict==='authentic'||analysis?.provider_label==='Digitally Edited';
}
