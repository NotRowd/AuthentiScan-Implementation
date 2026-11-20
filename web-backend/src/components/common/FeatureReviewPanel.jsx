import {useEffect,useRef,useState} from 'react';
import {reviewScanFeatures} from '../../services/api';
import {FEATURE_LABELS,FEATURE_NOTE,normalizeFeatureReview,isCurrentFeatureReview} from '../../../shared/feature-review-contract.mjs';
import {visualErrorMessage} from '../../../shared/visual-review-errors.mjs';
import {visualReviewParagraph,REVIEW_FAILED} from '../../../shared/visual-review-paragraph.mjs';

export default function FeatureReviewPanel(props){
  if(props.scan.analysis?.provider==='truthscan'){
    const review=props.scan.provider_review;
    return <div className="mt-4 text-sm leading-relaxed text-ink-secondary">
      <p>{review?.text||'No written provider analysis is available for this saved result.'}</p>
      {review?.indicators?.length>0&&<details className="mt-5 overflow-hidden rounded-2xl border border-line bg-canvas">
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-ink-secondary">View analysis indicators</summary>
        <ul className="space-y-2 border-t border-line p-3">{review.indicators.map((item,index)=><li key={index} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-sm leading-relaxed">
          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">{index+1}</span><span className="min-w-0 [overflow-wrap:anywhere]">{item}</span>
        </li>)}</ul>
      </details>}
      <p className="mt-3 text-xs text-ink-muted">Automated visual analysis. Observations may be incorrect.</p>
    </div>;
  }
  return <LocalFeatureReviewPanel {...props}/>;
}

function LocalFeatureReviewPanel({scan,autoStart=false}){
  const [review,setReview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const active=useRef(null),attempted=useRef(false);
  useEffect(()=>{
    active.current?.abort();active.current=null;attempted.current=false;setBusy(false);setError('');
    let saved=null;try{if(scan.feature_review)saved=normalizeFeatureReview(scan.feature_review);}catch{}
    setReview(saved);
    if(!isCurrentFeatureReview(saved)&&scan.upload_review?.features==='unavailable')setError(scan.upload_review.features_error?visualErrorMessage(scan.upload_review.features_error):'Visual review was unavailable during processing. Your classification is saved. You can retry without using another scan credit.');
    return ()=>{active.current?.abort();active.current=null;};
  },[scan.scan_id,scan.feature_review,scan.upload_review]);
  async function run(){
    if(active.current)return;
    attempted.current=true;
    const controller=new AbortController();active.current=controller;setBusy(true);setError('');
    try{const response=await reviewScanFeatures(scan.scan_id,controller.signal);if(active.current===controller)setReview(normalizeFeatureReview(response.data));}
    catch(e){if(active.current===controller)setError(e.message||'Visual review is unavailable.');}
    finally{if(active.current===controller){active.current=null;setBusy(false);}}
  }
  useEffect(()=>{
    if(scan.status!=='completed'||scan.upload_review||!autoStart||isCurrentFeatureReview(review)||attempted.current)return;
    const timer=setTimeout(run,250);return ()=>clearTimeout(timer);
  },[scan.scan_id,scan.status,scan.upload_review,autoStart,review]);
  if(scan.status!=='completed')return null;
  const current=isCurrentFeatureReview(review);
  const concerns=current?review.findings.filter(item=>item.status==='possible_concern'):[];
  const uncertain=current&&!concerns.length&&(review.findings.every(item=>item.status==='unable_to_assess')||
    review.findings.some(item=>item.status==='unable_to_assess'&&/^(This finding was withheld|This check is inconclusive)/.test(item.observation||'')));
  return <section aria-labelledby="features-title" className="mt-5 border-t border-line pt-4">
    <h3 id="features-title" className="sr-only">Visual anomaly review</h3>
    <p className="mt-2 text-sm text-ink-secondary">AI looks for unusual details and explains them in simple words. It may miss details or make mistakes. This review is separate from the classification.</p>
    {!current&&!busy&&!error&&<div className="mt-3 text-sm text-ink-secondary"><p>{review?'This saved review predates the updated anomaly check.':'The visual anomaly check has not completed for this image.'}</p><button type="button" onClick={run} className="theme-action mt-3 rounded-xl bg-action px-4 py-3 font-semibold text-on-action">{review?'Run updated visual check':'Check unusual details'}</button><p className="mt-2 text-xs text-ink-muted">No additional scan credit is used.</p></div>}
    {busy&&<p role="status" className="mt-3 text-sm text-ink-secondary">Checking the image’s details… This may take a few minutes. No extra scan credit is used.</p>}
    {error&&<div className="mt-3"><p role="alert" className="text-sm text-warning">{REVIEW_FAILED}</p><p className="mt-2 text-xs text-ink-secondary">{error}</p><button type="button" onClick={run} disabled={busy} className="mt-2 rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent">Retry visual review</button></div>}
    {current&&<>
      <p className="mt-3 text-sm font-semibold text-ink-secondary" data-testid="visual-review-state">{concerns.length?'Possible unusual details':uncertain?'Review uncertain':'No clear unusual details'}</p>
      <div className={`mt-3 rounded-xl border p-4 text-sm ${concerns.length?'border-warning bg-warning-soft text-warning':'border-line bg-canvas text-ink-secondary'}`}>
        <p role="status" className="break-words leading-relaxed" data-testid="visual-review-paragraph">{visualReviewParagraph(review,scan.scene_analysis)}</p>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{concerns.length?'AI observation — not verified. The model may misread details.':'The visual check does not change the classification.'}</p>
      <details className="mt-3 text-sm text-ink-secondary"><summary className="cursor-pointer py-1">View all five feature checks</summary>
        <dl className="mt-3 space-y-3">{review.findings.map(item=><div key={item.category}><dt className="font-semibold">{FEATURE_LABELS[item.category]} · {item.status==='possible_concern'?'Tentative observation (unverified)':item.status==='no_clear_concern'?'No clear concern reported':'Unable to assess'}</dt><dd className="mt-1 break-words">{item.observation}</dd></div>)}</dl>
        <p className="mt-4 text-xs break-words">{FEATURE_NOTE}</p>
        <p className="mt-2 text-xs break-words">Model: {review.model_version} · Review: {review.review_version} · Accuracy not validated.</p>
      </details>
    </>}
  </section>;
}
