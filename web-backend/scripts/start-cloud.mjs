import {spawn} from 'node:child_process';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {requireCloudEnvironment,CLOUD_PROJECT_ID} from '../cloud-config.mjs';

try{
  const env={...process.env,AUTHENTISCAN_DATA_MODE:'cloud-hybrid'};
  requireCloudEnvironment(env);
  env.GCLOUD_PROJECT=CLOUD_PROJECT_ID;env.GOOGLE_CLOUD_PROJECT=CLOUD_PROJECT_ID;
  for(const port of [5002,5174])await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(new Error(`Port ${port} is in use. Stop the previous AuthentiScan session first.`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
  const p=spawn(process.execPath,['scripts/serve-cloud.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env,stdio:'inherit',windowsHide:true});
  p.on('exit',code=>{process.exitCode=code??1;});
  process.on('SIGINT',()=>console.log('Waiting for cloud-mode backend to stop…'));
}catch(e){console.error(e.message);process.exitCode=1;}
