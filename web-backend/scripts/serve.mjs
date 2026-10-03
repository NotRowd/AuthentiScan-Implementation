import {createInterface} from 'node:readline';
import {createServer} from 'vite';
import {createApp} from '../server/app.mjs';
import {requireLocalEnvironment} from '../local-config.mjs';
import {db} from '../server/firebase.mjs';
import {saveSnapshot} from './snapshots.mjs';

requireLocalEnvironment(process.env);
const web=await createServer();
const api=createApp().listen(5002,'127.0.0.1');
await new Promise((resolve,reject)=>{api.once('listening',resolve);api.once('error',reject);});
await web.listen();
console.log('\nOpen http://127.0.0.1:5174 — LOCAL TEST ONLY.\nEmulator console: http://127.0.0.1:4000\nPress Enter in this terminal to save local test data and stop cleanly.\n');
const input=createInterface({input:process.stdin,output:process.stdout});
let stopping=false,drained=false;
async function stop() {
  if(stopping)return;stopping=true;
  try{
    if(!drained){await web.close();await new Promise(r=>api.close(r));await db.terminate();drained=true;}
    console.log('Saving local Firebase data…');console.log('Verified snapshot: '+await saveSnapshot());
  }
  catch(error){stopping=false;console.error(error.message+' Press Enter to retry.');return;}
  input.close();
  console.log('Web/API stopped. Local data is saved; Firebase is shutting down…');
  process.exit(0);
}
input.on('line',stop);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
