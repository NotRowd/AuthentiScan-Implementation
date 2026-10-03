import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Scan, AlertTriangle, Clock, Plus, RefreshCw, ArrowUpRight, Image } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatusBadge from '../components/common/StatusBadge';
import SystemReadiness from '../components/common/SystemReadiness';
import { fetchUserStats, fetchUserScans, getStoredUser,isCloudMode,usesCloudMedia } from '../services/api';

export default function DashboardPage() {
  const [state, setState] = useState({ loading: true, error: '', stats: null, scans: [] });
  const [refresh, setRefresh] = useState(0);
  const user = getStoredUser();
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 20000);
    Promise.all([fetchUserStats(controller.signal), fetchUserScans({ limit: 5, signal: controller.signal })])
      .then(([statsResponse, scansResponse]) => {
        if (active) setState({ loading: false, error: '', stats: statsResponse.data, scans: scansResponse.data?.scans || [] });
      }).catch(error => {
        if (active) setState({ loading: false, error: error.name === 'AbortError' ? 'The dashboard took too long to load. Check your connection and refresh.' : error.message || 'Dashboard unavailable. Please try again.', stats: null, scans: [] });
      }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [refresh]);
  const stats = state.stats;
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === 'visible') setRefresh(value => value + 1);
    };
    const resetDelay = Date.parse(stats?.allowance_resets_at) - Date.parse(stats?.server_now);
    const timer = Number.isFinite(resetDelay) && resetDelay > 0
      ? setTimeout(reload, Math.min(resetDelay + 1000, 86401000)) : null;
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => { clearTimeout(timer); window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', reload); };
  }, [stats]);
  const metrics = [
    { title: 'Total scans', value: stats?.total_scans, note: 'Saved to your account', icon: Scan },
    { title: 'Scans remaining today', value: stats?.scans_remaining === null ? 'Unlimited' : stats?.scans_remaining, note: stats?.plan?.scan_limit != null ? `${stats.plan.scan_limit} scans per day · ${stats.plan.name} plan` : 'Current allowance', icon: Clock },
    { title: 'AI-generated', value: stats?.ai_generated_found, note: 'Model classifications', icon: AlertTriangle },
    { title: 'Queued scans', value: stats?.queued_scans, note: 'Awaiting analysis', icon: Clock },
  ];
  return <DashboardLayout><div className="space-y-8">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
      <div className="min-w-0"><p className="eyebrow mb-2">Your workspace</p><h1 className="section-heading break-words">Welcome back{user?.first_name ? ', ' + user.first_name : ''}.</h1><p className="text-sm text-slate-400 mt-2">Review your images, understand the results, and keep a record.</p></div>
      <Link to="/scan" className="button-primary shrink-0 self-start"><Plus className="w-4 h-4" />New image scan</Link>
    </div>
    {state.error && <div role="alert" className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 text-sm">{state.error}</div>}
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-busy={state.loading}>{metrics.map(({ title, value, note, icon: Icon }) => <section key={title} className="glass-panel p-5 rounded-xl"><div className="flex items-center justify-between gap-3 text-sm text-slate-300"><h2>{title}</h2><Icon className="w-4 h-4 text-brand-300 shrink-0" /></div><p className="text-3xl font-semibold tracking-tight mt-5 mb-2">{state.loading ? '—' : value ?? '—'}</p><p className="text-xs text-slate-400">{state.loading ? 'Loading…' : state.error ? 'Unavailable' : note}</p></section>)}</div>
    <div className="text-xs text-slate-400 space-y-2">
      {stats?.allowance_resets_at && <p>Next reset: {new Date(stats.allowance_resets_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} Philippine time. Unused scans do not carry over.</p>}
      <p>Total scans is your all-time history, including failures. Only today's completed and pending scans count toward today's allowance. Failed scans do not use credits.</p>
    </div>
    <section className="glass-panel rounded-xl overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold text-lg">Recent scans</h2><p className="text-xs text-slate-400 mt-1">Open a scan to review its result and export a report.</p></div><button type="button" className="button-secondary" disabled={state.loading} onClick={() => { setState(current => ({ ...current, loading: true, error: '' })); setRefresh(value => value + 1); }}><RefreshCw className={`w-4 h-4 ${state.loading ? 'animate-spin' : ''}`} />Refresh</button></div>
      {state.loading ? <p role="status" className="p-10 text-center text-sm text-slate-400">Loading your saved scans…</p> : state.error ? <p className="p-8 text-sm text-slate-400">Your saved scans could not be loaded. Use Refresh to try again.</p> : state.scans.length ? <ul className="divide-y divide-slate-800">{state.scans.map(scan => <li key={scan.scan_id}><Link to={`/scans/${scan.scan_id}`} className="flex flex-wrap sm:flex-nowrap items-center gap-4 p-5 sm:px-6 hover:bg-slate-800/40 transition-colors"><div className="rounded-xl p-3 bg-brand-500/10 text-brand-300 shrink-0"><Image className="w-5 h-5" /></div><div className="min-w-0 flex-1 basis-40"><p className="text-sm font-medium break-all">{scan.original_file_name}</p><p className="text-xs text-slate-400 mt-1">#{scan.scan_id} · {new Date(scan.created_at).toLocaleString()}</p></div><StatusBadge status={scan.analysis?.verdict || scan.status} /><ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" /></Link></li>)}</ul> : <div className="p-10 text-center"><Scan className="w-8 h-8 text-brand-300 mx-auto mb-4" /><h3 className="font-semibold mb-2">Your first scan starts here.</h3><p className="text-sm text-slate-400 mb-5">Choose an image to start building your analysis history.</p><Link className="button-primary" to="/scan">Scan an image</Link></div>}
      <div className="p-5 border-t border-slate-800 flex flex-wrap gap-3 justify-between"><p className="text-xs text-slate-400">{isCloudMode?(usesCloudMedia?'Cloud scan records and new images; older images remain on this PC.':'Cloud scan records; images stored on this PC.'):'Local Firebase history.'} Mobile uses the separate original system.</p><Link to="/history" className="text-sm text-brand-300 hover:text-white">View all history →</Link></div>
    </section>
    <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-5 flex flex-col sm:flex-row gap-4 justify-between"><div><h2 className="font-medium text-sm">An estimate, not a final verdict.</h2><p className="text-sm text-slate-400 mt-2 max-w-3xl">Review the original source alongside the scores. A Grad-CAM heatmap explains model focus; it does not prove manipulation.</p></div><a href="/#faq" className="text-sm text-brand-300 shrink-0 self-start hover:text-white">Learn about results ↗</a></div>
    <details className="rounded-xl border border-slate-800 p-5"><summary className="cursor-pointer text-sm font-medium text-slate-300">Connection tools</summary><p className="text-xs text-slate-400 my-4">Use this read-only check if analysis is unavailable. It does not run a scan.</p><SystemReadiness /></details>
  </div></DashboardLayout>;
}
