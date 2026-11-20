import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {SCENE_MODEL,SCENE_EXPLANATION_VERSION} from '../shared/scene-provider-contract.mjs';
import {FEATURE_REVIEW_VERSION} from '../shared/feature-review-contract.mjs';
import {superviseScene} from './scene-supervisor.mjs';
const root=fileURLToPath(new URL('../../ai-scene/',import.meta.url));
const python=fileURLToPath(new URL('../../ai-localization/.venv-vaas/Scripts/python.exe',import.meta.url));
async function health(){try{return await (await fetch('http://127.0.0.1:5005/health',{signal:AbortSignal.timeout(1000)})).json();}catch{return null;}}
const matches=data=>data?.service==='authentiscan-scene'&&data.model_loaded===true&&data.model_version===SCENE_MODEL&&data.explanation_version===SCENE_EXPLANATION_VERSION&&data.feature_review_version===FEATURE_REVIEW_VERSION;
export async function startScene({env=process.env,probe=health,fileExists=existsSync,supervise=superviseScene,log=console.log}={}){
  // Visual observations are independent of the experimental edited-area detector.
  if(env.AUTHENTISCAN_SCENE_MODE==='off'){log('Local visual review explicitly disabled (AUTHENTISCAN_SCENE_MODE=off).');return ()=>{};}
  const existing=await probe();
  if(matches(existing)&&existing.lifecycle_version===1){log('Using existing local scene service (managed by its original launcher).');return ()=>{};}
  if(existing){
    log('Scene explanation needs an update: stop the older web/backend or scene-service terminal, then restart this command. Port 5005 is occupied; no existing process was stopped. Main scans can still run.');return ()=>{};
  }
  if(!fileExists(python)||!fileExists(root+'weights/qwen3-vl-2b-q4km-f16-review-v1/prepared.json')){
    log('Scene explanation unavailable: finish ai-scene setup or check port 5005. Main scans can still run.');return ()=>{};
  }
  return supervise({log,
    launch:()=>spawn(python,['-u','qwen_service.py','--parent-pipe'],{cwd:root,stdio:['pipe','inherit','inherit'],windowsHide:true}),
    // Windows virtualenv python.exe may be a redirector that owns the interpreter.
    ready:async pid=>{const data=await probe();return matches(data)&&(data.process_id===pid||data.launcher_process_id===pid)&&data.lifecycle_version===1;},
  });
}
