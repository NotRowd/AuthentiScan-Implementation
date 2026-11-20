// Real local inference through the production adapters, isolated from Firebase.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {explainScene} from '../server/scene.mjs';
import {reviewFeatures} from '../server/feature-review.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const port=5015;
await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
const child=spawn(root+'ai-localization/.venv-vaas/Scripts/python.exe',['-u',root+'ai-scene/qwen_service.py','--port',String(port),'--parent-pipe'],{stdio:['pipe','inherit','inherit'],windowsHide:true});
const exited=new Promise(resolve=>child.once('exit',resolve));
child.stdin.on('error',()=>{});
let spawnError;child.on('error',e=>{spawnError=e;});
const originalFetch=globalThis.fetch;
// Redirect only the adapters' fixed scene port to our temporary local service.
globalThis.fetch=(url,options)=>originalFetch(String(url).replace('http://127.0.0.1:5005/','http://127.0.0.1:5015/'),options);
try{
  let ready=false;
  for(let i=0;i<120;i++){
    if(spawnError)throw spawnError;
    if(child.exitCode!==null)throw new Error('Temporary service exited');
    try{const r=await originalFetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  assert.ok(ready,'Temporary service must be ready');
  const bytes=await readFile(root+'firebase-local/src/assets/logo.png');
  const start=Date.now(),scene=await explainScene(bytes),review=await reviewFeatures(bytes);
  assert.equal(scene.explanation_version,3);
  assert.equal(scene.model_version,'qwen3-vl-2b-q4km-f16-review-v1');
  assert.equal(review.model_version,scene.model_version);
  assert.equal(review.input_sha256,scene.input_sha256);
  assert.equal(review.findings.length,5);
  console.log(JSON.stringify({seconds:(Date.now()-start)/1000,scene,review},null,2));
}finally{
  globalThis.fetch=originalFetch;
  child.stdin.end();
  await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Service did not exit after parent EOF')),15000);timer.unref();})]);
  console.log('Temporary service exited; no production service was stopped.');
}
