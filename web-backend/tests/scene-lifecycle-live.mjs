// Real local model, isolated adapter port. No accounts, uploads, Firebase or credits.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {superviseScene} from '../scripts/scene-supervisor.mjs';
import {explainScene} from '../server/scene.mjs';
import {reviewFeatures} from '../server/feature-review.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),port=5015;
async function free(p){await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(p,'127.0.0.1',()=>probe.close(resolve));});}
await free(port);await free(5007); // Do not interfere with another model session.
const children=[];
const fetchOriginal=globalThis.fetch;
async function healthy(pid){
  try{const response=await fetchOriginal(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(1000)});
    const data=await response.json();return response.ok&&(data.process_id===pid||data.launcher_process_id===pid)&&data.lifecycle_version===1&&data.model_loaded===true;
  }catch{return false;}
}
const stop=await superviseScene({launch:()=>{
  const child=spawn(root+'ai-localization/.venv-vaas/Scripts/python.exe',['-u',root+'ai-scene/qwen_service.py','--port',String(port),'--parent-pipe'],{stdio:['pipe','inherit','inherit'],windowsHide:true});
  children.push(child);return child;
},ready:healthy,monitorMs:500,restartMs:1500});
globalThis.fetch=(url,options)=>fetchOriginal(String(url).replace('http://127.0.0.1:5005/','http://127.0.0.1:5015/'),options);
try{
  assert.ok(await healthy(children[0].pid),'Model must start with lifecycle protection');
  const bytes=await readFile(root+'firebase-local/src/assets/logo.png');
  // Simulate clicking both retry buttons together. They must share the backend
  // queue instead of colliding at the single-model inference lock.
  const [scene,review]=await Promise.all([explainScene(bytes),reviewFeatures(bytes)]);
  assert.ok(scene.observation);assert.equal(review.findings.length,5);assert.equal(scene.input_sha256,review.input_sha256);
  console.log('PASS real descriptions + five-feature review through backend adapters (project logo only).');
  children[0].kill(); // Only our own temporary adapter; simulate abrupt termination.
  const deadline=Date.now()+180000;
  while(Date.now()<deadline){if(children.length===2&&await healthy(children[1].pid))break;await new Promise(r=>setTimeout(r,500));}
  assert.equal(children.length,2);assert.ok(await healthy(children[1].pid),'Forced exit must release model port and recover');
  const recovered=await explainScene(bytes);assert.equal(recovered.input_sha256,scene.input_sha256);
  console.log('PASS forced adapter termination cleans the real model and automatic recovery restores inference.');
}finally{
  globalThis.fetch=fetchOriginal;await stop();
}
await free(port);await free(5007);
console.log('PASS shutdown waits until adapter/model ports are reusable. No production service or saved scan changed.');
