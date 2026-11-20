import {useEffect,useRef,useState} from 'react';
import {detectScanObjects,fetchObjectImage,fetchScanHeatmap} from '../../services/api';
import {OBJECT_SCOPE} from '../../../shared/result-language.mjs';

function ObjectView({scanId,detection,hasHeatmap}){
  const [source,setSource]=useState('original'),[selected,setSelected]=useState(null),[showBoxes,setShowBoxes]=useState(true);
  const [preview,setPreview]=useState({url:'',error:''}),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let active=true,url;
    setPreview({url:'',error:''});
    const fetchImage=source==='heatmap'?fetchScanHeatmap:fetchObjectImage;
    fetchImage(scanId,controller.signal).then(blob=>{
      if(!active)return;url=URL.createObjectURL(blob);setPreview({url,error:''});
    }).catch(()=>{if(active)setPreview({url:'',error:'Image preview unavailable. The saved object list is still shown.'});});
    return ()=>{active=false;controller.abort();if(url)URL.revokeObjectURL(url);};
  },[scanId,source,retry]);
  const {image_width:width,image_height:height,objects}=detection;
  const fontSize=Math.max(width,height)/38,stroke=Math.max(width,height)/300;
  return <>
    <div className="mt-5 flex flex-wrap gap-3 items-center text-sm">
      <button type="button" aria-pressed={source==='original'} onClick={()=>setSource('original')} className="rounded-xl border border-control px-3 py-2 text-ink aria-pressed:bg-accent-soft">Original with objects</button>
      {hasHeatmap&&<button type="button" aria-pressed={source==='heatmap'} onClick={()=>setSource('heatmap')} className="rounded-xl border border-control px-3 py-2 text-ink aria-pressed:bg-accent-soft">Compare with Grad-CAM</button>}
      <label className="flex gap-2 items-center text-ink-secondary"><input type="checkbox" checked={showBoxes} onChange={e=>setShowBoxes(e.target.checked)}/>Show object boxes</label>
    </div>
    <div className="mt-4 rounded-2xl border border-line bg-canvas p-3 min-h-40 flex justify-center items-center">
      {preview.error?<div role="alert" className="text-sm text-ink-secondary"><p>{preview.error}</p><button type="button" onClick={()=>setRetry(n=>n+1)} className="mt-3 underline">Retry preview</button></div>:!preview.url?<p role="status" className="text-sm text-ink-secondary">Loading object preview…</p>:
        <svg role="img" aria-label={source==='heatmap'?'Detected object boxes over the saved Grad-CAM heatmap':'Detected objects on the model-oriented original image'} viewBox={`0 0 ${width} ${height}`} className="w-full max-h-[440px]" style={{aspectRatio:`${width}/${height}`}}>
          <image href={preview.url} width={width} height={height} preserveAspectRatio="none" onError={()=>setPreview({url:'',error:'Image could not be displayed. Retry the preview.'})}/>
          {showBoxes&&objects.map((object,index)=>{
            const [x1,y1,x2,y2]=object.box,highlight=selected===null||selected===index;
            return <g key={index} opacity={highlight?1:.35}>
              <rect x={x1*width} y={y1*height} width={(x2-x1)*width} height={(y2-y1)*height} fill="none" stroke={selected===index?'#f97316':'#0284c7'} strokeWidth={stroke*(selected===index?2:1)}/>
              <rect x={Math.min(x1*width,width-fontSize*1.8)} y={Math.min(y1*height,height-fontSize*1.4)} width={fontSize*1.8} height={fontSize*1.4} fill="#075985"/>
              <text x={Math.min(x1*width,width-fontSize*1.8)+fontSize*.2} y={Math.min(y1*height,height-fontSize*1.4)+fontSize*1.05} fontSize={fontSize} fill="white">{index+1}</text>
            </g>;
          })}
        </svg>}
    </div>
    {source==='heatmap'&&<p className="mt-2 text-xs leading-relaxed text-ink-secondary">Heatmap overlap does not prove an object is manipulated.</p>}
    {objects.length===0?<p role="status" className="mt-4 rounded-xl bg-canvas p-4 text-sm text-ink-secondary">No supported objects reached the 50% detection-score threshold. This does not mean the image is empty or authentic.</p>:
      <div className="mt-4">
        <p className="text-sm font-semibold text-ink">{objects.length} detected object{objects.length===1?'':'s'} · Select one to highlight its box</p>
        <ol className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {objects.map((object,index)=><li key={index}><button type="button" aria-pressed={selected===index} onClick={()=>setSelected(selected===index?null:index)} className="w-full rounded-xl border border-line bg-surface p-3 text-left text-sm text-ink aria-pressed:border-accent aria-pressed:bg-accent-soft">
            <span className="font-bold">{index+1}. {object.label}</span><span className="block mt-1 text-xs text-ink-secondary">Detection score: {(object.score*100).toFixed(1)}%</span>
          </button></li>)}
        </ol>
      </div>}
    {detection.truncated&&<p className="mt-3 text-xs text-ink-secondary">Showing the 20 highest-scoring detections.</p>}
    <details className="mt-4 text-xs text-ink-secondary break-words"><summary className="cursor-pointer py-1">Detector details</summary><p className="mt-2">Detector: {detection.model_version} · COCO categories · Minimum score: 50%. Detection scores are not authenticity scores or overall model accuracy. Model orientation is shown; EXIF rotation is not applied.</p></details>
  </>;
}

export default function ObjectDetectionPanel({scan}){
  const [detection,setDetection]=useState(scan.object_detection),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const active=useRef(null);
  useEffect(()=>()=>{active.current?.abort();active.current=null;},[]);
  async function identify(){
    if(active.current)return;
    const controller=new AbortController();active.current=controller;setBusy(true);setError('');
    try{const response=await detectScanObjects(scan.scan_id,controller.signal);if(active.current===controller)setDetection(response.data);}
    catch(e){if(active.current===controller)setError(e.message||'Object detection is unavailable. Try again later.');}
    finally{if(active.current===controller){active.current=null;setBusy(false);}}
  }
  return <section aria-labelledby="objects-title" className="rounded-3xl border border-line bg-surface p-6 md:p-8 shadow-sm">
    <h2 id="objects-title" className="text-lg font-bold text-ink">Objects in the image</h2>
    <p className="mt-2 text-sm leading-relaxed text-ink-secondary">Object labels describe content, not whether it is real or AI-generated.</p>
    {detection?.status==='available'&&detection.objects.length===0?<p role="status" className="mt-3 text-sm text-ink-secondary">No objects could be identified confidently. This does not mean the image is empty or authentic.</p>:detection?.status==='available'?<ObjectView scanId={scan.scan_id} detection={detection} hasHeatmap={Boolean(scan.analysis?.heatmap_url)&&scan.analysis?.preprocessing_version==='rgb-pillow-bilinear-224-v1'}/>:
      <div className="mt-4 rounded-xl bg-canvas p-4">
        <p className="text-sm text-ink-secondary">{scan.status!=='completed'?'Object context can be requested after classification completes.':detection?.status==='unavailable'?'Object detection was unavailable when this image was scanned. You can retry without changing its saved classification.':'This older scan has no saved object detections yet.'}</p>
        {scan.status==='completed'&&<button type="button" disabled={busy} onClick={identify} className="theme-action mt-4 rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-on-action hover:bg-action-hover disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line">{busy?'Identifying objects…':'Identify objects'}</button>}
        {busy&&<p role="status" className="mt-3 text-sm text-ink-secondary">Checking the saved original image…</p>}
        {error&&<p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <p className="mt-3 text-xs text-ink-secondary">No additional scan credit is used. Available detections are saved with this scan.</p>
      </div>}
    <details className="mt-3 text-xs text-ink-secondary"><summary className="cursor-pointer py-1">About object detection</summary><p className="mt-2">{OBJECT_SCOPE}</p>
      {detection?.status==='available'&&detection.objects.length===0&&<p className="mt-2">No supported objects reached the 50% detection-score threshold. Detector: {detection.model_version}</p>}
      {scan.analysis?.preprocessing_version==='exif-white-rgb-pillow-bilinear-224-v2'&&<p className="mt-2">Heatmap comparison is disabled for this model version: its orientation/transparency preprocessing differs from the current object detector. The original-image boxes remain available.</p>}
    </details>
  </section>;
}
