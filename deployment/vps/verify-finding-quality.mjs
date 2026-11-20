import assert from 'node:assert/strict';
import {normalizeFeatureReview,ANOMALY_REVIEW_VERSION,FEATURE_REVIEW_VERSION} from '/app/shared/feature-review-contract.mjs';
import {SCENE_MODEL,SCENE_REVISION} from '/app/shared/scene-provider-contract.mjs';
import {returnedFindings} from '/tmp/visual-finding-quality-fixture.mjs';
const data={schema_version:1,status:'completed',review_version:FEATURE_REVIEW_VERSION,model_version:SCENE_MODEL,
 model_revision:SCENE_REVISION,input_sha256:'a'.repeat(64),changes_verdict:false,classifier_reason:false,validation_status:'not_validated',
 anomaly_review_version:ANOMALY_REVIEW_VERSION,findings:['eyes','shape','texture','lighting','scene'].map(category=>({category,status:'no_clear_concern',observation:'No clear concern reported.',location:'',reason:''}))};
for(const item of returnedFindings)data.findings[data.findings.findIndex(f=>f.category===item.category)]=item;
const result=normalizeFeatureReview(data);
assert.equal(result.findings.filter(f=>f.status==='possible_concern').length,0);
assert.ok(result.findings.slice(0,2).every(f=>f.status==='unable_to_assess'));
data.findings[4]={category:'scene',status:'possible_concern',observation:'The person appears to emerge through the solid road surface.',location:'Center-right, at the torso and road contact',reason:'A human body cannot naturally pass through a solid asphalt road.'};
assert.equal(normalizeFeatureReview(data).findings[4].status,'possible_concern');
console.log('PASS: deployed API withholds the actual false findings and preserves a supported physical-interaction observation.');
