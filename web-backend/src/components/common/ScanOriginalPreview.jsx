import {originalImageOnly} from '../../../shared/digital-editing-display.mjs';
import {useEffect,useState} from 'react';
import {ImageIcon,RefreshCw,FileImage,Clock3} from 'lucide-react';
import {fetchScanImage} from '../../services/api';

export default function ScanOriginalPreview({scan}) {
  const [state,setState]=useState({url:'',error:false}),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let active=true,url='';
    const timeout=setTimeout(()=>controller.abort(),20000);
    setState({url:'',error:false});
    fetchScanImage(scan.scan_id,controller.signal).then(blob=>{
      if(!active)return;
      url=URL.createObjectURL(blob);setState({url,error:false});
    }).catch(()=>{if(active)setState({url:'',error:true});}).finally(()=>clearTimeout(timeout));
    return()=>{active=false;controller.abort();clearTimeout(timeout);if(url)URL.revokeObjectURL(url);};
  },[scan.scan_id,attempt]);
  const authentic=scan.status==='completed'&&originalImageOnly(scan.analysis);
  const size=Number.isFinite(scan.file_size_bytes)?`${(scan.file_size_bytes/1024).toFixed(1)} KB`:null;
  const uploaded=scan.created_at&&!Number.isNaN(new Date(scan.created_at).getTime())
    ?new Date(scan.created_at).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):null;
  return <section aria-labelledby="scan-preview-title" className="flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <h2 id="scan-preview-title" className="flex items-center gap-2 text-sm font-bold text-ink"><ImageIcon aria-hidden="true" className="h-4 w-4 text-accent"/>{authentic?'Suspected edit regions':'Uploaded image'}</h2>
      <span className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-ink-secondary">Original image</span>
    </div>
    <div className="flex min-h-80 flex-1 items-center justify-center bg-gradient-to-br from-canvas via-surface-raised/60 to-accent-soft/40 p-4 sm:min-h-96 lg:min-h-[420px]" data-testid="original-image-preview">
      {state.error?<div role="alert" className="max-w-xs p-5 text-center">
        <ImageIcon aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-ink-muted"/>
        <p className="text-sm text-ink-secondary">The uploaded image could not be loaded.</p>
        <button type="button" onClick={()=>setAttempt(value=>value+1)} className="mt-4 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent-soft">Retry original image</button>
      </div>:state.url?<img src={state.url} alt="Uploaded original image" className="max-h-[520px] w-full object-contain" onError={()=>setState(previous=>({...previous,error:true}))}/>
        :<p role="status" className="flex items-center gap-2 text-sm text-ink-secondary"><RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin"/>Loading original image…</p>}
    </div>
    <div className="space-y-3 border-t border-line px-5 py-4 sm:px-6">
      <p className="flex items-start gap-2 text-sm font-semibold text-ink"><FileImage aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted"/><span className="min-w-0 [overflow-wrap:anywhere]">{scan.original_file_name}</span></p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
        {size&&<span>{size}</span>}{uploaded&&<span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="h-3.5 w-3.5"/>{uploaded}</span>}
      </div>
    </div>
  </section>;
}
