// Presentation only: receives normalized observations, never infers image origin.
import {visualReviewContext} from './visual-review-context.mjs';
import {PEOPLE_DIFFERENCE_NOTE} from './visual-finding-quality.mjs';
export const REVIEW_FAILED='We could not check the image’s details reliably. Please try again.';
export const REVIEW_UNCERTAIN='The AI could not check enough details to give a clear explanation. This does not change the classification.';
export const REVIEW_CLEAR='Nothing clearly looks unusual in this image. This does not prove it is real.';
export const REVIEW_WITHHELD='We could not confirm a specific unusual detail. Some observations were unclear or conflicting, so they were not shown. This does not prove the picture is real.';
export function visualReviewParagraph(review,sceneAnalysis=null){
  const findings=review.findings.filter(item=>item.status==='possible_concern');
  const unable=review.findings.filter(item=>item.status==='unable_to_assess').length;
  const context=visualReviewContext(review,sceneAnalysis);
  const graphic=context==='graphic';
  const graphicIntro='This looks like a designed graphic or collage. Text, frames, and decorations can be intentional design choices.';
  const graphicNote='The design alone cannot tell us whether AI was used.';
  const otherIntro=({
    art:'This looks like artwork. Unusual colors and shapes may be part of its style and do not mean it is AI-generated.',
    document:'This looks like a document or text-based image. Text and layout choices alone do not show how it was made.',
    screenshot:'This looks like a screenshot. The screen layout alone does not show whether AI was used.',
  })[context]||'';
  if(!findings.length){
    const withheld=review.findings.some(item=>item.status==='unable_to_assess'&&/^(This finding was withheld|This check is inconclusive)/.test(item.observation||''));
    if(graphic){
      const normalDifference=review.findings.some(item=>item.observation===PEOPLE_DIFFERENCE_NOTE);
      const assessment=withheld?'No specific visual problem could be confirmed in the details checked.':unable===review.findings.length?'The AI could not check the image details reliably.':'No clear visual problem was found in the details checked.';
      return [graphicIntro,normalDifference?'Normal differences between people are not signs of AI generation.':'',assessment,graphicNote].filter(Boolean).join(' ');
    }
    if(otherIntro){
      const assessment=withheld?'Some observations were unclear or conflicting, so they were not shown. No specific visual problem could be confirmed.':unable===review.findings.length?'The AI could not check the image details reliably.':'Nothing clearly looks out of place in the details we could check.';
      return otherIntro+' '+assessment;
    }
    if(withheld)return REVIEW_WITHHELD;
    if(unable===review.findings.length)return REVIEW_UNCERTAIN;
    return REVIEW_CLEAR+(unable?' Some details were too small or hidden to check.':'');
  }
  const paragraphs=findings.map(item=>{
    const observation=item.observation.trim(),reason=item.reason.trim();
    const location=item.location.trim().replace(/[.!?]+$/,'');
    // New observations include their position. Retain it for older wording too.
    const words=location.toLowerCase().match(/[a-z]{4,}/g)||[];
    const located=words.filter(word=>observation.toLowerCase().includes(word)).length>=Math.min(2,words.length);
    const area=location.charAt(0).toLowerCase()+location.slice(1);
    return [observation,!located&&location?`Look at ${/^(the|a|an)\b/i.test(area)?area:'the '+area}.`:'',reason].filter(Boolean).join(' ');
  });
  return [graphic?graphicIntro:otherIntro,...paragraphs,
    'These details alone cannot tell us whether the picture was edited or AI-generated.'].filter(Boolean).join(' ');
}
