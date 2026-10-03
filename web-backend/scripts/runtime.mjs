import {existsSync, mkdirSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {localEnvironment} from '../local-config.mjs';

export const root = fileURLToPath(new URL('..', import.meta.url));
export function environment() {
  const env=localEnvironment();
  const runtime=path.join(root,'.runtime/java21');
  if (existsSync(runtime)) {
    const folder=readdirSync(runtime).find(n=>existsSync(path.join(runtime,n,'bin/java.exe')));
    if(folder) {env.JAVA_HOME=path.join(runtime,folder);env.Path=path.join(env.JAVA_HOME,'bin')+path.delimiter+(env.Path||env.PATH||'');delete env.PATH;}
  }
  env.FIREBASE_EMULATORS_PATH=path.join(root,'.cache/emulators');
  env.XDG_CONFIG_HOME=path.join(root,'.cache/config');
  env.NO_UPDATE_NOTIFIER='1';
  env.METADATA_SERVER_DETECTION='none';
  env.FIREBASE_CLI_DISABLE_TELEMETRY='1';
  env.CI='true';
  mkdirSync(env.FIREBASE_EMULATORS_PATH,{recursive:true});
  return env;
}
export async function checkPorts({includeApp=true}={}) {
  for(const port of [4000,4400,4500,...(includeApp?[5002,5174]:[]),8085,9099,9199,9150]) {
    await new Promise((resolve,reject)=>{
      const probe=net.createServer();
      probe.once('error',()=>reject(new Error(`Port ${port} is already in use. Stop the existing LOCAL test session; do not stop your MySQL app.`)));
      probe.listen(port,'127.0.0.1',()=>probe.close(resolve));
    });
  }
}
export function child(file,args,env) {
  return spawn(process.execPath,[path.join(root,file),...args],{cwd:root,env,stdio:'inherit',windowsHide:true});
}
export const firebaseCLI='node_modules/firebase-tools/lib/bin/firebase.js';
export async function waitForEmulators(childProcess,timeout=180000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline) {
    if(childProcess.exitCode!==null)throw new Error('Emulator startup failed; see the terminal output.');
    try {
      const response=await fetch('http://127.0.0.1:4400/emulators',{signal:AbortSignal.timeout(1000)});
      const running=await response.json();
      if(running.auth&&running.firestore&&running.storage)return;
    }catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error('Emulators did not become ready within three minutes.');
}
