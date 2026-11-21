import {useCallback,useEffect,useState} from 'react';
import {fetchUserStats,fetchUserScans} from '../services/api';

/** The same account-wide statistics and allowance refresh rules on both pages. */
export function useScanStatistics({includeRecent=false}={}) {
  const [state,setState]=useState({loading:true,error:'',stats:null,scans:[]});
  const [attempt,setAttempt]=useState(0);
  const refresh=useCallback(()=>setAttempt(value=>value+1),[]);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),20000);
    setState({loading:true,error:'',stats:null,scans:[]});
    Promise.all([
      fetchUserStats(controller.signal),
      fetchUserScans({status:'authentic',limit:1,signal:controller.signal}),
      includeRecent?fetchUserScans({limit:5,signal:controller.signal}):Promise.resolve(null),
    ]).then(([statsResponse,authenticResponse,recentResponse])=>{
      if(active)setState({loading:false,error:'',stats:{...statsResponse?.data,authentic_found:authenticResponse?.data?.pagination?.total},scans:recentResponse?.data?.scans||[]});
    }).catch(error=>{
      if(active)setState({loading:false,error:error.name==='AbortError'?'Scan data took too long to load. Check your connection and try again.':error.message||'Scan data unavailable. Please try again.',stats:null,scans:[]});
    }).finally(()=>clearTimeout(timeout));
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[attempt,includeRecent]);

  useEffect(()=>{
    const reload=()=>{if(document.visibilityState==='visible')refresh();};
    const delay=Date.parse(state.stats?.allowance_resets_at)-Date.parse(state.stats?.server_now);
    const timer=Number.isFinite(delay)&&delay>0?setTimeout(reload,Math.min(delay+1000,86401000)):null;
    window.addEventListener('focus',reload);
    document.addEventListener('visibilitychange',reload);
    return()=>{clearTimeout(timer);window.removeEventListener('focus',reload);document.removeEventListener('visibilitychange',reload);};
  },[state.stats,refresh]);
  return {state,refresh};
}
