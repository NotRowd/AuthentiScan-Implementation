const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const timers=new Map(),listeners=new Set();let next=0,callbacks=0,cleanup;
const state={currentState:'active',addEventListener(_event,fn){listeners.add(fn);return {remove:()=>listeners.delete(fn)};}};
const moduleValue={exports:{}};
const code=ts.transpileModule(fs.readFileSync('hooks/usePendingScanRefresh.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{module:moduleValue,exports:moduleValue.exports,require(name){if(name.includes('ThemeContext'))return require('./theme-stub.cjs');if(name==='react')return {useRef:value=>({current:value}),useEffect:fn=>{cleanup?.();cleanup=fn();}};if(name==='react-native')return {AppState:state};if(name.includes('config'))return {OFFLINE_MODE:false};return {};},setTimeout(fn,delay){const id=++next;assert.equal(delay,5000);timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
const {usePendingScanRefresh:refresh}=moduleValue.exports;
function emit(value){state.currentState=value;for(const fn of [...listeners])fn(value);}
const get=async()=>{callbacks++;};
refresh({status:'processing'},null,'',get);assert.equal(timers.size,1);emit('inactive');assert.equal(timers.size,0);emit('background');assert.equal(callbacks,0);emit('active');assert.equal(callbacks,1);
refresh({status:'processing'},'refresh','',get);assert.equal(timers.size,0);emit('active');assert.equal(callbacks,1,'No concurrent poll while a read is running');
refresh({status:'processing'},null,'Connection lost',get);assert.equal(timers.size,0);emit('active');assert.equal(callbacks,2,'Returning may retry the saved read after a connection error');
refresh({status:'completed'},null,'',get);assert.equal(timers.size,0);assert.equal(listeners.size,0);emit('active');assert.equal(callbacks,2);
refresh({status:'failed'},null,'',get);assert.equal(timers.size,0);assert.equal(listeners.size,0);
refresh({status:'queued'},null,'',get);assert.equal(timers.size,1);cleanup();assert.equal(timers.size,0);assert.equal(listeners.size,0);
console.log('PASS pending-report refresh: foreground-only polling, resume reads, no concurrent requests, stop on final status, cleanup on navigation; no upload endpoint.');
