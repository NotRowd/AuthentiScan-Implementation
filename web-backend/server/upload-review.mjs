import {normalizeScene,isCurrentScene} from '../shared/scene-provider-contract.mjs';
import {normalizeFeatureReview} from '../shared/feature-review-contract.mjs';
import {SCENE_MODEL} from '../shared/scene-provider-contract.mjs';
import {logVisualFailure} from './visual-review-diagnostics.mjs';
import {visualErrorCode} from '../shared/visual-review-errors.mjs';

// These are optional observations, never classifier reasons or extra charged scans.
// Sequence the calls: both endpoints share one CPU model and a short image cache.
export async function prepareUploadReview(bytes,hash,{explainScanScene,reviewImageFeatures}){
  let scene=null,review=null,sceneError=null,featureError=null;
  try{
    scene=normalizeScene(await explainScanScene(bytes),hash);
    if(!isCurrentScene(scene))scene=null;
  }catch(error){sceneError=visualErrorCode(error.code);logVisualFailure('Image description',error);}
  try{
    review=normalizeFeatureReview(await reviewImageFeatures(bytes),hash);
    if(review.model_version!==SCENE_MODEL)review=null;
  }catch(error){featureError=visualErrorCode(error.code);logVisualFailure('Visual feature review',error);}
  return {scene_analysis:scene,feature_review:review,
    upload_review:{version:1,scene:scene?'completed':'unavailable',features:review?'completed':'unavailable',
      ...(sceneError?{scene_error:sceneError}:{}),...(featureError?{features_error:featureError}:{})}};
}
