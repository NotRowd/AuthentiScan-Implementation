import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {setTimeout as sleep} from 'node:timers/promises';
import {superviseScene} from '../scripts/scene-supervisor.mjs';

function fixture(overrides={}){
  const children=[],logs=[];
  const options={startupMs:30,pollMs:1,monitorMs:2,restartMs:2,shutdownMs:20,maxRestarts:2,
    log:message=>logs.push(message),ready:async()=>true,
    launch(){const child=new EventEmitter();child.pid=children.length+1;child.ends=0;child.kills=0;
      child.stdin=new EventEmitter();child.stdin.end=()=>{child.ends++;setTimeout(()=>child.emit('exit',0),5);};
      child.kill=()=>{child.kills++;child.emit('exit',1);};children.push(child);return child;},...overrides};
  return {children,logs,options};
}
async function until(check){for(let i=0;i<150;i++){if(check())return;await sleep(5);}assert.fail('Expected supervisor state');}
test('stop waits for owned adapter exit and never restarts after intentional shutdown',async()=>{
  const f=fixture(),stop=await superviseScene(f.options);
  await stop();await sleep(15);
  assert.equal(f.children.length,1);assert.equal(f.children[0].ends,1);assert.equal(f.children[0].kills,0);
  await stop();assert.equal(f.children[0].ends,1);
});
test('unexpected adapter exit recovers at most twice',async()=>{
  const f=fixture(),stop=await superviseScene(f.options);
  try{
    f.children[0].emit('exit',1);await until(()=>f.children.length===2);
    f.children[1].emit('exit',1);await until(()=>f.children.length===3);
    f.children[2].emit('exit',1);await until(()=>f.logs.some(message=>message.includes('limit reached')));
    assert.equal(f.children.length,3);
  }finally{await stop();}
});
test('startup not ready shuts down owned child without restart storm',async()=>{
  const f=fixture({ready:async()=>false}),stop=await superviseScene(f.options);
  assert.equal(f.children[0].ends,1);await sleep(20);assert.equal(f.children.length,1);await stop();
});
test('forced fallback targets only the owned child handle',async()=>{
  const f=fixture();const launch=f.options.launch;
  f.options.launch=()=>{const child=launch();child.stdin.end=()=>{child.ends++;};return child;};
  const stop=await superviseScene(f.options);await stop();
  assert.equal(f.children[0].kills,1);
});
test('stopping during recovery delay cancels the pending restart',async()=>{
  const f=fixture({restartMs:50}),stop=await superviseScene(f.options);
  f.children[0].emit('exit',1);await until(()=>f.logs.some(message=>message.includes('Recovering')));
  await stop();await sleep(60);assert.equal(f.children.length,1);
});
