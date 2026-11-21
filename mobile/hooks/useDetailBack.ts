import {useCallback} from 'react';
import {BackHandler} from 'react-native';
import {router,useFocusEffect,useRootNavigationState,type Href} from 'expo-router';

type State = {index?:number;routes:readonly {name:string;state?:State}[]};
function leaf(state:State|undefined):string|undefined {
 if(!state?.routes.length)return;const route=state.routes[state.index??state.routes.length-1];
 return route?.state?leaf(route.state):route?.name;
}
export function previousScreen(state:State|undefined):string|undefined {
 if(!state)return;const index=state.index??state.routes.length-1;
 const current=state.routes[index];
 return previousScreen(current?.state)??(index>0?leaf({index:index-1,routes:state.routes}):undefined);
}
export function returnFromDetail(fallback:Href){
 if(router.canGoBack())router.back();else router.replace(fallback);
}
/** Leave normal stack gestures/device Back intact; handle only an empty back stack. */
export function useDetailBack(fallback:Href,disabled=false){
 const state=useRootNavigationState();
 const goBack=useCallback(()=>{if(!disabled)returnFromDetail(fallback);},[fallback,disabled]);
 useFocusEffect(useCallback(()=>{
  const listener=BackHandler.addEventListener('hardwareBackPress',()=>{
   if(disabled)return true;
   if(router.canGoBack())return false;
   goBack();return true;
  });return()=>listener.remove();
 },[goBack,disabled]));
 const previous=previousScreen(state as unknown as State);
 return {goBack,previous,returnsToHistory:previous==='history'||(!previous&&fallback==='/(tabs)/history')};
}
