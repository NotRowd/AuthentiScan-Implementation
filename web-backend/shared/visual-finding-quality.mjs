// Text consistency checks only; these cannot independently verify image pixels.
export const WITHHELD_VISUAL_NOTE='This finding was withheld because its evidence was inconclusive: hidden details or an unsupported object overlap.';
export const PEOPLE_DIFFERENCE_NOTE='This finding was withheld because normal differences between people are not evidence of a visual defect.';
export function ordinaryPeopleDifference(item){
  const text=(item.observation||'')+' '+(item.reason||'');
  const people=/\b(other\s+(?:(?:two|three|\d+)\s+)?(?:people|persons|faces|portraits)|different people|another person|other person|than (?:the )?others)\b/i;
  const trait=/\b(eyes?|hair|skin|face\w*|facial|height)\b/i;
  const difference=/\b(colou?r|tone|size|shape|height|different|taller|shorter)\b/i;
  const defect=/\b(extra|duplicat\w*|fused|merg\w*|detach\w*|disconnect\w*|broken|split|melt\w*|two pupils|six fingers)\b/i;
  return people.test(text)&&trait.test(text)&&difference.test(text)&&!defect.test(text);
}
export function unsupportedVisualFinding(item){
  const observation=item.observation||'',reason=item.reason||'';
  const text=observation+' '+reason;
  if(ordinaryPeopleDifference(item))return true;
  // Visibility limits are not visible defects. Preserve specific positive
  // evidence, e.g. an extra pupil, despite another part being partly hidden.
  const limited=/\b(not (?:clearly |fully |easily )?visible|(?:partly |partially |completely )?(?:hidden|obscured|covered)|out of (?:the )?frame|cannot be seen|can.t be seen)\b/i;
  const defect=/\b(extra|duplicat\w*|fused|merg\w*|detach\w*|disconnect\w*|broken|split|melt\w*|two pupils|six fingers|missing (?:edge|outline|boundary))\b/i;
  if(limited.test(text)&&!defect.test(text))return true;
  // A closed eye on its own is an ordinary pose, not malformed anatomy.
  if(item.category==='eyes'&&/\beyes?\b.{0,45}\bclosed\b/i.test(observation)&&!defect.test(text))return true;
  // An object in front of a body can look attached in a flat image. Require
  // an additional visible boundary/connection detail before surfacing that claim.
  const origin=/\b(extend\w*|emerg\w*|grow\w*|coming|come)\b.{0,65}\b(body|torso|shoulder|chest|skin)\b/i;
  const object=/\b(held|hold\w*|carri\w*|worn|wear\w*|equipment|object|tool|strap|barrel|rifle|weapon)\b/i;
  const boundary=/\b(edge\w*|outline\w*|boundar\w*|connection|junction)\b/i;
  const boundaryDefect=/\b(merg\w*|fus\w*|disappear\w*|broken|missing|disconnect\w*|interrupt\w*)\b/i;
  if(origin.test(text)&&object.test(text)&&!(boundary.test(reason)&&boundaryDefect.test(reason)))return true;
  return false;
}
