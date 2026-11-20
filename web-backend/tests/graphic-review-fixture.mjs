import {SCENE_MODEL,SCENE_REVISION,SCENE_EXPLANATION_VERSION} from '../shared/scene-provider-contract.mjs';
export const graphicEyeFinding={category:'eyes',status:'possible_concern',
 observation:'The eyes of the person in the center appear to be a different color than the others.',
 location:'The center portrait of the person named Primo.',
 reason:'The eyes are a different color than the eyes of the other two people in the image.'};
export const graphicScene=hash=>({schema_version:1,status:'available',assessment:'tentative',
 model_version:SCENE_MODEL,model_revision:SCENE_REVISION,explanation_version:SCENE_EXPLANATION_VERSION,
 input_sha256:hash,image_type:'document',changes_verdict:false,
 observation:'A graphic image with three portrait photos of people, each with a name and point total, set against a colorful background with text in Filipino.',
 visual_assessment:'Visual observations are separate from the classifier result.'});
export const fourPortraitScene=hash=>({...graphicScene(hash),observation:'A graphic displaying four portraits of individuals with names and point totals, set against a colorful background with text in Filipino.'});
