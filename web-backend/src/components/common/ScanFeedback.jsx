import {useEffect,useRef,useState} from 'react';
import {fetchScanFeedback,saveScanFeedback} from '../../services/api';
import {Star} from 'lucide-react';
import './ScanFeedback.css';

const labels=['Not helpful','Slightly helpful','Somewhat helpful','Helpful','Very helpful'];
export default function ScanFeedback({scanId}){
  return <FeedbackForm key={scanId} scanId={scanId} />;
}
function FeedbackForm({scanId}){
  const [rating,setRating]=useState(0),[comment,setComment]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[loadFailed,setLoadFailed]=useState(false);
  const submitting=useRef(false),request=useRef(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setLoadFailed(false);setError('');
    fetchScanFeedback(scanId,controller.signal).then(({data})=>{if(!controller.signal.aborted)setSaved(data||null);})
      .catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoadFailed(true);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[scanId,attempt]);
  async function save(e){
    e.preventDefault();if(submitting.current||saved||loading||loadFailed||!rating)return;
    submitting.current=true;setBusy(true);setError('');
    const controller=new AbortController();request.current=controller;
    try{
      const {data}=await saveScanFeedback(scanId,{rating,comment},controller.signal);
      if(!controller.signal.aborted)setSaved(data);
    }catch(e){
      if(controller.signal.aborted)return;
      // A timeout or another client may have submitted successfully. Load the stored response.
      try{
        const {data}=await fetchScanFeedback(scanId,controller.signal);
        if(!controller.signal.aborted){if(data)setSaved(data);else setError(e.message);}
      }catch{
        if(!controller.signal.aborted){setLoadFailed(true);setError('We could not confirm whether your feedback was saved. Retry loading before submitting again.');}
      }
    }finally{submitting.current=false;if(!controller.signal.aborted)setBusy(false);}
  }
  return <section className="scan-feedback" aria-label="Scan feedback">
    <div><h2>Was this report helpful?</h2><p className="scan-feedback-intro">Rate how useful and clear the report was, not whether the AI prediction was correct.</p></div>
    {loading?<p role="status" className="scan-feedback-loading">Loading your feedback…</p>:saved?<div className="scan-feedback-saved">
      <p role="status" className="scan-feedback-thanks">Thank you! Your feedback has been submitted.</p>
      <p className="scan-feedback-saved-rating"><span aria-hidden="true">{'★'.repeat(saved.rating)}{'☆'.repeat(5-saved.rating)}</span> <span>{saved.rating}/5 · {labels[saved.rating-1]}</span></p>
      {saved.comment&&<div className="scan-feedback-saved-comment"><p>Your comment</p><p>{saved.comment}</p></div>}
      <p className="scan-feedback-once">One feedback submission per report. This response cannot be edited or submitted again.</p>
    </div>:<form onSubmit={save} className="scan-feedback-form" aria-label="Report feedback" aria-busy={busy}>
      <fieldset disabled={busy||loadFailed}><legend>Rating (required)</legend><div className="scan-feedback-stars">{labels.map((label,index)=>{const value=index+1;return <label key={value} className="scan-feedback-choice">
        <input className="sr-only" type="radio" name={'rating-'+scanId} value={value} checked={rating===value} onChange={()=>setRating(value)} required aria-label={value+' star'+(value===1?'':'s')} aria-describedby={'rating-label-'+scanId+'-'+value}/>
        <span className={'scan-feedback-star '+(rating>=value?'is-filled ':'')+(rating===value?'is-selected':'')}><Star size={28} strokeWidth={1.4} fill="currentColor" aria-hidden="true"/></span>
      </label>;})}</div></fieldset>
      <p role="status" className="scan-feedback-selected" aria-live="polite">{rating?`${rating}/5 · ${labels[rating-1]}`:'Choose a rating to enable Submit feedback.'}</p>
      <ol className="scan-feedback-meanings">{labels.map((label,index)=><li key={label} id={'rating-label-'+scanId+'-'+(index+1)}><span>{index+1}</span> {label}</li>)}</ol>
      <div className="scan-feedback-comment"><label htmlFor={'feedback-comment-'+scanId}>Comment (optional)</label><textarea id={'feedback-comment-'+scanId} name="comment" autoComplete="off" value={comment} disabled={busy||loadFailed} onChange={e=>setComment(e.target.value)} maxLength={500} rows={3} aria-describedby={'feedback-comment-help-'+scanId} placeholder="What was helpful, or what could be clearer?…"/><p id={'feedback-comment-help-'+scanId} className="scan-feedback-comment-help"><span>Please do not include private information.</span><span>{comment.length}/500 characters</span></p></div>
      <div className="scan-feedback-submit"><p>You can submit once per report. Please review your feedback before sending.</p><button className="btn btn-primary" type="submit" disabled={busy||loadFailed||!rating}>{busy?'Submitting…':'Submit feedback'}</button></div>
    </form>}
    {error&&<p role="alert" className="scan-feedback-error">{error}</p>}{loadFailed&&<button type="button" className="btn scan-feedback-retry" onClick={()=>setAttempt(x=>x+1)}>Retry feedback</button>}
    <p className="scan-feedback-privacy">Private to your account. Feedback does not train the AI or change your result or scan credits. Deleting this scan also deletes its feedback.</p>
  </section>;
}
