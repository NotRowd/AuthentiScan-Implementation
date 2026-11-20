import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CURRENT_AI_RELEASE,matchesCurrentAi} from '../server/current-ai-release.mjs';
import {readiness} from '../server/ai.mjs';
test('locked classifier identity requires every model and policy field',()=>{
  assert.equal(matchesCurrentAi({...CURRENT_AI_RELEASE}),true);
  for(const key of Object.keys(CURRENT_AI_RELEASE).filter(key=>key!=='id')){
    const changed={...CURRENT_AI_RELEASE};delete changed[key];assert.equal(matchesCurrentAi(changed),false,key);
  }
  assert.equal(matchesCurrentAi({...CURRENT_AI_RELEASE,minimum_class_score:.5}),false);
  assert.equal(matchesCurrentAi({...CURRENT_AI_RELEASE,policy_version:'old-policy'}),false);
});
test('readiness rejects a loaded old model and permits the locked baseline',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>({ok:true,json:async()=>({success:true,model_loaded:true,model_version:CURRENT_AI_RELEASE.model_version})});
    assert.equal(await readiness(),'not_ready');
    globalThis.fetch=async()=>({ok:true,json:async()=>({success:true,model_loaded:true,...CURRENT_AI_RELEASE})});
    assert.equal(await readiness(),'ready');
  }finally{globalThis.fetch=original;}
});
