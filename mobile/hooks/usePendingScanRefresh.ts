import {useEffect,useRef} from 'react';
import {AppState} from 'react-native';
import type {ScanResult} from '../types';
import {OFFLINE_MODE} from '../services/api/config';
// Poll only the existing authenticated saved-scan endpoint. The server may finish
// or resume the same provider job; never submit another image or analysis here.
export function usePendingScanRefresh(result:ScanResult|null,operation:unknown,error:string,refresh:()=>Promise<void>){
 const callback=useRef(refresh);callback.current=refresh;
 useEffect(()=>{
  if(OFFLINE_MODE||!result||!['queued','processing'].includes(result.status))return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{clearTimeout(timer);if(AppState.currentState==='active'&&!operation&&!error)timer=setTimeout(()=>{void callback.current();},5000);};
  const listener=AppState.addEventListener('change',state=>{clearTimeout(timer);if(state==='active'&&!operation)void callback.current();});
  schedule();return()=>{clearTimeout(timer);listener.remove();};
 },[result,operation,error]);
}
