import {normalizeScene} from './scene-provider-contract.mjs';

// Model context is tentative, not authorship evidence. Only accept the existing
// scene contract with a matching image hash; never infer context from a filename.
export function visualReviewContext(review,sceneAnalysis){
  if(review.image_type==='logo_graphic')return 'graphic';
  if(review.image_type==='illustration')return 'art';
  const fallback=({document:'document',screenshot:'screenshot',photograph_like:'photo'})[review.image_type]||null;
  if(!review.input_sha256)return fallback;
  let scene;
  try{scene=normalizeScene(sceneAnalysis,review.input_sha256);}catch{return fallback;}
  // Recognize the main subject, not an incidental poster inside a photograph.
  const main=scene.observation.trim().replace(/^(?:(?:this|the)\s+)?(?:image|picture|photograph|photo)\s+(?:shows|depicts|features|contains|is)\s+/i,'');
  const graphic=/^(?:(?:a|an|the)\s+)?(?:(?:colorful|colourful|digital|designed|promotional)\s+)*(?:graphic\b|collage\b|poster\b|flyer\b|infographic\b|scorecard\b)/i;
  const layout=/\b(portraits?|headshots?|photos?|photographs?)\b/i.test(main)&&
    /\b(arranged|layout|grid|panels?|frames?|side.by.side)\b/i.test(main)&&/\b(text|names?|scores?|points?|labels?)\b/i.test(main);
  if(graphic.test(main)||(['document','screenshot','logo'].includes(scene.image_type)&&layout))return 'graphic';
  if(scene.image_type==='logo')return 'graphic';
  if(scene.image_type==='illustration')return 'art';
  return ({document:'document',screenshot:'screenshot',photograph:'photo'})[scene.image_type]||fallback;
}
