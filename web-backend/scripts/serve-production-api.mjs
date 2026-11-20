// Cloud Run entry point for the authenticated Node API only. It does not start
// Vite, emulators, or local AI worker processes.
if(process.env.NODE_ENV!=='production')throw new Error('Set NODE_ENV=production for the production API entry point.');
if(process.env.AUTHENTISCAN_DATA_MODE!=='cloud-hybrid')throw new Error('Set AUTHENTISCAN_DATA_MODE=cloud-hybrid for Firebase-backed production data.');
if(!process.env.K_SERVICE)process.env.AUTHENTISCAN_USE_ADC??='1';
const port=Number(process.env.PORT||8080);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be a valid TCP port.');
const {createApp}=await import('../server/app.mjs');
const {db}=await import('../server/firebase.mjs');
const {checkCloud}=await import('../server/cloud-check.mjs');
const {readiness}=await import('../server/ai.mjs');
console.log('Checking production Firebase rules, Authentication, Firestore, media credentials and analysis provider.');
await checkCloud();
const deadline=Date.now()+180000;
while(await readiness()!=='ready'){
  if(Date.now()>=deadline)throw new Error('Analysis provider did not become ready within 180 seconds.');
  await new Promise(resolve=>setTimeout(resolve,3000));
}
const server=createApp().listen(port,'0.0.0.0',()=>console.log(`AuthentiScan production API listening on ${port}.`));
let closing=false;
async function stop(){
  if(closing)return;
  closing=true;
  server.close(async()=>{await db.terminate().catch(()=>{});process.exit(0);});
  setTimeout(()=>process.exit(1),10000).unref();
}
process.once('SIGTERM',stop);
process.once('SIGINT',stop);
