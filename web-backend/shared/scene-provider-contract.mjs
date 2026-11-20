// New provider; retain the locked SmolVLM contract for historical records.
import {normalizeScene as normalizeLegacy, SCENE_IMAGE_TYPES, SCENE_DISCLAIMER} from './scene-contract.mjs';
export const SCENE_MODEL='qwen3-vl-2b-q4km-f16-review-v1';
export const SCENE_REVISION='52d6c8ffea26cc873ac5ad116f8631268d7eb503';
export const SCENE_EXPLANATION_VERSION=3;
export const isCurrentScene=data=>data?.model_version===SCENE_MODEL&&data.explanation_version===SCENE_EXPLANATION_VERSION;
export function normalizeScene(data,hash){
  if(data?.model_version!==SCENE_MODEL)return normalizeLegacy(data,hash);
  const text=value=>typeof value==='string'&&value.trim()&&value.length<=1600&&!/[\u0000-\u001f\u007f]/.test(value);
  if(data.schema_version!==1||data.status!=='available'||data.assessment!=='tentative'||
    data.model_revision!==SCENE_REVISION||data.explanation_version!==SCENE_EXPLANATION_VERSION||
    data.changes_verdict!==false||!Object.hasOwn(SCENE_IMAGE_TYPES,data.image_type)||
    !/^[a-f0-9]{64}$/.test(data.input_sha256||'')||(hash&&data.input_sha256!==hash)||
    !text(data.observation)||!text(data.visual_assessment))throw new Error('Invalid Qwen scene observation.');
  return {schema_version:1,status:'available',assessment:'tentative',model_version:SCENE_MODEL,
    model_revision:SCENE_REVISION,explanation_version:SCENE_EXPLANATION_VERSION,input_sha256:data.input_sha256,
    image_type:data.image_type,observation:data.observation,visual_assessment:data.visual_assessment,
    disclaimer:SCENE_DISCLAIMER,changes_verdict:false};
}
