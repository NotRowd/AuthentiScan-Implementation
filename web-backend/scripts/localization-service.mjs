import {spawn} from 'node:child_process';
import {existsSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {localizationBase} from '../server/localization.mjs';
import {EXPERIMENTAL_LOCALIZER_MODEL,MESORCH_LOCALIZER_MODEL,MESORCH_CHECKPOINT_SHA} from '../shared/localization-contract.mjs';

const packageRoot=fileURLToPath(new URL('../../ai-localization/',import.meta.url));
const oldPython=fileURLToPath(new URL(process.platform==='win32'?'../../ai-localization/.venv/Scripts/python.exe':'../../ai-localization/.venv/bin/python',import.meta.url));
const mesorchRoot=path.join(packageRoot,'mesorch-p');
const mesorchService=path.join(mesorchRoot,'service.py');
const defaultMesorchPython=path.join(mesorchRoot,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const mesorchHealthUrl=process.env.MESORCH_LOCALIZATION_SERVICE_URL||'http://127.0.0.1:5014';
async function health(url){
  try{return await (await fetch(new URL('/health',url),{signal:AbortSignal.timeout(1500),redirect:'error'})).json();}catch{return null;}
}
const matchesLegacy=value=>value?.service==='authentiscan-localizer'&&value.model_loaded===true&&value.model_version===EXPERIMENTAL_LOCALIZER_MODEL&&value.usage_mode==='experimental'&&value.validation_status==='failed'&&value.score_preview_version===1;
const matchesMesorch=value=>value?.service==='authentiscan-localizer'&&value.model_loaded===true&&value.model_version===MESORCH_LOCALIZER_MODEL&&value.checkpoint_sha256===MESORCH_CHECKPOINT_SHA&&value.validation_status==='development_gates_failed';
async function matchesCpuHandoff(value,checkpoint){
  if(value?.service!=='authentiscan-localizer'||value.model_loaded!==true||value.device!=='cpu'||value.model_version!==MESORCH_LOCALIZER_MODEL||value.validation_status!=='development_gates_failed')return false;
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(checkpoint))hash.update(chunk);
  return hash.digest('hex')===MESORCH_CHECKPOINT_SHA;
}

function stopChild(child){
  let exited=false;
  child.once('error',()=>{exited=true;});child.once('exit',()=>{exited=true;});
  const stop=()=>{process.removeListener('exit',stop);if(!exited)child.kill();};
  process.once('exit',stop);
  return stop;
}

async function startMesorch(){
  if(process.env.AUTHENTISCAN_LOCALIZATION_ENABLED!=='1'){
    console.log('Pixel localization is disabled. Set AUTHENTISCAN_LOCALIZATION_ENABLED=1 and AUTHENTISCAN_LOCALIZATION_MODE=mesorch-p to opt in.');
    return ()=>{};
  }
  const checkpoint=process.env.MESORCH_LOCALIZATION_WEIGHTS?path.resolve(process.env.MESORCH_LOCALIZATION_WEIGHTS):'';
  const python=process.env.MESORCH_LOCALIZATION_PYTHON||defaultMesorchPython;
  const service=process.env.MESORCH_LOCALIZATION_SERVICE_PATH||mesorchService;
  if(!checkpoint||!existsSync(checkpoint)||!existsSync(python)||!existsSync(service)){
    console.log('Pixel localization is unavailable: configure its verified checkpoint and CUDA Python environment. Classification will continue.');
    return ()=>{};
  }
  let origin;
  try{
    const url=new URL(mesorchHealthUrl);if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error();origin=url.origin;
  }catch{console.warn('Pixel localization is disabled: its service URL must be loopback. Classification will continue.');return ()=>{};}
  if(origin!=='http://127.0.0.1:5014'&&origin!=='http://localhost:5014'){
    console.warn('Pixel localization is disabled: this worker is configured for port 5014. Classification will continue.');return ()=>{};
  }
  const existing=await health(mesorchHealthUrl);
  if(matchesMesorch(existing)||await matchesCpuHandoff(existing,checkpoint)){console.log('Using the existing compatible pixel-localization service. Development validation gates have not passed.');return ()=>{};}
  if(existing){console.warn('Pixel localization is disabled: port 5014 is occupied by an unrecognized service. Classification will continue.');return ()=>{};}
  const child=spawn(python,['-u',service,'--weights',checkpoint,'--port','5014'],{cwd:path.dirname(service),stdio:['ignore','inherit','inherit'],windowsHide:true});
  const stop=stopChild(child);
  let ready=false;
  const poll=async()=>{
    for(let attempt=0;attempt<240;attempt++){
      const value=await health(mesorchHealthUrl);
      if(matchesMesorch(value)||await matchesCpuHandoff(value,checkpoint)){ready=true;console.log('Pixel-localization service is ready. Its development validation gates failed; highlights are suggestions only.');return;}
      if(child.exitCode!==null||child.signalCode!==null)return;
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(!ready)console.warn('Pixel localization did not become ready in time; classification remains available.');
  };
  void poll();
  return stop;
}

export async function startLocalization(){
  const mode=process.env.AUTHENTISCAN_LOCALIZATION_MODE;
  if(mode==='mesorch-p')return startMesorch();
  if(mode!=='experimental')return ()=>{};
  const existing=await health(localizationBase());
  if(matchesLegacy(existing)){console.log('Using existing experimental localizer. WARNING: validation failed.');return ()=>{};}
  if(existing||process.env.LOCALIZATION_SERVICE_URL||!existsSync(oldPython))throw new Error('Localizer unavailable, outdated, or port occupied. Stop the old localization/web terminal normally, then restart for score-preview support. See ai-localization/EXPERIMENTAL-IMPLEMENTATION.md.');
  const child=spawn(oldPython,['-u','experimental_service.py','--experimental'],{cwd:packageRoot,stdio:['ignore','inherit','inherit'],windowsHide:true});
  const stop=stopChild(child);
  for(let attempt=0;attempt<120;attempt++){
    if(matchesLegacy(await health(localizationBase()))){console.log('Experimental localization enabled. Model failed validation; no reliability claim.');return stop;}
    if(child.exitCode!==null||child.signalCode!==null)break;
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  stop();throw new Error('Experimental localizer could not start; classification files are unchanged.');
}
