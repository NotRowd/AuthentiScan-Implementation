import {createHash} from 'node:crypto';
import {normalizeScene,SCENE_EXPLANATION_VERSION} from '../shared/scene-provider-contract.mjs';
import {runVisualReview} from './visual-review-queue.mjs';
import {visualTransportError,readVisualResponse} from './visual-review-diagnostics.mjs';
export async function explainScene(bytes){
  return runVisualReview(async()=>{
  let response;
  try{response=await fetch('http://127.0.0.1:5005/explain',{method:'POST',body:bytes,
    headers:{'Content-Type':'application/octet-stream','X-AuthentiScan-Scene':'local-scene-v1'},redirect:'error',signal:AbortSignal.timeout(180000)});}catch(error){throw visualTransportError(error);}
  const body=await readVisualResponse(response,12000);
  if(body.success!==true)throw new Error('Invalid scene response');
  if(body.data?.explanation_version!==SCENE_EXPLANATION_VERSION)throw new Error('Restart the scene service for the updated explanation.');
  return normalizeScene(body.data,createHash('sha256').update(bytes).digest('hex'));
  });
}
