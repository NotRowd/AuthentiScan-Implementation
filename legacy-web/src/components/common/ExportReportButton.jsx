import React, { useEffect, useRef, useState } from 'react';
import { fetchScanReport } from '../../services/api';

export default function ExportReportButton({ scanId }) {
  const active = useRef(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [failed,setFailed] = useState(false);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, [scanId]);
  async function exportReport() {
    if(active.current) return;
    const controller = new AbortController(); active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setMessage(''); setFailed(false);
    try {
      const blob = await fetchScanReport(scanId,controller.signal);
      if(active.current !== controller || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href=url; link.download=`AuthentiScan-scan-${scanId}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),60000);
      setMessage('PDF download started. Check your browser downloads.');
    } catch(error) {
      if(active.current === controller) {
        setFailed(true);
        setMessage(controller.signal.aborted ? 'Export timed out. No scan credit was used. Try again.' : error.message || 'Export failed. Please try again.');
      }
    } finally {
      clearTimeout(timeout);
      if(active.current === controller) { active.current=null; setBusy(false); }
    }
  }
  return <div className="space-y-2">
    <button type="button" disabled={busy} onClick={exportReport} aria-label={`Export PDF for scan ${scanId}`} className="px-3 py-2 rounded-lg border border-brand-500/40 text-brand-300 hover:bg-brand-500/10 disabled:opacity-50 whitespace-nowrap text-xs">
      {busy ? 'Preparing PDF…' : 'Export PDF'}
    </button>
    {message && <p role={failed ? 'alert' : 'status'} className={`text-xs max-w-56 ${failed ? 'text-rose-300' : 'text-slate-300'}`}>{message}</p>}
  </div>;
}
