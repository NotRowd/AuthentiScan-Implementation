import {originalImageOnly} from '../../../shared/digital-editing-display.mjs';
import {useEffect,useState} from 'react';
import {fetchLocalizationImage,fetchScanImage} from '../../services/api';
import {localizationMessage,normalizeLocalization,unavailableLocalization,MESORCH_LOCALIZER_MODEL} from '../../../shared/localization-contract.mjs';

function MesorchPreview({scanId,originalOnly=false,fluid=false}){
  const [images,setImages]=useState({}),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let active=true,urls=[];
    setImages({});
    for(const [key,load] of originalOnly?[['original',fetchScanImage]]:[['original',fetchScanImage],['highlighted',fetchLocalizationImage]]){
      load(scanId,controller.signal).then(blob=>{
        if(!active)return;
        const url=URL.createObjectURL(blob);urls.push(url);
        setImages(previous=>({...previous,[key]:{url,error:false}}));
      }).catch(()=>{if(active)setImages(previous=>({...previous,[key]:{url:'',error:true}}));});
    }
    return ()=>{active=false;controller.abort();for(const url of urls)URL.revokeObjectURL(url);};
  },[scanId,attempt,originalOnly]);
  return <div className={`mt-4 grid grid-cols-1 gap-4 ${originalOnly?'':'sm:grid-cols-2'}`}>
    {(originalOnly?[['original','Original image']]:[['original','Original image'],['highlighted',fluid?'Provided heatmap':'Model highlights']]).map(([key,label])=><figure key={key} className="overflow-hidden rounded-xl border border-line bg-canvas">
      <div className={fluid ? "flex min-h-32 items-center justify-center p-2" : "flex h-80 items-center justify-center p-2"}>
        {images[key]?.error?<div className="p-4 text-sm text-ink-secondary"><p role="alert">{label} could not be loaded.</p><button type="button" onClick={()=>setAttempt(value=>value+1)} className="mt-3 rounded-lg border border-accent px-3 py-2 font-semibold text-accent">Retry images</button></div>:!images[key]?.url?<p role="status" className="text-sm text-ink-secondary">Loading image…</p>:<img src={images[key].url} alt={label} onError={()=>setImages(previous=>({...previous,[key]:{url:'',error:true}}))} className={fluid ? "block h-auto max-h-[560px] w-full object-contain" : "h-full w-full object-contain"}/>}
      </div>
      <figcaption className="px-3 py-2 text-sm font-semibold text-ink">{key==='highlighted'&&<span aria-hidden="true" className="mr-2 inline-block h-3 w-3 rounded-sm bg-media-highlight"/>}{label}</figcaption>
    </figure>)}
  </div>;
}

function MesorchPanel({scan,result}){
  const label=result.status==='available'?'Suggestions available':result.status==='uncertain'?'No reliable region':'Not available';
  return <section aria-labelledby="localization-title" className="bg-surface rounded-3xl border border-line shadow-sm p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="localization-title" className="font-bold text-lg text-ink">Suspected edit regions</h2>
      <span className="rounded-full border border-control bg-canvas px-3 py-1 text-sm font-medium text-ink-secondary">{label}</span>
    </div>
    <p className="mt-2 text-sm leading-relaxed text-ink-secondary">Compare the original image with the areas highlighted by the localization model.</p>
    {result.status==='available'?<>
      <MesorchPreview key={scan.scan_id} scanId={scan.scan_id}/>
      <p className="mt-4 text-sm text-ink-secondary"><strong>{result.highlighted_pixels.toLocaleString()} pixels highlighted</strong> · About {(result.highlighted_fraction*100).toFixed(1)}% of the image</p>
    </>:result.status==='uncertain'?<p className="mt-4 text-sm text-ink-secondary">The model found no region to highlight.</p>:<p className="mt-4 text-sm text-ink-secondary">{localizationMessage(result)}</p>}
    <p className="mt-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">Highlights mark areas to review. The model can miss edits or highlight original content.</p>
  </section>;
}

function CandidatePreview({scanId,result,explore=false}){
  const [preview,setPreview]=useState({url:'',failed:false}),[show,setShow]=useState(false),[opened,setOpened]=useState(false);
  const cells=(explore?result.score_grid:result.mask)||[];
  const uncertain=result.status==='uncertain';
  const hasMap=cells.length>0;
  const viewLabel=explore?'Heatmap':'Highlights';
  const openPreview=()=>{setOpened(true);setShow(true);};
  useEffect(()=>{
    const controller=new AbortController();let active=true,url;
    setPreview({url:'',failed:false});
    const timeout=setTimeout(()=>controller.abort(),20000);
    (hasMap?fetchLocalizationImage:fetchScanImage)(scanId,controller.signal).then(blob=>{
      if(!active)return;url=URL.createObjectURL(blob);setPreview({url,failed:false});
    }).catch(()=>{if(active)setPreview({url:'',failed:true});}).finally(()=>clearTimeout(timeout));
    return ()=>{active=false;clearTimeout(timeout);controller.abort();if(url)URL.revokeObjectURL(url);};
  },[scanId,hasMap]);
  const previewContent=<>
    <p role="note" className="mt-4 text-sm leading-relaxed text-ink-secondary">Compare the original image with the pink overlay. Pink shows this model’s output, not confirmed edits. This is separate from the classification heatmap (Grad-CAM).</p>
    <div className="mt-4 rounded-2xl border border-line bg-canvas p-3">
      {preview.failed?<p role="alert">Original image unavailable; no aligned overlay can be displayed.</p>:!preview.url?<p role="status">Loading localization preview…</p>:
        <svg role="img" aria-label={explore?'Unvalidated localization score preview, not Grad-CAM':'Experimental candidate edited-region grid, not Grad-CAM'} viewBox={`0 0 ${result.image_width} ${result.image_height}`} className="w-full max-h-[440px]" style={{aspectRatio:`${result.image_width}/${result.image_height}`}}>
          <image href={preview.url} width={result.image_width} height={result.image_height} preserveAspectRatio="none" onError={()=>setPreview({url:'',failed:true})}/>
          {show&&cells.map((cell,index)=>explore||cell===1?<rect key={index} x={(index%32)*result.image_width/32} y={Math.floor(index/32)*result.image_height/32} width={result.image_width/32} height={result.image_height/32} fill="#be0065" fillOpacity={explore ? .65*cell/result.score_scale : .4}/>:null)}
        </svg>}
    </div>
    {!opened?<button type="button" onClick={openPreview} disabled={!preview.url||preview.failed} className="mt-4 min-h-11 w-full rounded-xl border border-accent px-4 py-3 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">{explore?'View unverified heatmap':'View unverified highlights'}</button>:
      <div role="group" aria-label="Compare localization views" className="mt-4 flex w-fit max-w-full gap-1 rounded-xl border border-line bg-canvas p-1">
        {[{name:'Original',value:false},{name:viewLabel,value:true}].map(option=><button key={option.name} type="button" aria-pressed={show===option.value} onClick={()=>setShow(option.value)} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${show===option.value?'bg-action text-on-action shadow-sm':'text-ink-secondary hover:bg-surface'}`}>{option.name}</button>)}
      </div>}
    <div aria-live="polite" className="mt-3 text-sm leading-relaxed text-ink-secondary">
      {show&&explore?<div aria-label="Localization heatmap legend">
        <div className="h-3 rounded-full border border-danger" style={{background:'linear-gradient(to right, rgba(190,0,101,0), rgba(190,0,101,0.65))'}}/>
        <div className="mt-1 flex justify-between text-xs"><span>Lower score</span><span>Higher score</span></div>
        <p className="mt-2">Darker pink means the model gave that area a higher score. It does not confirm an edit or tell you how likely an edit is. Areas without pink may still be edited.</p>
      </div>:<p>{show?'Pink shows areas suggested by the model. These are not confirmed edits, and edits may be missed elsewhere.':'Original image — no overlay shown.'}</p>}
    </div>
  </>;
  if(!uncertain)return previewContent;
  return <>
    {hasMap&&<details className="mt-5 border-t border-line pt-4">
      <summary className="cursor-pointer rounded font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">Explore experimental preview</summary>
      {previewContent}
    </details>}
  </>;
}

function LocalizationContent({scan}){
  let result;
  try{result=scan.localization?normalizeLocalization(scan.localization):unavailableLocalization('not_recorded');}
  catch{result=unavailableLocalization('invalid_response');}
  if(scan.status!=='completed')result=unavailableLocalization('analysis_failed');
  if(result.model_version===MESORCH_LOCALIZER_MODEL)return <MesorchPanel scan={scan} result={result}/>;
  const hasPreview=Boolean(result.score_grid||result.status==='available'||result.status==='uncertain');
  const label=result.status==='available'?'Unconfirmed suggestions':result.status==='uncertain'?'Inconclusive':'Not available';
  return <section aria-labelledby="localization-title" className="bg-surface rounded-3xl border border-line shadow-sm p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="localization-title" className="font-bold text-lg text-ink">Edited-area check</h2>
      <span className="rounded-full border border-control bg-canvas px-3 py-1 text-sm font-medium text-ink-secondary">{label}</span>
    </div>
    {hasPreview&&<div className="mt-4 space-y-2 text-sm leading-relaxed text-ink-secondary">
      <p className="text-base font-semibold text-ink">{result.status==='uncertain'?'We could not reliably identify an edited area.':'The model suggested areas, but no edits are confirmed.'}</p>
      <p>This check tries to locate edits within an image. It cannot confirm that the image is authentic or unedited, and it does not change your main scan result.</p>
    </div>}
    {result.usage_mode==='experimental'&&<div role="note" className="mt-4 rounded-xl border border-warning bg-warning-soft p-4 text-sm leading-relaxed text-warning">
      <p className="font-semibold">Experimental feature — not reliable for confirming edits</p>
      <p className="mt-1">This model failed validation. In testing, it missed many edited areas. Pink highlights can be wrong, so do not use them as evidence.</p>
    </div>}
    {hasPreview&&<p className="mt-4 text-sm leading-relaxed text-ink-secondary"><strong>What to do next:</strong> Check the image’s source and compare it with the original, if available. Do not decide whether it was edited from this preview alone.</p>}
    {hasPreview?<CandidatePreview key={`${scan.scan_id}:${result.status}`} scanId={scan.scan_id} result={result} explore={Boolean(result.score_grid)}/>:<>
      <p className="mt-4 text-sm leading-relaxed text-ink-secondary">{result.status==='uncertain'?'The model could not identify a reliable area to highlight. This does not mean the image is authentic.':localizationMessage(result)}</p>
    </>}
  </section>;
}

function CollapsedLocalization({scan}){
  const [expanded,setExpanded]=useState(false);
  return <details className="rounded-3xl border border-line bg-surface p-6 shadow-sm" onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary className="cursor-pointer rounded text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">View suspected edit regions</summary>
    {expanded&&<div className="mt-4"><LocalizationContent scan={scan}/></div>}
  </details>;
}

export default function LocalizationPanel({scan,layout}){
  const workspace=layout==='workspace';
  const panelClass=workspace?'min-w-0':'bg-surface rounded-3xl border border-line shadow-sm p-6';
  if(scan.status==='completed'&&originalImageOnly(scan.analysis))return <section className={panelClass}>
    <h2 className="font-bold text-lg text-ink">Suspected edit regions</h2>
    <MesorchPreview key={scan.scan_id} scanId={scan.scan_id} fluid={workspace} originalOnly/>
  </section>;
  if(scan.analysis?.provider==='truthscan')return <section className={panelClass}>
    <h2 className="font-bold text-lg text-ink">Suspected edit regions</h2>
    <p className="mt-2 text-sm text-ink-secondary">Compare the original image with the supplied heatmap. Highlights are areas for review and do not establish exact edited boundaries.</p>
    {scan.localization?.status==='available'?<MesorchPreview key={scan.scan_id} scanId={scan.scan_id} fluid={workspace}/>:<p className="mt-4 text-sm text-ink-secondary">No provider heatmap is available for this saved result.</p>}
  </section>;
  const verdict=scan.analysis?.verdict;
  if(verdict==='uncertain')return <CollapsedLocalization key={`${scan.scan_id}:${verdict}`} scan={scan}/>;
  return <LocalizationContent scan={scan}/>;
}
