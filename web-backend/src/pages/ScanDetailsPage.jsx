import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatusBadge from '../components/common/StatusBadge';
import ExportReportButton from '../components/common/ExportReportButton';
import ScanCreditNotice from '../components/common/ScanCreditNotice';
import ProtectedHeatmap from '../components/common/ProtectedHeatmap';
import AnalysisExplanation from '../components/common/AnalysisExplanation';
import {scorePresentation} from '../utils/analysisPresentation';
import { fetchScanDetails, fetchScanImage } from '../services/api';

const percent = value => typeof value === 'number' && Number.isFinite(value) ? (value * 100).toFixed(2) + '%' : 'Not available';
const date = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString() : 'Not available';

function MediaPreview({ src, title, unavailable }) {
  const [state, setState] = useState('loading');
  useEffect(() => {
    if (!src || state !== 'loading') return;
    const timeout = setTimeout(() => setState('failed'), 20000);
    return () => clearTimeout(timeout);
  }, [src, state]);
  return <section className="glass-panel rounded-xl p-4 sm:p-5 min-w-0">
    <h2 className="font-semibold mb-4">{title}</h2>
    <div className="rounded-lg bg-slate-950 border border-slate-800 min-h-64 flex items-center justify-center relative overflow-hidden">
      {!src || state === 'failed' ? <p role="status" className="text-sm text-slate-400 text-center p-6">{unavailable}</p> : <>
        {state === 'loading' && <p role="status" className="absolute text-sm text-slate-400">Loading image…</p>}
        <img src={src} alt={title} referrerPolicy="no-referrer" onLoad={() => setState('ready')} onError={() => setState('failed')} className={`w-full h-80 sm:h-96 object-contain ${state === 'loading' ? 'invisible' : ''}`} />
      </>}
    </div>
  </section>;
}

function OriginalImage({ scanId }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let objectUrl;
    const timeout = setTimeout(() => controller.abort(), 20000);
    fetchScanImage(scanId, controller.signal).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => { if (active) setFailed(true); }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [scanId]);
  return <MediaPreview src={src} title="Original image" unavailable={src || failed ? 'Original image unavailable. Your saved result is unaffected. Use Refresh result to try again.' : 'Loading original image…'} />;
}

function SavedResult({ scanId, onRetry }) {
  const [state, setState] = useState({ loading: true, error: '', scan: null });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 20000);
    fetchScanDetails(scanId, controller.signal).then(response => {
      if (active) setState({ loading: false, error: '', scan: response.data });
    }).catch(error => {
      if (active) setState({ loading: false, error: error.name === 'AbortError' ? 'The request timed out. Check the connection and try again.' : error.message || 'This result could not be loaded.', scan: null });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [scanId]);
  const scan = state.scan;
  const result = scan?.analysis;
  return <div className="space-y-6">
    <div className="flex flex-wrap justify-between items-start gap-4"><div className="min-w-0"><p className="eyebrow mb-2">Saved analysis</p><h1 className="section-heading">Scan details</h1><p className="text-sm text-slate-400 mt-2 break-all">{scan ? scan.original_file_name : 'Review an existing scan without using your scan allowance.'}</p></div><button type="button" disabled={state.loading} onClick={onRetry} className="button-secondary"><RefreshCw className="w-4 h-4" />Refresh result</button></div>
    {state.loading ? <p role="status" className="glass-panel p-10 rounded-xl text-slate-400">Loading saved result…</p> : state.error ? <div role="alert" className="p-5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200"><p>{state.error}</p><p className="text-sm mt-2">Check that you are signed in to the account that owns this scan.</p></div> : <>
      <section className="glass-panel rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs text-slate-400 mb-3">Scan #{scan.scan_id} · {date(scan.created_at)}</p><StatusBadge status={result?.verdict || scan.status} /></div><ExportReportButton scanId={scan.scan_id} /></div>
        {result ? <><div className="grid sm:grid-cols-3 gap-4 mt-6">{[[scorePresentation(result).label, scorePresentation(result).value], ['Authentic score', result.authentic_score], ['AI-generated score', result.ai_generated_score]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><p className="text-xs text-slate-400">{label}</p><p className="text-2xl font-semibold mt-2">{percent(value)}</p></div>)}</div><p className="text-sm leading-relaxed text-slate-300 mt-5">Class scores are estimates, not calibrated probabilities or proof. {result.verdict==='uncertain'?'No class was selected.':'The selected class follows the model’s decision policy, which may use a threshold other than 50%.'}</p></> : <p className="text-sm text-slate-300 mt-5">{scan.status === 'failed' ? 'Analysis failed. This image is saved, but no prediction is available.' : 'This image is saved, but no prediction is available yet. Refresh to check its status; this does not start a new analysis.'}</p>}
        <ScanCreditNotice scan={scan} />
      </section>
      <div className="grid xl:grid-cols-2 gap-5">
        <OriginalImage scanId={scan.scan_id} />
        <section className="glass-panel rounded-xl p-4 sm:p-5 min-w-0"><h2 className="font-semibold mb-4">Grad-CAM heatmap</h2><ProtectedHeatmap scanId={scan.scan_id} available={Boolean(result?.heatmap_url)} />{result&&<AnalysisExplanation result={result}/>}</section>
      </div>
      <section className="glass-panel rounded-xl p-5 sm:p-6"><h2 className="font-semibold mb-4">Analysis record</h2><dl className="grid sm:grid-cols-2 gap-5 text-sm">{[['Model version', result?.model_version || 'Not available'], ['Analyzed at', date(result?.analyzed_at)], ['File type', scan.mime_type || 'Not available'], ['File size', Number.isFinite(scan.file_size_bytes) ? (scan.file_size_bytes / 1024).toFixed(1) + ' KB' : 'Not available']].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-400 text-xs mb-1">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl></section>
      {result?.policy_version&&<p className="text-xs text-slate-400 break-all">Policy: {result.policy_version} · Authentic decision threshold: {result.decision_threshold} · Uncertainty margin: {result.uncertainty_margin} · Preprocessing: {result.preprocessing_version}</p>}
      <aside className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-5 text-sm leading-relaxed text-slate-400"><h2 className="font-semibold text-slate-200 mb-2">How to read this result</h2>Predictions are estimates, not proof of authenticity or manipulation. A class score is not overall model accuracy. Grad-CAM explains a specified class, not proven edited areas. Object detection and manipulation segmentation are not included.</aside>
    </>}
  </div>;
}

export default function ScanDetailsPage() {
  const { scanId } = useParams();
  const [attempt, setAttempt] = useState(0);
  return <DashboardLayout><Link to="/history" className="inline-flex items-center gap-2 text-sm text-brand-300 hover:text-white mb-6"><ArrowLeft className="w-4 h-4" />Back to history</Link><SavedResult key={scanId + ':' + attempt} scanId={scanId} onRetry={() => setAttempt(value => value + 1)} /></DashboardLayout>;
}
