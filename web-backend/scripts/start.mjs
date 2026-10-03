import {environment,checkPorts,child,firebaseCLI} from './runtime.mjs';
import {latestSnapshot} from './snapshots.mjs';
try {
  const env=environment();
  await checkPorts();
  const data=latestSnapshot();
  const args=['emulators:exec','--project','demo-authentiscan-local','--only','auth,firestore,storage','--ui'];
  if(data)args.push('--import='+data);
  args.push('node scripts/serve.mjs');
  const emulators=child(firebaseCLI,args,env);
  emulators.on('exit',code=>{process.exitCode=code??1;});
  // Windows console Ctrl+C is delivered to the process group. Do not use
  // child.kill(SIGINT), which terminates children before they can export data.
  process.on('SIGINT',()=>console.log('Waiting for Firebase to finish shutting down…'));
}catch(e){console.error(e.message);process.exitCode=1;}
