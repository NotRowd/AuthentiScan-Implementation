const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const transpile=filename=>ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
require.extensions['.ts']=(module,filename)=>module._compile(transpile(filename),filename);
const {classificationRows,regionPresentation}=require('../services/scan/resultPresentation.ts');
function result(verdict,label,confidence){return {id:'22222222-2222-4222-8222-222222222222',hasAnalysis:true,verdict,analysisProvider:'truthscan',authenticScore:null,aiGeneratedScore:null,analysis:{provider_label:label,provider_label_confidence:confidence},localization:{status:'available'}};}
for(const [verdict,label] of [['authentic','Real'],['ai_generated','AI Generated'],['ai_generated','AI Edited']]){const r=classificationRows(result(verdict,label,.9725));assert.equal(r.rows.length,1);assert.equal(r.rows[0].percent,97.25);assert.equal(r.rows[0].key,verdict);}
for(const label of ['AI Generated','AI Edited','Real']){const r=classificationRows(result('uncertain',label,.5224));assert.equal(r.rows.length,2);assert.equal(r.rows.reduce((s,v)=>s+v.percent,0),100);assert.equal(r.rows.filter(v=>v.derived).length,1);assert.match(r.explanation,/calculated remainder/);}
for(const label of ['Synthetic','Unknown']){const r=classificationRows(result('uncertain',label,.9725));assert.ok(r.rows.every(v=>v.percent===null));assert.match(r.explanation,/not a pair/);}
const edited=classificationRows(result('authentic','Digitally Edited',.9604));assert.equal(edited.rows[0].percent,96.04);assert.match(edited.rows[0].label,/detecting digital editing/);assert.match(edited.rows[0].note,/not confidence in authenticity/);
assert.ok(classificationRows(result('uncertain','AI Generated',.6)).rows.every(v=>v.percent===null),'No complement at the threshold');
const legacy={...result('uncertain'),analysisProvider:undefined,authenticScore:45.7,aiGeneratedScore:54.3};assert.deepEqual(classificationRows(legacy).rows.map(v=>v.percent),[45.7,54.3]);
assert.ok(regionPresentation(result('authentic')).originalOnly);assert.ok(!regionPresentation(result('ai_generated')).originalOnly);assert.match(regionPresentation(result('ai_generated')).image,/localization-image$/);
console.log('PASS result presentation: selected bars, explicit remainder, high-confidence digital-edit uncertainty, legacy scores, authentic original-only and supplied heatmap route');
function harness(relative,mocks={}){
 let slots=[],cursor=0,effects=[],tree,render;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++;if(!same(slots[i],deps)){slots[i]=deps;effects.push(fn);}},useCallback(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;}};
 const jsx=(type,props)=>({type,props:props||{}}),module={exports:{}};
 const filename=path.join(__dirname,'..',relative);
 vm.runInNewContext(transpile(filename),{module,exports:module.exports,require(name){if(name.includes('ThemeContext'))return require('./theme-stub.cjs');
  if(name==='react')return {...react,default:react};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
  if(name==='react-native')return {View:'View',Pressable:'Pressable',ScrollView:'ScrollView',TextInput:'TextInput',AppState:{addEventListener:()=>({remove(){}})},Linking:{openURL:async url=>{mocks.links?.push(url);}},StyleSheet:{create:x=>x}};
  if(name==='expo-router')return {router:mocks.router||{replace(){},push(){},back(){}},useFocusEffect(fn){react.useEffect(fn,[fn]);}};
  if(name==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView'};
  if((name.includes('useAuth')||name.includes('AuthContext')))return {useAuth:()=>mocks.auth,useAuthContext:()=>mocks.auth};
  if(name.includes('api/firebaseAuth'))return {requestRegistrationCode:async()=>({data:{challenge_id:'22222222-2222-4222-8222-222222222222',resend_after:60}})};
  if(name.includes('api/client'))return {apiRequest:mocks.api};if(name.includes('confirmCheckout'))return {confirmCheckout:async()=>false};
  if(name.includes('api/config'))return {OFFLINE_MODE:false};if(name.includes('passwordResetService'))return {passwordResetService:{requestReset:mocks.reset}};
  if(name.includes('createStyles'))return {createStyles:x=>x};if(name.includes('Colors'))return {default:{bgPrimary:'#F6FAFD'}};
  if(name.includes('AccountLayout'))return {default:'AccountLayout',AccountField:'AccountField',AccountError:'AccountError'};
  return {default:path.basename(name)};
 },setTimeout,clearTimeout,console,Date,Intl,AbortController,URL},{filename});
 render=()=>{cursor=0;tree=module.exports.default();return tree;};
 const walk=(node,fn)=>{if(Array.isArray(node))return node.forEach(n=>walk(n,fn));if(!node||typeof node!=='object')return;fn(node);walk(node.props?.children,fn);walk(node.props?.footer,fn);};
 return {render,find(test){let found;walk(tree,n=>{if(test(n)&&!found)found=n;});assert.ok(found,'Missing UI node');return found;},field(label){return this.find(n=>n.type==='AccountField'&&n.props.label===label);},button(label){return this.find(n=>n.props?.label===label);},async flush(){while(effects.length){const batch=effects;effects=[];for(const fn of batch)fn();await new Promise(r=>setImmediate(r));render();}}};
}
async function main(){
 let calls=0,finish;const auth={login:async()=>{calls++;await new Promise(r=>finish=r);return {};},register:async()=>{calls++;return {};},refreshAccount:async()=>{}};
 const login=harness('app/(auth)/login.tsx',{auth});login.render();login.field('Email address').props.onChangeText('alex@example.test');login.field('Password').props.onChangeText('Synthetic123!');login.render();const submit=login.button('Sign in').props.onPress;const pending=submit();submit();assert.equal(calls,1);finish();await pending;
 calls=0;const register=harness('app/(auth)/register.tsx',{auth});register.render();for(const [label,value] of [['First name','Alex'],['Last name','Rivera'],['Email address','alex@example.test'],['Password','Synthetic123!'],['Confirm password','Synthetic123!']])register.field(label).props.onChangeText(value);register.render();await register.button('Send verification code').props.onPress();assert.equal(calls,0);register.find(n=>n.props.accessibilityRole==='checkbox').props.onPress();register.render();await register.button('Send verification code').props.onPress();assert.equal(calls,0);register.render();register.field('Verification code').props.onChangeText('123456');register.render();await register.button('Verify & create account').props.onPress();assert.equal(calls,1);
 let resetCalls=0;const reset=harness('app/(auth)/forgot-password.tsx',{reset:async()=>{resetCalls++;return {success:true,delivery:'requested'};}});reset.render();reset.field('Email address').props.onChangeText('alex@example.test');reset.render();await reset.button('Send reset link').props.onPress();reset.render();assert.ok(reset.button('Resend available in 60s').props.disabled);reset.button('Resend available in 60s').props.onPress();assert.equal(resetCalls,1);
 console.log('PASS account screens: duplicate sign-in guard, required registration acknowledgement, recovery resend cooldown and existing service routing');
 let billing={enabled:true,plan:{name:'Free',scan_limit:5},offer:{amount:19900,purchase_type:'one_time'},message:'Test mode only.',orders:[]},checkoutCalls=0,settle;
 const checkout=harness('app/checkout.tsx',{auth,api:async(endpoint)=>{if(endpoint.endsWith('/checkout')){checkoutCalls++;await new Promise(r=>settle=r);throw new Error('Test checkout could not be prepared. Retry the same purchase.');}return {data:billing};}});
 checkout.render();await checkout.flush();assert.ok(checkout.button('Continue to checkout').props.disabled);await checkout.button('Continue to checkout').props.onPress();assert.equal(checkoutCalls,0,'Handler must enforce acknowledgement too');checkout.render();checkout.find(n=>n.props.accessibilityRole==='checkbox').props.onPress();checkout.render();assert.equal(checkout.button('Continue to checkout').props.disabled,false);const action=checkout.button('Continue to checkout').props.onPress();checkout.render();assert.ok(checkout.button('Please wait…').props.disabled);assert.ok(checkout.find(n=>n.props.accessibilityRole==='checkbox').props.accessibilityState.disabled);settle();await action;checkout.render();checkout.find(n=>n.props.accessibilityRole==='alert');await checkout.button('Retry loading').props.onPress();assert.equal(checkoutCalls,1);
 billing={...billing,plan:{name:'Pro',scan_limit:null,expires_at:'2026-12-14T04:00:00Z'}};await checkout.button('Refresh history').props.onPress();checkout.render();assert.throws(()=>checkout.find(n=>n.props.accessibilityRole==='checkbox'));assert.throws(()=>checkout.button('Continue to checkout'));
 console.log('PASS checkout screen: disabled explanations, handler acknowledgement guard, request lock/loading, retry without purchase, active-Pro no purchase');
}
main().catch(e=>{console.error(e);process.exitCode=1;});


for(const verdict of ['authentic','uncertain']){
 const r=regionPresentation(result(verdict,'Digitally Edited',.9604));assert.equal(r.originalOnly,true);assert.equal(r.available,false);
}
assert.equal(regionPresentation(result('ai_generated','AI Generated',.9)).available,true);
