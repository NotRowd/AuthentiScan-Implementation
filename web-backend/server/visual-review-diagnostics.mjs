// Only fixed, non-sensitive diagnostics enter terminal logs. Never include image
// bytes, model-generated text, request bodies, credentials, or arbitrary errors.
import {visualErrorCode} from '../shared/visual-review-errors.mjs';
export function visualTransportError(error){
  const timeout=error?.name==='TimeoutError'||error?.name==='AbortError';
  return Object.assign(new Error(timeout?'Local visual model timed out.':'Local visual service could not be reached.'),{code:timeout?'VISUAL_TIMEOUT':'VISUAL_OFFLINE'});
}
export function visualHttpError(status,code){
  const fallback=status===429?'VISUAL_BUSY':status===504?'VISUAL_TIMEOUT':status===502?'VISUAL_INVALID_RESPONSE':'VISUAL_MODEL_FAILURE';
  return Object.assign(new Error('Local visual service did not complete the request.'),{code:code&&visualErrorCode(code)===code?code:fallback});
}
export async function readVisualResponse(response,limit){
  const chunks=[];let size=0;
  try{
    for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw new Error('Response too large');chunks.push(Buffer.from(chunk));}
  }catch(error){
    if(error?.name==='TimeoutError'||error?.name==='AbortError')throw visualTransportError(error);
    throw Object.assign(new Error('Unusable visual response.'),{code:'VISUAL_INVALID_RESPONSE'});
  }
  let body;
  try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{
    throw response.ok?Object.assign(new Error('Unusable visual response.'),{code:'VISUAL_INVALID_RESPONSE'}):visualHttpError(response.status);
  }
  if(!response.ok)throw visualHttpError(response.status,body?.code);
  return body;
}
export function logVisualFailure(label,error,log=console.warn){
  const reasons={VISUAL_OFFLINE:'service not reachable on port 5005; check scene startup',VISUAL_TIMEOUT:'model request timed out',VISUAL_BUSY:'model queue busy; retry after the current review finishes',VISUAL_MODEL_FAILURE:'model could not complete this image review',VISUAL_INVALID_RESPONSE:'model returned an unusable response; no findings were invented'};
  log(`${label} unavailable: ${reasons[Object.hasOwn(reasons,error?.code)?error.code:'VISUAL_INVALID_RESPONSE']}. Classification is preserved.`);
}
