import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeAnalysis} from '../firebase-local/server/ai-contract.mjs';
const base=process.argv[2]||'http://127.0.0.1:5011';
const health=await (await fetch(`${base}/health`)).json();
assert.equal(health.model_version,'loyd-classifier-v1-research');
assert.equal(health.preprocessing_version,'exif-white-rgb-pillow-bilinear-224-v2');
assert.equal(health.decision_rule,'manuscript_min_score_v1');
assert.equal(health.minimum_class_score,.6);
const form=new FormData();
form.append('image',new Blob([await readFile(new URL('../firebase-local/src/assets/hero.png',import.meta.url))],{type:'image/png'}),'hero.png');
const response=await fetch(`${base}/predict`,{method:'POST',body:form});
assert.equal(response.status,200);
const {data}=await response.json();
normalizeAnalysis(data);
assert.equal(data.decision_rule,health.decision_rule);
assert.equal(data.policy_version,health.policy_version);
assert.equal(data.verdict,data.authentic_score>=.6?'authentic':data.ai_generated_score>=.6?'ai_generated':'uncertain');
if(data.verdict==='uncertain'){
  assert.equal(data.gradcam.status,'unavailable');assert.equal(data.gradcam.target,null);assert.equal(data.heatmap_path,null);
}else{
  assert.equal(data.gradcam.status,'available');
  const heatmap=await fetch(`${base}${data.heatmap_path}`);
  assert.equal(heatmap.status,200);
  assert.equal(Buffer.from(await heatmap.arrayBuffer()).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
}
console.log(JSON.stringify({model:health.model_version,policy:health.policy_version,rule:health.decision_rule,minimum_class_score:health.minimum_class_score,
  authentic_score:data.authentic_score,ai_generated_score:data.ai_generated_score,verdict:data.verdict,gradcam:data.gradcam.status,contract:'passed'},null,2));
