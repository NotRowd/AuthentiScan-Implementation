import {useEffect,useState} from 'react';
import {fetchScanHeatmap} from '../../services/api';
export default function ProtectedHeatmap({scanId,available,className='w-full h-80 object-contain'}){
  const [attempt,setAttempt]=useState(0);
  if(!available)return <p className="text-sm text-slate-400 p-6">No heatmap was supplied for this scan.</p>;
  return <HeatmapImage key={scanId+':'+attempt} scanId={scanId} className={className} retry={()=>setAttempt(a=>a+1)} />;
}
function HeatmapImage({scanId,className,retry}){
  const [src,setSrc]=useState(''),[failed,setFailed]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let active=true,url;
    fetchScanHeatmap(scanId,controller.signal).then(blob=>{if(active){url=URL.createObjectURL(blob);setSrc(url);}}).catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;controller.abort();if(url)URL.revokeObjectURL(url);};
  },[scanId]);
  if(failed)return <div role="status" className="p-4 text-amber-200 text-sm">Heatmap unavailable. Saved scores are unchanged. <button className="button-secondary mt-3" onClick={retry}>Retry heatmap</button></div>;
  return src?<img src={src} alt="Grad-CAM heatmap" className={className} onError={()=>setFailed(true)}/>:<p role="status" className="text-sm text-slate-400 p-6">Loading heatmap…</p>;
}
