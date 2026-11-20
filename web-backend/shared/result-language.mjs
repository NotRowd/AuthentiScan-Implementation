// Presentation only: explain saved evidence without reclassifying or inventing visual causes.
export function classificationReason(r) {
  if(r?.display_grouping==='authentiscan_digital_editing_group_v1')return r.readable_explanation;
  const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
  const pct = n => (n * 100).toFixed(2) + '%';
  if (!r || !['authentic', 'ai_generated', 'uncertain'].includes(r.verdict)) return 'No completed classification is available to explain.';
  if (r.provider === 'truthscan' && ['truthscan_label_confidence_60_v1','truthscan_label_confidence_60_v2'].includes(r.decision_rule)) return r.readable_explanation;
  const label = r.verdict === 'authentic' ? 'Authentic' : 'AI-generated';
  const fallback = r.verdict === 'uncertain'
    ? 'The classifier returned Uncertain: its saved decision rule did not select either class.'
    : 'The classifier labeled this image ' + label + '.';
  if (!valid(r.authentic_score) || !valid(r.ai_generated_score) || Math.abs(r.authentic_score + r.ai_generated_score - 1) > .00001)
    return fallback + ' The saved scores are incomplete or inconsistent, so a score-based reason cannot be verified.';
  const a = r.authentic_score, ai = r.ai_generated_score;
  if (r.decision_rule === 'manuscript_min_score_v1' && r.minimum_class_score === .6) {
    if (r.verdict === 'uncertain' && a < .6 && ai < .6)
      return 'The classifier returned Uncertain because neither score reached the required 60%: Authentic ' + pct(a) + ' and AI-generated ' + pct(ai) + '. There is not enough model evidence to select either class.';
    const selected = r.verdict === 'authentic' ? a : ai;
    if (r.verdict !== 'uncertain' && selected >= .6)
      return 'The classifier labeled this image ' + label + ' because its ' + label + ' score (' + pct(selected) + ') met the saved 60% decision cutoff. The other class scored ' + pct(r.verdict === 'authentic' ? ai : a) + '.';
    return fallback + ' The saved scores and decision rule do not agree; this explanation does not replace the saved verdict.';
  }
  if (r.inference_contract_version === 2 && valid(r.decision_threshold) && valid(r.uncertainty_margin)) {
    const low = r.decision_threshold - r.uncertainty_margin, high = r.decision_threshold + r.uncertainty_margin;
    if (low >= 0 && high <= 1) {
      if (r.verdict === 'uncertain' && a >= low && a <= high)
        return 'The classifier returned Uncertain because its Authentic score (' + pct(a) + ') fell within the saved uncertainty band of ' + pct(low) + ' to ' + pct(high) + '. This older result has not been reclassified.';
      if ((r.verdict === 'authentic' && a > high) || (r.verdict === 'ai_generated' && a < low))
        return fallback + ' Its Authentic score (' + pct(a) + ') was ' + (r.verdict === 'authentic' ? 'above ' + pct(high) : 'below ' + pct(low)) + ', outside the saved uncertainty band. This older result uses its original rule, not the current 60% cutoff.';
    }
    return fallback + ' The recorded rule does not explain these scores consistently; the saved verdict is unchanged.';
  }
  return fallback + ' Saved scores: Authentic ' + pct(a) + ', AI-generated ' + pct(ai) + '. Its decision rule was not recorded or is unsupported, so we cannot verify why this class was selected.';
}
export function classificationLimit(r) {
  return r?.verdict === 'authentic'
    ? 'Authentic does not mean unedited. This does not rule out filters, editing, or AI-generated content that the model missed.'
    : r?.verdict === 'ai_generated'
      ? 'This is a model prediction, not proof of AI generation. It does not identify a specific visual defect or edited region.'
      : 'Uncertain is a completed result, not a failed scan. It does not confirm authenticity or AI generation.';
}
export const VISUAL_LIMIT = 'The saved classifier output does not identify a specific defect such as unusual eyes, skin texture, or lighting. Grad-CAM shows score contributions, not named reasons or confirmed edits.';
export const OBJECT_SCOPE = 'Boxes and labels show which common objects the detector recognized. They do not establish whether an object is AI-generated, edited, or physically impossible. Object detections do not change the saved classification.';

