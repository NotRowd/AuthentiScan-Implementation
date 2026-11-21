const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const transpile=filename=>ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function harness(relative,mocks={}){
 let slots=[],cursor=0,effects=[],tree,render;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++;if(!same(slots[i],deps)){slots[i]=deps;effects.push(()=>{slots[i+'cleanup']?.();slots[i+'cleanup']=fn();});}},useCallback(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;}};
 const jsx=(type,props)=>({type,props:props||{}}),module={exports:{}};
 const filename=path.join(__dirname,'..',relative);
 vm.runInNewContext(transpile(filename),{module,exports:module.exports,require(name){if(name.includes('useMobileTabSpacing'))return {useMobileTabSpacing:()=>({height:118,paddingBottom:42,contentBottom:138})};if(name.includes('useExpoControlClearance'))return {useExpoControlClearance:()=>0};if(name.includes('ThemeContext'))return require('./theme-stub.cjs');
  if(name==='react')return {...react,default:react};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
  if(name==='react-native')return {...mocks.native,View:'View',Pressable:'Pressable',ScrollView:'ScrollView',TextInput:'TextInput',AppState:mocks.native?.AppState||{addEventListener:()=>({remove(){}})},Linking:{openURL:async url=>{mocks.links?.push(url);}},StyleSheet:{create:x=>x}};
  if(name==='expo-router')return {router:mocks.router||{replace(){},push(){},back(){}},useFocusEffect(fn){react.useEffect(fn,[fn]);}};
  if(name==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView'};
  if((name.includes('useAuth')||name.includes('AuthContext')))return {useAuth:()=>mocks.auth,useAuthContext:()=>mocks.auth};
  if(name.includes('api/client'))return {apiRequest:mocks.api};if(name.includes('confirmCheckout'))return {confirmCheckout:async()=>false};
  if(name.includes('api/config'))return {OFFLINE_MODE:false};if(name.includes('passwordResetService'))return {passwordResetService:{requestReset:mocks.reset}};
  if(name==='expo-image-picker')return {launchImageLibraryAsync:async()=>({canceled:false,assets:[mocks.image]})};
  if(name.includes('useAllowance'))return {useAllowance:()=>mocks.allowance};
  if(name.includes('scanService'))return {checkScanReadiness:async()=>{},realScanService:{analyzeImage:mocks.upload},pendingScanId:()=>mocks.pending?'22222222-2222-4222-8222-222222222222':null,recoverSubmittedScan:mocks.recover};
  if(name.includes('scanSession'))return {setLatestScanResult:value=>{mocks.saved=value;}};
  if(name.includes('api/contracts'))return {validateUpload:()=>null};
  if(name.includes('createStyles'))return {createStyles:x=>x};if(name.includes('Colors'))return {default:{bgPrimary:'#F6FAFD'}};
  if(name.includes('AccountLayout'))return {default:'AccountLayout',AccountField:'AccountField',AccountError:'AccountError'};
  return {default:path.basename(name)};
 },setTimeout,clearTimeout,console,Date,Intl,AbortController,URL,Error},{filename});
 render=()=>{cursor=0;tree=module.exports.default();return tree;};
 const walk=(node,fn)=>{if(Array.isArray(node))return node.forEach(n=>walk(n,fn));if(!node||typeof node!=='object')return;fn(node);walk(node.props?.children,fn);walk(node.props?.footer,fn);};
 return {render,find(test){let found;walk(tree,n=>{if(test(n)&&!found)found=n;});assert.ok(found,'Missing UI node');return found;},field(label){return this.find(n=>n.type==='AccountField'&&n.props.label===label);},button(label){return this.find(n=>n.props?.label===label);},async flush(){while(effects.length){const batch=effects;effects=[];for(const fn of batch)fn();await new Promise(r=>setImmediate(r));render();}}};
}

const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const listeners=new Set(),routes=[];
 class Value{setValue(){}stopAnimation(){}interpolate(){return 0;}}
 const animation=()=>({start(){},stop(){}});
 const appState={currentState:'active',addEventListener(_event,fn){listeners.add(fn);return {remove:()=>listeners.delete(fn)};}};
 const mocks={image:{uri:'file:///fixture.png',fileName:'fixture.png',mimeType:'image/png',width:360,height:360},allowance:{label:'Free',refresh:async()=>{}},pending:false,
  native:{AppState:appState,useWindowDimensions:()=>({height:844,width:390}),Animated:{Value,timing:animation,loop:animation,View:'AnimatedView'}},
  router:{push:route=>routes.push(route)},emit(state){appState.currentState=state;for(const fn of [...listeners])fn(state);},routes};
 return mocks;
}
async function selected(mocks){const ui=harness('app/(tabs)/scan.tsx',mocks);ui.render();await ui.flush();await ui.button('Select from library').props.onPress();ui.render();await ui.flush();return ui;}
async function main(){
 let mocks=setup(),finish,uploadSignal,posts=0,gets=0;
 mocks.upload=async(_image,_scenario,signal)=>{posts++;uploadSignal=signal;mocks.pending=true;return new Promise(resolve=>finish=resolve);};
 mocks.recover=async()=>{gets++;return {id:'saved',status:'processing',hasAnalysis:false};};
 let ui=await selected(mocks),original=ui.button('Analyze image').props.onPress();await tick();ui.render();await ui.flush();
 mocks.emit('inactive');mocks.emit('background');assert.equal(gets,0,'Do not contact network from background');mocks.emit('active');await tick();ui.render();await ui.flush();
 assert.equal(posts,1);assert.equal(gets,1);assert.deepEqual(mocks.routes,['/result']);assert.ok(uploadSignal.aborted);assert.equal(mocks.saved.status,'processing');
 finish({id:'saved',status:'completed',hasAnalysis:true});await original;assert.deepEqual(mocks.routes,['/result'],'Late original response must not navigate twice');
 console.log('PASS app-switcher recovery opens the saved scan, releases the old socket, and ignores its late response without another upload');
 mocks=setup();posts=0;gets=0;mocks.upload=async()=>{posts++;mocks.pending=true;throw new Error('Connection interrupted.');};mocks.recover=async()=>{gets++;return {id:'saved',status:'completed',hasAnalysis:true};};
 ui=await selected(mocks);await ui.button('Analyze image').props.onPress();assert.equal(posts,1);assert.equal(gets,1);assert.deepEqual(mocks.routes,['/result']);
 console.log('PASS foreground socket failure checks the saved operation before showing an upload error');
 mocks=setup();gets=0;mocks.upload=async()=>{mocks.pending=true;return new Promise(resolve=>finish=resolve);};mocks.recover=async()=>{gets++;return {id:'saved',status:'completed',hasAnalysis:true};};
 ui=await selected(mocks);original=ui.button('Analyze image').props.onPress();await tick();ui.render();ui.button('Cancel scan').props.onPress();mocks.emit('background');mocks.emit('active');await tick();assert.equal(gets,0);finish({id:'saved',status:'completed',hasAnalysis:true});await original;assert.deepEqual(mocks.routes,[]);
 console.log('PASS explicit cancellation suppresses foreground recovery and ignores any late upload response');
 mocks=setup();gets=0;let recoverFinish;mocks.upload=async()=>{mocks.pending=true;return new Promise(resolve=>finish=resolve);};mocks.recover=async()=>{gets++;return new Promise(resolve=>recoverFinish=resolve);};
 ui=await selected(mocks);original=ui.button('Analyze image').props.onPress();await tick();ui.render();mocks.emit('background');mocks.emit('active');await tick();ui.render();ui.button('Cancel scan').props.onPress();recoverFinish({id:'saved',status:'completed',hasAnalysis:true});await tick();finish({id:'saved',status:'completed',hasAnalysis:true});await original;assert.deepEqual(mocks.routes,[]);
 console.log('PASS cancelling an in-flight foreground recovery cannot reopen a report');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

