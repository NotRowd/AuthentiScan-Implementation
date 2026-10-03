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
  return <section aria-labelledby="readiness-title" className="glass-panel rounded-xl p-5 border border-slate-800 space-y-3">
    <div className="flex flex-wrap justify-between items-center gap-3">
      <h2 id="readiness-title" className="font-semibold text-white">System readiness</h2>
      <button type="button" disabled={checking} onClick={check} className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm disabled:opacity-50">
        {checking ? 'Checking…' : 'Check system readiness'}
      </button>
    </div>
    <div role="status" aria-live="polite" className="text-sm text-slate-300 space-y-2">
      {checking ? <p>Checking backend and AI model…</p> : error ? <p className="text-amber-300">{error}</p> : result ? <>
        <p>Backend: <strong className="text-emerald-300">Online</strong></p>
        <p>AI model: <strong className={result.ai === 'ready' ? 'text-emerald-300' : 'text-amber-300'}>{result.ai === 'ready' ? 'Ready' : result.ai === 'not_ready' ? 'Not ready' : 'Unavailable'}</strong></p>
        {result.ai !== 'ready' && <p>Check the AI service terminal and model loading before scanning. Saved results may still be available.</p>}
        <p className="text-xs text-slate-400">Checked at {new Date(result.checked_at).toLocaleTimeString()}. Run again after restarting a service.</p>
      </> : <p>Not checked yet. Check the services before your demonstration.</p>}
    </div>
    <p className="text-xs text-slate-400">Read-only snapshot; no upload or scan allowance is used. This checks backend-to-AI connectivity, not database health, model accuracy, or phone access to heatmap images.</p>
  </section>;
}
