import React, { useEffect, useRef, useState } from 'react';
import { fetchSystemReadiness } from '../../services/api';

export default function SystemReadiness() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const active = useRef(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  async function check() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    setChecking(true); setError(''); setResult(null);
    try {
      const response = await fetchSystemReadiness(controller.signal);
      if (!response?.data || response.data.backend !== 'online' ||
          !['ready', 'not_ready', 'unavailable'].includes(response.data.ai)) throw new Error('Invalid health response');
      if (active.current === controller) setResult(response.data);
    } catch {
      if (active.current === controller) setError('Could not confirm backend availability. Check the backend terminal, network connection, and your login, then retry.');
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) { active.current = null; setChecking(false); }
    }
  }
  return <section aria-labelledby="readiness-title" className="bg-canvas rounded-xl p-5 border border-line space-y-3">
    <div className="flex flex-wrap justify-between items-center gap-3">
      <h2 id="readiness-title" className="font-semibold text-ink">System readiness</h2>
      <button type="button" disabled={checking} onClick={check} className="theme-action px-4 py-2 rounded-xl bg-action text-on-action text-sm disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line">
        {checking ? 'Checking…' : 'Check system readiness'}
      </button>
    </div>
    <div role="status" aria-live="polite" className="text-sm text-ink-secondary space-y-2">
      {checking ? <p>Checking backend and AI model…</p> : error ? <p className="text-warning">{error}</p> : result ? <>
        <p>Backend: <strong className="text-success">Online</strong></p>
        <p>AI model: <strong className={result.ai === 'ready' ? 'text-success' : 'text-warning'}>{result.ai === 'ready' ? 'Ready' : result.ai === 'not_ready' ? 'Not ready' : 'Unavailable'}</strong></p>
        <p>Object detector: <strong className={result.objects==='ready'?'text-success':'text-warning'}>{result.objects==='ready'?'Ready':'Unavailable (optional)'}</strong></p>
        {result.objects!=='ready'&&<p className="text-xs">Classification can still run. Saved scans can request object context later without another scan credit.</p>}
        {result.ai !== 'ready' && <p>Check the AI service terminal and model loading before scanning. Saved results may still be available.</p>}
        <p className="text-xs text-ink-secondary">Checked at {new Date(result.checked_at).toLocaleTimeString()}. Run again after restarting a service.</p>
      </> : <p>Not checked yet. Check the services before your demonstration.</p>}
    </div>
    <p className="text-xs text-ink-secondary">Read-only snapshot; no upload or scan allowance is used. This checks backend-to-AI connectivity, not database health, model accuracy, or phone access to heatmap images.</p>
  </section>;
}

