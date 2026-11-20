// Real local inference only. Pass a public/local test image, never upload it to cloud.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import net from 'node:net';
import assert from 'node:assert/strict';
import {detectorPython} from '../scripts/object-detector.mjs';
import {detectObjects,objectReadiness} from '../server/object-detection.mjs';
const bytes=await readFile(process.argv[2]);
const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
process.env.OBJECT_DETECTOR_URL=`http://127.0.0.1:${port}`;
const child=spawn(detectorPython,['-u','detector/service.py'],{env:{...process.env,OBJECT_DETECTOR_PORT:String(port)},stdio:['ignore','inherit','inherit'],windowsHide:true});
let failure;child.on('error',e=>{failure=e;});
const exited=new Promise(resolve=>child.once('exit',resolve));
try{
  for(let n=0;n<180&&!failure;n++){if(await objectReadiness()==='ready')break;await new Promise(r=>setTimeout(r,500));}
  assert.equal(await objectReadiness(),'ready');
  const start=performance.now(),result=await detectObjects(bytes);
  assert.ok(result.objects.length>0,'Public sample should produce at least one object');
  console.log(JSON.stringify({real_inference:true,elapsed_ms:Math.round(performance.now()-start),model:result.model_version,objects:result.objects.map(o=>({label:o.label,score:o.score,box:o.box}))},null,2));
  const url=process.env.OBJECT_DETECTOR_URL+'/detect';
  assert.equal((await fetch(url,{method:'POST',body:bytes})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{'X-AuthentiScan-Detector':'local-object-detection-v1','Origin':'https://example.com'},body:bytes})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{'X-AuthentiScan-Detector':'local-object-detection-v1'},body:'invalid image'})).status,422);
  console.log('PASS: real CPU inference, browser-origin denial, missing-header denial, and invalid-image rejection');
}finally{child.kill();await exited;}
