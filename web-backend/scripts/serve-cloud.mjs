import {createInterface} from 'node:readline';
import {createServer} from 'vite';

try{
  const {checkCloud}=await import('../server/cloud-check.mjs');
  console.log('Checking Auth, Firestore security rules, and configured media storage. No Firebase Cloud Storage or billing setup is used.');
  await checkCloud();
  const {createApp}=await import('../server/app.mjs'),{db,mediaProvider}=await import('../server/firebase.mjs');
  const web=await createServer();
  const api=createApp().listen(5002,'127.0.0.1');
  await new Promise((resolve,reject)=>{api.once('listening',resolve);api.once('error',reject);});await web.listen();
  console.log(`\nOpen http://127.0.0.1:5174 — LIVE FIREBASE accounts and records.\nNew scan media: ${mediaProvider}. Older local images stay on this PC. AI uses port 5001.\nPress Enter to stop. Cloud records are saved as you use the app.`);
  const input=createInterface({input:process.stdin,output:process.stdout});let stopping=false;
  async function stop(){if(stopping)return;stopping=true;input.close();await web.close();await new Promise(r=>api.close(r));await db.terminate();process.exit(0);}
  input.on('line',stop);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
}catch(e){
  // Never print credential contents, token responses, or complete SDK error objects.
  const safe=e.message?.startsWith('Save the private')||e.message?.startsWith('Publish firestore.rules')||e.message?.startsWith('Cannot verify Firestore')||e.message?.startsWith('Cloud preflight failed');
  console.error(safe?e.message:'Cloud startup failed. Check the credential project, internet connection, Firebase services and permissions. No billing changes were made.');
  process.exit(1);
}
