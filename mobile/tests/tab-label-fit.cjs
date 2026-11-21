const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {harness,pure}=require('./targeted-ui-harness.cjs');
// Read the installed navigator's real item/button padding, not a browser stand-in.
const file=path.resolve(__dirname,'../node_modules/expo-router/build/react-navigation/bottom-tabs/views/BottomTabItem.js'),moduleValue={exports:{}};
vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nmodule.exports.__styles=styles;',{
 module:moduleValue,exports:moduleValue.exports,
 require:name=>name==='react-native'?{Platform:{OS:'ios',Version:'18'},StyleSheet:{create:value=>value}}:{},
});
const nativePadding=moduleValue.exports.__styles.tabVerticalUiKit.padding;
assert.equal(typeof nativePadding,'number');
const metrics=pure('hooks/useMobileTabSpacing.ts');
for(const bottom of [0,20,34,48])for(const scale of [1,1.3,1.5,2])for(const dark of [false,true]){
 const spacing=metrics.mobileTabMetrics(bottom,scale),ui=harness('app/(tabs)/_layout.tsx',{dark,bottom,fontScale:scale,auth:{isLoading:false,isAuthenticated:true}});ui.render();
 const options=ui.tree.props.screenOptions,bar=Object.assign({},...options.tabBarStyle),item=Object.assign({},...options.tabBarItemStyle);
 const label=options.tabBarLabel({children:'Dashboard',color:'#000'}),style=Object.assign({},...label.props.style);
 const lines=scale>1.25?2:1;
 const required=item.paddingTop+nativePadding*2+options.tabBarIconStyle.height+style.marginTop+Math.ceil(style.lineHeight*scale*lines);
 const available=bar.height-bar.paddingBottom-bar.paddingTop-bar.borderTopWidth;
 assert.ok(available>=required+4,JSON.stringify({bottom,scale,dark,required,available}));
 assert.equal(style.flexShrink,0,'Do not compress labels below their scaled line height');
 assert.ok(item.minHeight>=required+4);
 assert.equal(bar.paddingBottom,bottom+8);
 assert.equal(spacing.contentBottom,bar.height+20);
}
console.log('PASS 16 inset/text combinations in each theme: installed native button padding, full icon + label height, no label compression, safe-area and content clearance.');
