const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),transpile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function pure(relative,requireMock=()=>({}),globals={}){const module={exports:{}};vm.runInNewContext(transpile(path.join(root,relative)),{module,exports:module.exports,require:requireMock,console,Map,Set,Number,Math,...globals});return module.exports;}
const colors=pure('constants/Colors.ts'),listeners=new Set();
const cache=pure('services/scan/historyViewState.ts',()=>({onSessionCleared:fn=>{listeners.add(fn);}}));
function harness(relative,mocks={}){
 let slots=[],cursor=0,effects=[],tree,focused=false,focusCallback,focusCleanup;
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useCallback(fn,deps){const i=cursor++;if(!slots[i]||!equal(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;},useEffect(fn,deps){const i=cursor++;if(!equal(slots[i],deps)){slots[i]=deps;effects.push(()=>{slots[i+'cleanup']?.();slots[i+'cleanup']=fn();});}}};
 react.forwardRef=fn=>fn;
 const jsx=(type,props)=>({type,props:props||{}}),palette=()=>mocks.dark?colors.DarkColors:colors.LightColors;
 class Value{constructor(value){this.value=value;}setValue(value){this.value=value;}stopAnimation(){}interpolate(){return 0;}}
 const animation=()=>({start(){},stop(){}}),router=mocks.router||{canGoBack:()=>false,back(){},replace(){},push(){}};
 const flatten=style=>Array.isArray(style)?Object.assign({},...style.map(flatten)):style&&typeof style==='object'?style:{};
 const native={View:'View',Text:'Text',ScrollView:'ScrollView',Pressable:'Pressable',TouchableOpacity:'TouchableOpacity',Image:'Image',TextInput:'TextInput',SafeAreaView:'SafeAreaView',ActivityIndicator:'ActivityIndicator',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:mocks.os||'ios'},Keyboard:{dismiss(){}},useWindowDimensions:()=>({width:mocks.width||390,height:844,fontScale:mocks.fontScale||1}),StyleSheet:{create:x=>x,flatten,absoluteFill:{}},Animated:{Value,View:'AnimatedView',timing:animation,parallel:animation,loop:animation,spring:animation},Alert:{alert:(...args)=>mocks.alerts?.push(args)},ActionSheetIOS:{showActionSheetWithOptions:(options,callback)=>{mocks.sheetCalls=(mocks.sheetCalls||0)+1;mocks.sheet={options,callback};}},BackHandler:{addEventListener:(_name,callback)=>{mocks.hardwareBack=callback;return {remove(){mocks.hardwareBack=null;}};}},AppState:{addEventListener:()=>({remove(){}})},...mocks.native};
 const loadCache={};
 function load(relative){const filename=path.resolve(root,relative);if(loadCache[filename])return loadCache[filename].exports;const module={exports:{}};loadCache[filename]=module;
 vm.runInNewContext(transpile(filename)+(mocks.exposeStyles?'\nmodule.exports.__styles=typeof makeStyles==="function"?makeStyles:null;':''),{module,exports:module.exports,require(name){
  if(name==='react')return {...react,default:react};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
  if(name==='react-native')return native;
  if(name==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:24,bottom:mocks.bottom??34,left:0,right:0})};
  if(name==='expo-router')return {router,useRootNavigationState:()=>mocks.navigationState,useFocusEffect(fn){focusCallback=fn;react.useEffect(()=>{if(focused){focusCleanup?.();focusCleanup=fn();}},[fn]);},Tabs:Object.assign('Tabs',{Screen:'TabScreen'}),Redirect:'Redirect'};
  if(name==='expo-constants')return {__esModule:true,default:{executionEnvironment:mocks.expo===false?'standalone':'storeClient'}};
  if(name.includes('ThemeContext'))return {useTheme:()=>({colors:palette(),isDark:!!mocks.dark,preference:mocks.dark?'dark':'light',setPreference(){},saveError:''}),useThemedStyles:fn=>fn(palette())};
  if(name.includes('useAuth')||name.includes('AuthContext'))return {useAuth:()=>mocks.auth||{user:{id:'owner-a'}},useAuthContext:()=>mocks.auth||{user:{id:'owner-a'}}};
  if(name.includes('historyViewState'))return cache;
  if(name.includes('useMobileTabSpacing'))return load('hooks/useMobileTabSpacing.ts');
  if(name.includes('useExpoControlClearance'))return load('hooks/useExpoControlClearance.ts');
  if(name.includes('useDetailBack'))return load('hooks/useDetailBack.ts');
  if(name.includes('usePendingScanRefresh'))return {usePendingScanRefresh(){}};
  if(name.includes('historyFilters'))return pure('services/scan/historyFilters.ts');
  if(name.includes('scanHistoryService'))return {scanHistoryService:mocks.history};
  if(name.includes('scanSession'))return {getLatestScanResult:()=>mocks.result,setLatestScanResult:result=>{mocks.result=result;}};
  if(name.includes('resultPresentation'))return pure('services/scan/resultPresentation.ts');
  if(name.includes('visualReview'))return {FEATURE_LABELS:{},describeVisualReview:()=>null};
  if(name.includes('api/config'))return {OFFLINE_MODE:!!mocks.offline};
  if(name.includes('api/client'))return {apiRequest:async()=>{throw Error('Unexpected live request');}};
  if(name.includes('createStyles'))return {createStyles:x=>x};
  if(name.includes('Typography'))return pure('constants/Typography.ts');if(name.includes('Spacing'))return pure('constants/Spacing.ts');
  if(name.includes('DetailBack'))return {__esModule:true,default:'DetailBack',BackButton:'BackButton'};
  if(name.includes('StatusChip'))return {VerdictChip:'VerdictChip'};
  if(name.includes('feedbackService'))return {feedbackService:{load:async()=>null}};
  if(name.includes('confirmCheckout'))return {confirmCheckout:async()=>false};
  if(name.includes('ScanActions'))return {__esModule:true,default:'ScanActions'};
  if(name==='@expo/vector-icons')return {Ionicons:'Icon'};
  if(name==='expo-linear-gradient')return {LinearGradient:'LinearGradient'};
  return {__esModule:true,default:path.basename(name)};
 },__DEV__:mocks.dev!==false,console,Date,Intl,Error,AbortController,URL,Map,Set,setTimeout,clearTimeout},{filename});return module.exports;
 }
 const module=load(relative),render=()=>{cursor=0;tree=(mocks.exportName?module[mocks.exportName]:module.default)(mocks.props||{});return tree;};
 function walk(node,fn){if(Array.isArray(node))return node.forEach(x=>walk(x,fn));if(!node||typeof node!=='object')return;fn(node);walk(node.props?.children,fn);}
 const ui={module,render,get tree(){return tree;},all(test){const out=[];walk(tree,x=>{if(test(x))out.push(x);});return out;},find(test){const found=this.all(test)[0];assert.ok(found,'Missing UI node');return found;},button(label){return this.find(x=>x.props.label===label);},async flush(){for(let i=0;i<8;i++){while(effects.length){const batch=effects;effects=[];batch.forEach(fn=>fn());}await new Promise(r=>setImmediate(r));render();if(!effects.length&&i>2)break;}},focus(){focused=true;focusCleanup?.();focusCleanup=focusCallback?.();},blur(){focused=false;focusCleanup?.();focusCleanup=null;},unmount(){this.blur();for(const key of Object.keys(slots).filter(k=>k.endsWith('cleanup')))slots[key]?.();},palette};
 return ui;
}
module.exports={harness,pure,cache,listeners,colors};
