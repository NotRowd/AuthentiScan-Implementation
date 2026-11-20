import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {objectReadiness} from '../server/object-detection.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
export const detectorPython=fileURLToPath(new URL(process.platform==='win32'?'../.detector-venv/Scripts/python.exe':'../.detector-venv/bin/python',import.meta.url));
export async function startObjectDetector(){
  if(await objectReadiness()==='ready'){console.log('Using the existing local object detector.');return ()=>{};}
  if(process.env.OBJECT_DETECTOR_URL||!existsSync(detectorPython)){console.log('Object detector unavailable. Classification still works; see detector/README.md for setup.');return ()=>{};}
  const child=spawn(detectorPython,['-u','detector/service.py'],{cwd:root,stdio:['ignore','inherit','inherit'],windowsHide:true});
  let failed=false;child.on('error',()=>{failed=true;});child.on('exit',()=>{failed=true;});
  const stop=()=>{if(!failed)child.kill();};
  const onExit=()=>stop();process.once('exit',onExit);
  for(let attempt=0;attempt<180&&!failed;attempt++){
    if(await objectReadiness()==='ready'){console.log('Object context enabled; no paid service used.');return ()=>{process.removeListener('exit',onExit);stop();};}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  stop();process.removeListener('exit',onExit);
  console.log('Object detector did not start. Classification remains available; check detector setup.');
  return ()=>{};
}
