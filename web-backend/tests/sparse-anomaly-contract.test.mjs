import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSparseAnomalies,SPARSE_ANOMALY_VERSION} from '../shared/anomaly-review-contract.mjs';
const provider={model:'candidate',revision:'pinned'};
const finding={category:'scene',status:'possible_concern',title:'Body and surface interaction',observation:'The person appears to be swimming through the road surface.',location:'Lower center-right, at the body and road boundary',reason:'The surrounding road appears solid, but the contact around the body resembles water.'};
const fixture=()=>({schema_version:1,review_version:'visual-features-v1',anomaly_review_version:SPARSE_ANOMALY_VERSION,status:'completed',model_version:provider.model,model_revision:provider.revision,input_sha256:'a'.repeat(64),review_outcome:'possible_concerns',findings:[finding],changes_verdict:false,classifier_reason:false,validation_status:'not_validated'});
test('sparse review preserves one combined what/where/why finding',()=>{
  const value=normalizeSparseAnomalies(fixture(),'a'.repeat(64),provider);
  assert.equal(value.findings.length,1);assert.deepEqual(value.findings[0],finding);
  assert.equal(value.changes_verdict,false);
});
test('empty clean and inconclusive results remain distinct',()=>{
  for(const review_outcome of ['no_significant_anomalies','inconclusive'])assert.equal(normalizeSparseAnomalies({...fixture(),review_outcome,findings:[]},null,provider).review_outcome,review_outcome);
  assert.throws(()=>normalizeSparseAnomalies({...fixture(),review_outcome:'no_significant_anomalies'},null,provider));
});
test('missing fields, different image/model and confirmed provenance cannot become findings',()=>{
  assert.throws(()=>normalizeSparseAnomalies(fixture(),'b'.repeat(64),provider));
  assert.throws(()=>normalizeSparseAnomalies(fixture(),null,{...provider,revision:'other'}));
  assert.throws(()=>normalizeSparseAnomalies({...fixture(),findings:[{...finding,location:''}]},null,provider));
  const value=normalizeSparseAnomalies({...fixture(),findings:[{...finding,reason:'This proves the image is AI-generated and manipulated.'}]},null,provider);
  assert.equal(value.review_outcome,'inconclusive');assert.equal(value.findings.length,0);
});
