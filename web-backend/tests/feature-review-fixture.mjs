import {ANOMALY_REVIEW_VERSION,FEATURE_LABELS,FEATURE_REVIEW_VERSION} from '../shared/feature-review-contract.mjs';
import {SCENE_MODEL,SCENE_REVISION} from '../shared/scene-provider-contract.mjs';
export const featureFixture=(hash='a'.repeat(64))=>({schema_version:1,review_version:FEATURE_REVIEW_VERSION,status:'completed',
  model_version:SCENE_MODEL,model_revision:SCENE_REVISION,input_sha256:hash,changes_verdict:false,classifier_reason:false,validation_status:'not_validated',
  findings:Object.keys(FEATURE_LABELS).map(category=>({category,status:'unable_to_assess',observation:'Not enough reliable model detail to assess this feature.'}))});

export const currentFeatureFixture=hash=>{
  const review=featureFixture(hash);
  return {...review,anomaly_review_version:ANOMALY_REVIEW_VERSION,
    findings:review.findings.map(finding=>({...finding,location:'',reason:''}))};
};
