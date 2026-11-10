import type { ScanResult } from '../../types';

export const FEATURE_LABELS: Record<string, string> = {
  eyes: 'Eyes and facial details',
  shape: 'Anatomy, shape and proportions',
  texture: 'Surface textures and boundaries',
  lighting: 'Lighting, shadows and reflections',
  scene: 'Object and environmental consistency',
};

const CURRENT_REVIEW_VERSION = 'visual-anomalies-simple-v1';

export function describeVisualReview(review: ScanResult['featureReview'], scene: ScanResult['sceneAnalysis']) {
  const findings = review?.findings;
  if (review?.anomaly_review_version !== CURRENT_REVIEW_VERSION || !findings?.length) return null;

  const sceneMatches = !!review.input_sha256 && review.input_sha256 === scene?.input_sha256;
  const subject = sceneMatches ? (scene?.observation || '').trim()
    .replace(/^(?:(?:this|the)\s+)?(?:image|picture|photograph|photo)\s+(?:shows|depicts|features|contains|is)\s+/i, '') : '';
  const graphic = review.image_type === 'logo_graphic' || (sceneMatches && (scene?.image_type === 'logo' ||
    /^(?:(?:a|an|the)\s+)?(?:(?:colorful|colourful|digital|designed|promotional)\s+)*(?:graphic|collage|poster|flyer|infographic|scorecard)\b/i.test(subject)));
  const context = graphic ? 'This looks like a designed graphic or collage. Text and frames may be intentional.'
    : review.image_type === 'illustration' || (sceneMatches && scene?.image_type === 'illustration')
      ? 'This looks like artwork. Unusual colors and shapes may be part of its style.'
      : review.image_type === 'document' ? 'This looks like a document. Its layout may be intentional.'
        : review.image_type === 'screenshot' ? 'This looks like a screenshot. Its layout may be intentional.' : '';
  const concerns = findings.filter(item => item.status === 'possible_concern').slice(0, 2);
  const withheld = findings.some(item => item.status === 'unable_to_assess' && /withheld|inconclusive/i.test(item.observation));
  const uncertain = withheld || findings.every(item => item.status === 'unable_to_assess');
  const summary = concerns.length ? concerns.map(({ observation, location, reason }) => {
    const area = location?.trim().replace(/[.!?]+$/, '') || '';
    return [observation, area && !observation.toLowerCase().includes(area.toLowerCase()) ? 'Area to check: ' + area + '.' : '', reason]
      .filter(Boolean).join(' ');
  }).join(' ') : uncertain ? 'We could not confirm a specific unusual detail in the areas checked.'
    : 'Nothing clearly looks unusual in the details the AI could check.';
  return {
    findings,
    label: concerns.length ? 'Possible unusual details' : uncertain ? 'Review uncertain' : 'No clear unusual details',
    text: [context, summary].filter(Boolean).join(' '),
  };
}
