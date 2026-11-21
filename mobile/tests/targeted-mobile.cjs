const assert=require('node:assert/strict'),{harness,pure,cache,listeners}=require('./targeted-ui-harness.cjs');
const clean=x=>JSON.parse(JSON.stringify(x));
async function main(){
 const metrics=pure('hooks/useMobileTabSpacing.ts');
 for(const bottom of [0,20,34,48])for(const scale of [1,1.5,2]){const m=metrics.mobileTabMetrics(bottom,scale);assert.equal(m.paddingBottom,bottom+8);assert.equal(m.contentBottom,m.height+20);assert.ok(m.height-bottom>=84);}
 for(const theme of [false,true])for(const scale of [1,1.5,2]){
  const tab=harness('app/(tabs)/_layout.tsx',{dark:theme,fontScale:scale,bottom:34,auth:{isLoading:false,isAuthenticated:true}});tab.render();const settings=tab.tree.props.screenOptions;
  assert.equal(settings.tabBarStyle[1].paddingBottom,42);assert.equal(settings.tabBarIconStyle.height,48);assert.equal(settings.tabBarLabelPosition,'below-icon');
  assert.deepEqual(tab.all(x=>x.type==='TabScreen').map(x=>x.props.options.title),['Dashboard','Scan','History','Settings']);
  const back=harness('components/ui/DetailBack.tsx',{dark:theme,exportName:'BackButton',props:{onPress(){}}});back.render();const button=back.find(x=>x.props.accessibilityLabel==='Go back');const style=button.props.style({pressed:false});assert.equal(style.minHeight,44);assert.ok(style.minWidth>=44);button.props.onFocus();back.render();assert.equal(back.find(x=>x.props.accessibilityLabel==='Go back').props.style({pressed:false}).borderColor,back.palette().focus);
  const menu=harness('components/ui/ScanActions.tsx',{dark:theme,props:{fileName:'long-filename.jpg',onDelete(){}}});menu.render();const target=menu.tree;assert.equal(target.props.style({pressed:false})[0].width,44);assert.equal(target.props.style({pressed:false})[0].height,44);
 }
 for(const fallback of ['/(tabs)/history','/(tabs)/settings','/(public)/home','/result']){
  const calls=[],m={navigationState:{index:0,routes:[{name:'detail'}]},router:{canGoBack:()=>false,back:()=>calls.push('back'),replace:route=>calls.push(route)}};
  const ui=harness('hooks/useDetailBack.ts',m),hook=ui.module.useDetailBack(fallback);hook.goBack();assert.equal(calls.pop(),fallback);assert.equal(m.hardwareBack,undefined);ui.module.useDetailBack(fallback); // Hook registers only while focused (below).
  const focused=[];const real=pure('hooks/useDetailBack.ts',name=>name==='react'?{useCallback:fn=>fn}:name==='react-native'?{BackHandler:{addEventListener:(_,fn)=>{focused.push(fn);return {remove(){}};}}}:{router:m.router,useRootNavigationState:()=>m.navigationState,useFocusEffect:fn=>fn()});
  real.useDetailBack(fallback);assert.equal(focused.at(-1)(),true);assert.equal(calls.pop(),fallback);
  m.router.canGoBack=()=>true;real.useDetailBack(fallback).goBack();assert.equal(calls.pop(),'back');assert.equal(focused.at(-1)(),false);assert.equal(calls.length,0);
 }
 const nav=pure('hooks/useDetailBack.ts',()=>({}));
 assert.equal(nav.previousScreen({index:1,routes:[{name:'(tabs)',state:{index:2,routes:[{name:'dashboard'},{name:'scan'},{name:'history'}]}},{name:'result'}]}),'history');
 assert.equal(nav.previousScreen({index:1,routes:[{name:'(tabs)',state:{index:1,routes:[{name:'dashboard'},{name:'scan'}]}},{name:'result'}]}),'scan');
 assert.equal(nav.previousScreen({index:0,routes:[{name:'result'}]}),undefined);
 console.log('PASS top Back normal/direct fallback, nested origins, hardware Back, unchanged tabs, real inset/large-text metrics, focus and 44px controls in both themes');

 for(const os of ['ios','android'])for(const dark of [false,true]){
  let deletes=0,focuses=0;const m={os,dark,alerts:[],props:{fileName:'sample.jpg',onDelete:()=>deletes++}},ui=harness('components/ui/ScanActions.tsx',m);ui.render();ui.tree.props.ref.current={focus(){focuses++;}};ui.tree.props.onPress();ui.tree.props.onPress();ui.render();assert.equal(os==='ios'?m.sheetCalls:m.alerts.length,1,'Guard two taps before a rerender');assert.equal(ui.tree.props.accessibilityState.expanded,true);
  if(os==='ios'){assert.deepEqual(clean(m.sheet.options.options),['Cancel','Delete scan']);assert.equal(m.sheet.options.userInterfaceStyle,dark?'dark':'light');m.sheet.callback(0);}else{assert.equal(m.alerts[0][0],'Scan actions');m.alerts[0][2][0].onPress();}
  assert.equal(deletes,0);assert.ok(focuses>0);ui.render();ui.tree.props.onPress();
  if(os==='ios')m.sheet.callback(1);else m.alerts.at(-1)[2][1].onPress();assert.equal(deletes,1);ui.render();
  m.props.disabled=true;ui.render();const count=m.alerts.length;ui.tree.props.onPress();assert.equal(m.alerts.length,count);
 }
 console.log('PASS native iOS/Android action menus, cancellation, delete handoff, busy lock, and light/dark action-sheet appearance');

 cache.clearHistoryViews();let data=Array.from({length:140},(_,i)=>({id:'scan-'+i,fileName:'field-study-'+i+'.jpg',status:'completed',hasAnalysis:true,verdict:'authentic',confidence:97.5,analysisProvider:'truthscan',analysis:{provider_label:'Real'},scannedAt:'2026-11-18T01:23:00Z'}));
 const requests=[],routes=[],alerts=[];let removals=0,failDelete=false;
 const history={getPage:async(offset,limit,filters)=>{assert.ok(limit<=100);requests.push({offset,limit,filters:clean(filters)});return {scans:data.slice(offset,offset+limit),pagination:{total:data.length,offset,limit}};},remove:async id=>{removals++;if(failDelete)throw Error('Could not delete this scan.');data=data.filter(row=>row.id!==id);}};
 const mocks={history,alerts,auth:{user:{id:'owner-a'}},router:{push:route=>routes.push(route),replace(){},canGoBack:()=>true,back(){}}};
 const ui=harness('app/(tabs)/history.tsx',mocks);ui.render();await ui.flush();ui.focus();await ui.flush();assert.equal(ui.all(n=>n.type==='ScanActions').length,20);
 const input=ui.find(n=>n.props.accessibilityLabel==='Search scan history');input.props.onChangeText('field');ui.render();ui.find(n=>n.props.accessibilityRole==='radio'&&n.props.accessibilityLabel==='Authentic').props.onPress();ui.render();ui.button('Apply filters').props.onPress();ui.render();await ui.flush();assert.deepEqual(requests.at(-1).filters,{q:'field',status:'authentic'});
 for(let i=0;i<5;i++){await ui.button('Load more scans').props.onPress();ui.render();await ui.flush();}assert.equal(ui.all(n=>n.type==='ScanActions').length,120);
 const scroll=ui.find(n=>n.type==='ScrollView'),positions=[];scroll.props.ref.current={scrollTo:point=>positions.push(point)};scroll.props.onScroll({nativeEvent:{contentOffset:{y:700}}});scroll.props.onMomentumScrollEnd({nativeEvent:{contentOffset:{y:730}}});
 ui.find(n=>n.props.accessibilityLabel==='Open field-study-0.jpg').props.onPress();assert.equal(routes.pop(),'/result');ui.blur();
 assert.equal(cache.readHistoryView('owner-a').scrollY,730);assert.equal(cache.readHistoryView('owner-a').offset,120);
 const before=requests.length;ui.focus();ui.render();assert.equal(ui.all(n=>n.type==='ScanActions').length,120,'Do not blank the loaded window on return');await ui.flush();
 assert.deepEqual(requests.slice(before).map(x=>[x.offset,x.limit]),[[0,100],[100,20]],'Refresh past 100 without an invalid API limit');
 ui.find(n=>n.type==='ScrollView').props.onContentSizeChange();assert.equal(positions.at(-1).y,730);assert.equal(ui.find(n=>n.props.accessibilityLabel==='Search scan history').props.value,'field');
 const action=ui.find(n=>n.type==='ScanActions');action.props.onDelete();assert.equal(removals,0);assert.equal(alerts.at(-1)[0],'Delete this scan?');assert.match(alerts.at(-1)[1],/Used credits stay the same/);assert.equal(alerts.at(-1)[2][0].text,'Cancel');
 failDelete=true;await alerts.at(-1)[2][1].onPress();ui.render();await ui.flush();assert.equal(removals,1);assert.equal(ui.all(n=>n.type==='ScanActions').length,120);assert.ok(ui.all(n=>n.props.children==='Could not delete this scan.').length);
 failDelete=false;ui.find(n=>n.type==='ScanActions').props.onDelete();const confirm=alerts.at(-1)[2][1].onPress;await Promise.all([confirm(),confirm()]);ui.render();await ui.flush();assert.equal(removals,2,'Guard duplicate confirmations');assert.equal(data.length,139);assert.equal(requests.at(-1).filters.status,'authentic');
 ui.blur();const remount=harness('app/(tabs)/history.tsx',mocks);remount.render();assert.equal(remount.find(n=>n.props.accessibilityLabel==='Search scan history').props.value,'field');assert.equal(remount.find(n=>n.type==='ScrollView').props.contentOffset.y,730);assert.ok(remount.all(n=>n.type==='ScanActions').length>=100);
 remount.find(n=>n.props.accessibilityLabel==='Search scan history').props.onChangeText('draft not applied');remount.render();remount.find(n=>n.props.accessibilityRole==='radio'&&n.props.accessibilityLabel==='Failed').props.onPress();remount.render();await remount.flush();remount.focus();await remount.flush();assert.equal(remount.find(n=>n.props.accessibilityLabel==='Search scan history').props.value,'draft not applied');assert.deepEqual(requests.at(-1).filters,{q:'field',status:'authentic'},'Returning does not silently apply unfinished filter drafts');remount.blur();
 const staleRevision=cache.historyViewRevision(),saved=cache.readHistoryView('owner-a');for(const listener of listeners)listener();cache.saveHistoryView('owner-a',saved,staleRevision);assert.equal(cache.readHistoryView('owner-a').scans.length,0);assert.equal(cache.readHistoryView('owner-b').search,'');
 console.log('PASS actual History screen: applied filters, 120-row return, retained scroll and remount, paginated refresh, confirmed/error/duplicate deletion, session cleanup and account isolation');

 for(const [dev,expo,expected] of [[true,true,64],[false,true,0],[true,false,0],[false,false,0]]){const ui=harness('hooks/useExpoControlClearance.ts',{dev,expo});assert.equal(ui.module.useExpoControlClearance(),expected);}
 const report={id:'22222222-2222-4222-8222-222222222222',status:'completed',hasAnalysis:true,verdict:'authentic',confidence:97.5,analysisProvider:'truthscan',analysis:{provider_label:'Real',provider_label_confidence:.975},fileName:'sample.jpg',scannedAt:'2026-11-18T00:00:00Z'};
 for(const [previous,extraHistory] of [['history',false],['scan',true],[null,false]]){const calls=[],m={result:report,navigationState:{index:previous?1:0,routes:previous?[{name:'(tabs)',state:{index:0,routes:[{name:previous}]}},{name:'result'}]:[{name:'result'}]},router:{canGoBack:()=>!!previous,back:()=>calls.push('back'),replace:route=>calls.push(route)},history};const ui=harness('app/result.tsx',m);ui.render();assert.equal(ui.all(n=>n.props.label==='Back to history').length,extraHistory?1:0);ui.find(n=>n.type==='BackButton').props.onPress();assert.equal(calls.pop(),previous?'back':'/(tabs)/history');}
 const emptyCalls=[],empty=harness('app/result.tsx',{result:null,router:{canGoBack:()=>false,replace:route=>emptyCalls.push(route)}});empty.render();await empty.flush();assert.ok(emptyCalls.includes('/(tabs)/history'),'Direct report with no saved handoff keeps the existing History guard');
 console.log('PASS report normal/direct Back and duplicate footer conditions; no-data direct guard unchanged; Expo adjustment never reaches release builds');
 for(const file of ['app/edit-profile.tsx'])for(const previous of [true,false]){const calls=[],ui=harness(file,{auth:{user:{id:'a',email:'alex@example.com'}},router:{canGoBack:()=>previous,back:()=>calls.push('back'),replace:route=>calls.push(route)}});ui.render();ui.find(n=>n.type==='BackButton').props.onPress();assert.equal(calls.pop(),previous?'back':'/(tabs)/settings');}
 for(const [file,expected] of [['app/checkout.tsx','/(tabs)/settings'],['app/(public)/pricing.tsx','/(public)/home']]){const ui=harness(file,{auth:{isAuthenticated:false,user:{id:'a'}},result:report});ui.render();assert.equal(ui.find(n=>n.type==='DetailBack').props.fallback,expected);}
 for(const file of ['app/(public)/about.tsx','app/(public)/how-it-works.tsx'])for(const signed of [false,true]){const ui=harness(file,{auth:{isAuthenticated:signed}});ui.render();assert.equal(ui.find(n=>n.type==='DetailBack').props.fallback,signed?'/(tabs)/settings':'/(public)/home');}
 const password=harness('app/change-password.tsx',{auth:{user:{id:'a'}}});password.render();assert.equal(password.tree.props.backFallback,'/(tabs)/settings');assert.equal(password.all(n=>n.props.label==='Back').length,0);
 const account=harness('components/AccountLayout.tsx',{props:{title:'Sign in',subtitle:'Existing form',children:null}});account.render();assert.equal(account.find(n=>n.type==='DetailBack').props.fallback,'/(public)/home');
 const settings=harness('app/(tabs)/settings.tsx',{auth:{user:{id:'a',name:'Alex Rivera',email:'alex@example.com'}}});settings.render();assert.equal(settings.all(n=>n.props.accessibilityLabel?.toLowerCase()==='edit profile').length,1);assert.equal(settings.all(n=>n.type==='AppearanceControl').length,1);assert.ok(settings.all(n=>n.props.children==='Notifications').length,'Do not remove existing feature rows');
 console.log('PASS screen-specific direct-entry fallbacks, single Settings edit action, retained appearance control/feature rows, and duplicate password Back removal');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
