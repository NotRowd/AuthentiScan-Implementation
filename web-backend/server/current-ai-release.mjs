// Locked web/mobile baseline. This is a reproducibility pin, not an accuracy claim.
export const CURRENT_AI_RELEASE = Object.freeze({
  id: 'authentiscan-2026-10-10-manuscript60',
  model_version: 'loyd-classifier-v1-research',
  preprocessing_version: 'exif-white-rgb-pillow-bilinear-224-v2',
  policy_version: 'sha256:f56f876dbf8234b6',
  decision_rule: 'manuscript_min_score_v1',
  minimum_class_score: 0.6,
});
export function matchesCurrentAi(value) {
  return Object.entries(CURRENT_AI_RELEASE).filter(([key]) => key !== 'id').every(([key, expected]) => value?.[key] === expected);
}
