import {createInterface} from 'node:readline';
import {createServer} from 'vite';
import {startObjectDetector} from './object-detector.mjs';
import {startLocalization} from './localization-service.mjs';
import {startScene} from './scene-service.mjs';

try{
  const {checkCloud}=await import('../server/cloud-check.mjs');
  console.log('Checking Auth, Firestore security rules, and configured media storage. No Firebase Cloud Storage or billing setup is used.');
  await checkCloud();
  const external=process.env.AUTHENTISCAN_ANALYSIS_PROVIDER==='truthscan';
  const stopObjects=external?()=>{}:await startObjectDetector();
  const stopLocalization=external?()=>{}:await startLocalization();
  const stopScene=external?async()=>{}:await startScene();
  const {createApp}=await import('../server/app.mjs'),{db,mediaProvider}=await import('../server/firebase.mjs');
  const web=await createServer();
  const apiHost=process.env.AUTHENTISCAN_MOBILE_LAN==='1'?'0.0.0.0':'127.0.0.1';
  const api=createApp().listen(5002,apiHost);
  await new Promise((resolve,reject)=>{api.once('listening',resolve);api.once('error',reject);});await web.listen();
  if(apiHost==='0.0.0.0')console.log('Mobile: use http://<this-PC-Wi-Fi-IP>:5002 with the same Firebase account as web. Only use this HTTP development mode on a trusted private LAN.');
  console.log(`\nOpen http://127.0.0.1:5174 — LIVE FIREBASE accounts and records.\nNew scan media: ${mediaProvider}. Older local images stay on this PC. ${external?'Analysis uses TruthScan; local model workers are skipped.':'AI uses port 5001.'}\nPress Enter to stop. Cloud records are saved as you use the app.`);
  const input=createInterface({input:process.stdin,output:process.stdout});let stopping=false;
  async function stop(){if(stopping)return;stopping=true;input.close();await web.close();await new Promise(r=>api.close(r));stopObjects();stopLocalization();await stopScene();await db.terminate();process.exit(0);}
  input.on('line',stop);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
}catch(e){
  // Never print credential contents, token responses, or complete SDK error objects.
  const safe=e.message?.startsWith('Save the private')||e.message?.startsWith('Publish firestore.rules')||e.message?.startsWith('Cannot verify Firestore')||e.message?.startsWith('Cloud preflight failed')||e.message?.startsWith('Experimental localizer')||e.message?.startsWith('Localizer unavailable');
  console.error(safe?e.message:'Cloud startup failed. Check the credential project, internet connection, Firebase services and permissions. No billing changes were made.');
  process.exit(1);
}
