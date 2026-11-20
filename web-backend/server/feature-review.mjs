import {createHash} from 'node:crypto';
import {FEATURE_REVIEW_VERSION,normalizeFeatureReview} from '../shared/feature-review-contract.mjs';
import {runVisualReview} from './visual-review-queue.mjs';
import {visualTransportError,readVisualResponse} from './visual-review-diagnostics.mjs';
export async function reviewFeatures(bytes){
  return runVisualReview(async()=>{
  let response;
  try{response=await fetch('http://127.0.0.1:5005/features',{method:'POST',body:bytes,
    headers:{'Content-Type':'application/octet-stream','X-AuthentiScan-Features':FEATURE_REVIEW_VERSION},
    redirect:'error',signal:AbortSignal.timeout(300000)});}catch(error){throw visualTransportError(error);}
  const payload=await readVisualResponse(response,16000);
  if(payload.success!==true)throw new Error('Invalid feature review response');
  return normalizeFeatureReview(payload.data,createHash('sha256').update(bytes).digest('hex'));
  });
}
