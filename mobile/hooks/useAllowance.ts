import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {scanHistoryService} from '../services/scan/scanHistoryService';
export function useAllowance(){
 const [stats,setStats]=useState<Awaited<ReturnType<typeof scanHistoryService.getStats>>|null>(null),[error,setError]=useState('');const generation=useRef(0),mounted=useRef(true);
 const refresh=useCallback(async()=>{const version=++generation.current;setError('');try{const value=await scanHistoryService.getStats();if(mounted.current&&version===generation.current)setStats(value);}catch{if(mounted.current&&version===generation.current){setStats(null);setError('Scan allowance could not be loaded.');}}},[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
 useFocusEffect(useCallback(()=>{void refresh();const listener=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});return()=>{generation.current++;listener.remove();};},[refresh]));
 useEffect(()=>{
  // Refresh at the server's plan expiry or at the next Philippine midnight.
  const now=Date.now(),midnight=(Math.floor((now+8*3600000)/86400000)+1)*86400000-8*3600000;
  const expiry=stats?.plan&&'expires_at' in stats.plan?Date.parse(String(stats.plan.expires_at)):NaN;
  const next=Number.isFinite(expiry)&&expiry>now?Math.min(expiry,midnight):midnight;
  const timer=setTimeout(()=>void refresh(),Math.max(1000,next-now+1000));return()=>clearTimeout(timer);
 },[stats,refresh]);
 const label=error?error:!stats?'Loading scan allowance…':!stats.plan?'Plan information unavailable.':stats.plan.scan_limit===null?'Pro · Unlimited scans during your active pass.':typeof stats.scans_remaining==='number'&&Number.isFinite(stats.scans_remaining)?'Free · '+stats.scans_remaining+' of '+stats.plan.scan_limit+' daily scans remaining. Resets at midnight Philippine time.':'Scan allowance is unavailable. Refresh to check it.';
 return {stats,error,label,refresh};
}
