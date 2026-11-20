import {useEffect,useRef,useState} from 'react';
import {deleteScan} from '../../services/api';
import {scanNumber} from '../../utils/scanNumber';

export default function DeleteScanDialog({scan,onCancel,onDeleted}) {
  const dialog=useRef(null),active=useRef(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const node=dialog.current;
    node.showModal();
    return ()=>{active.current?.abort();active.current=null;node.close();};
  },[]);
  async function confirm(){
    if(active.current)return;
    const controller=new AbortController();active.current=controller;
    setBusy(true);setError('');
    try{
      await deleteScan(scan.scan_id,controller.signal);
      if(active.current===controller)onDeleted(scan);
    }catch(failure){
      if(active.current!==controller)return;
      if(failure.status===404){onDeleted(scan);return;}
      setError(failure.message||'Could not confirm deletion. Refresh History or retry.');
    }finally{
      if(active.current===controller){active.current=null;setBusy(false);}
    }
  }
  return <dialog ref={dialog} aria-labelledby="delete-title" aria-describedby="delete-warning" onCancel={event=>{event.preventDefault();if(!active.current)onCancel();}}
    className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-overlay/50">
    <h2 id="delete-title" className="text-xl font-bold">Delete Scan {scanNumber(scan)} permanently?</h2>
    <p className="mt-3 text-sm font-semibold break-all">{scan.original_file_name}</p>
    <p id="delete-warning" className="mt-3 text-sm leading-relaxed">This removes the saved scan, its original image, and its stored Grad-CAM image from this app. There is no undo. Used scan credits will not be restored.</p>
    <p className="mt-2 text-xs text-ink-secondary">Copies you already downloaded or shared are not removed.</p>
    {error&&<p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
    {busy&&<p role="status" className="mt-4 text-sm">Removing stored files and scan record… Please keep this page open.</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button autoFocus type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-control px-4 py-2 font-semibold disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line">Cancel</button>
      <button type="button" disabled={busy} onClick={confirm} className="rounded-xl bg-danger px-4 py-2 font-semibold text-on-action hover:bg-danger disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line">{busy?'Deleting…':'Delete permanently'}</button>
    </div>
  </dialog>;
}
