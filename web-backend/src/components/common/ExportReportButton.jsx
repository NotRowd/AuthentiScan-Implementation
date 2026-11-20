import React, { useEffect, useRef, useState } from 'react';
import { fetchScanReport } from '../../services/api';

export default function ExportReportButton({ scanId, scanNumber }) {
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
      link.href=url; link.download=`AuthentiScan-scan-${scanNumber||scanId}.pdf`;
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
    <button type="button" disabled={busy} onClick={exportReport} aria-label={scanNumber?`Export PDF for scan ${scanNumber}`:'Export scan PDF'} className="px-3 py-2 rounded-lg border border-line text-accent bg-accent-soft hover:bg-accent-soft disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line whitespace-nowrap text-xs">
      {busy ? 'Preparing PDF…' : 'Export PDF'}
    </button>
    {message && <p role={failed ? 'alert' : 'status'} className={`text-xs max-w-56 ${failed ? 'text-danger' : 'text-ink-secondary'}`}>{message}</p>}
  </div>;
}

