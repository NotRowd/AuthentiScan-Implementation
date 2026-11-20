import {setTimeout as sleep} from 'node:timers/promises';

// Supervises only the exact child handles it creates. Never kills by port or name.
export async function superviseScene({launch,ready,log=console.log,startupMs=180000,pollMs=500,
  monitorMs=3000,restartMs=2000,shutdownMs=15000,maxRestarts=2}){
  const abort=new AbortController();let current,stopping=false,stopPromise;
  const pause=ms=>sleep(ms,undefined,{signal:abort.signal}).catch(()=>{});
  async function waitForExit(record,ms){
    const timeout=new AbortController();
    try{await Promise.race([record.done,sleep(ms,undefined,{signal:timeout.signal}).catch(()=>{})]);}
    finally{timeout.abort();}
  }
  async function drain(record){
    if(!record||record.exited)return;
    record.child.stdin.end();
    await waitForExit(record,shutdownMs);
    if(!record.exited){
      log('Scene shutdown exceeded its grace period; stopping only the owned adapter.');
      record.child.kill(); // Windows job ownership also closes its model child.
      await waitForExit(record,5000);
      if(!record.exited)throw new Error('Scene process has not stopped; do not start another session yet.');
    }
  }
  async function boot(){
    if(stopping)return false;
    const child=launch(),record={child,exited:false};current=record;
    record.done=new Promise(resolve=>{
      const ended=()=>{record.exited=true;resolve();};
      child.once('error',ended);child.once('exit',ended);
    });
    child.stdin.on('error',()=>{});
    const deadline=Date.now()+startupMs;
    while(!stopping&&!record.exited&&Date.now()<deadline){
      if(await ready(child.pid)){if(!stopping&&!record.exited)return true;break;}
      await pause(pollMs);
    }
    await drain(record);return false;
  }
  const onExit=()=>{if(current&&!current.exited)current.child.stdin.end();};
  process.once('exit',onExit);
  async function stop(){
    if(stopPromise)return stopPromise;
    stopping=true;abort.abort();process.removeListener('exit',onExit);
    stopPromise=drain(current);return stopPromise;
  }
  try{
    if(!await boot()){
      await stop();log('Image descriptions and visual review are unavailable. Check the scene startup message above; classification can still run.');return stop;
    }
  }catch(error){await stop();throw error;}
  log('Qwen local descriptions and visual review ready; accuracy not validated. Classifier unchanged.');
  // The Python adapter exits if its model dies. Limit restarts per backend session.
  void (async()=>{
    let restarts=0;
    while(!stopping){
      await pause(monitorMs);if(stopping)break;
      if(!current.exited)continue;
      if(restarts>=maxRestarts){log('Scene recovery limit reached. Descriptions are unavailable; restart the backend after checking the cause.');await stop();break;}
      restarts++;log(`Scene service stopped unexpectedly. Recovering (${restarts}/${maxRestarts})…`);
      await pause(restartMs);if(stopping)break;
      if(await boot())log('Scene service recovered. Retry missing observations on the saved report; no new upload is needed.');
    }
  })().catch(async()=>{log('Scene recovery failed. Classification is unchanged. Restart the backend after checking the scene service.');await stop().catch(()=>{});});
  return stop;
}
