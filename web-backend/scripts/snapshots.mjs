import {existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync,cpSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root} from './runtime.mjs';

const directory=path.join(root,'.emulator-snapshots');
export function completeSnapshot(folder){
  try{
    const metadata=JSON.parse(readFileSync(path.join(folder,'firebase-export-metadata.json'),'utf8'));
    return metadata.auth?.path==='auth_export'&&metadata.storage?.path==='storage_export'&&
      metadata.firestore?.metadata_file==='firestore_export/firestore_export.overall_export_metadata'&&
      ['auth_export/accounts.json','auth_export/config.json','storage_export/buckets.json',metadata.firestore.metadata_file].every(file=>existsSync(path.join(folder,file)));
  }catch{return false;}
}
export function latestSnapshot(){
  if(existsSync(directory)){
    const names=readdirSync(directory).filter(name=>/^run-\d{13}-[a-f0-9-]+$/.test(name)).sort().reverse();
    for(const name of names){const folder=path.join(directory,name);if(existsSync(path.join(folder,'snapshot-complete.json'))&&completeSnapshot(folder))return folder;}
  }
  const legacy=path.join(root,'.emulator-data');
  if(completeSnapshot(legacy))return legacy;
  if(existsSync(legacy)||(existsSync(directory)&&readdirSync(directory).length))throw new Error('Local snapshots exist but none passed validation. Preserve them and recover the export before starting.');
  return null;
}
export async function saveSnapshot(){
  mkdirSync(directory,{recursive:true});
  const started=Date.now(),target=path.join(directory,`run-${started}-${randomUUID()}`);
  const response=await fetch('http://127.0.0.1:4400/_admin/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:target,initiatedBy:'authentiscan-local-stop',targets:['auth','firestore','storage']}),signal:AbortSignal.timeout(120000)});
  const result=await response.json();
  if(!response.ok){
    // Firebase CLI on Windows can fail only at its final directory rename.
    // Recover the already-completed export by COPY, without deleting any snapshot.
    const match=/rename '([^']+)' -> '([^']+)'/.exec(result.message||'');
    if(!match||path.resolve(match[2])!==target)throw new Error('Firebase snapshot export failed; services remain running.');
    const source=path.resolve(root,match[1]),name=path.basename(source),stamp=Number(/^firebase-export-(\d{13})/.exec(name)?.[1]);
    if(path.dirname(source)!==path.resolve(root)||!/^firebase-export-\d{13}[A-Za-z0-9]+$/.test(name)||stamp<started||!completeSnapshot(source)||existsSync(target))throw new Error('Incomplete export; no previous snapshot was changed.');
    cpSync(source,target,{recursive:true,errorOnExist:true,force:false});
  }
  if(!completeSnapshot(target))throw new Error('Export verification failed; services remain running.');
  writeFileSync(path.join(target,'snapshot-complete.json'),JSON.stringify({completed_at:new Date().toISOString()}));
  return target;
}
