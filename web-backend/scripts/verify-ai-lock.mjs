import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const lock=JSON.parse(await readFile(resolve(root,'ai-runtime/current-ai.lock.json'),'utf8'));
function lockedPath(path){
  const full=resolve(root,path),rel=relative(root,full);
  if(rel.startsWith('..')||isAbsolute(rel))throw new Error('AI lock path is outside the workspace.');
  return full;
}
export async function verifyAiLock(){
  async function check(entry){
    const hash=createHash('sha256');
    try{for await(const chunk of createReadStream(lockedPath(entry.path)))hash.update(chunk);}
    catch{throw new Error('Locked AI file is missing: '+entry.path);}
    if(hash.digest('hex')!==entry.sha256)throw new Error('AI baseline changed: '+entry.path+'. Review the change before updating the lock; do not silently switch models.');
  }
  for(const entry of lock.files)await check(entry);
  const manifest=JSON.parse(await readFile(lockedPath(lock.scene_manifest),'utf8'));
  for(const entry of manifest.files)await check({path:relative(root,resolve(dirname(lockedPath(lock.scene_manifest)),entry.file)),sha256:entry.sha256});
  console.log('AI lock verified: '+lock.release+'. Classification, Grad-CAM, objects, localization and scene files unchanged.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await verifyAiLock();
