import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, FileText, CheckCircle2, AlertTriangle, Layers, Info, Image as ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatusBadge from '../components/common/StatusBadge';
import ExportReportButton from '../components/common/ExportReportButton';
import ScanCreditNotice from '../components/common/ScanCreditNotice';
import ProtectedHeatmap from '../components/common/ProtectedHeatmap';
import AnalysisExplanation from '../components/common/AnalysisExplanation';
import { scorePresentation } from '../utils/analysisPresentation';
import { fetchScanDetails, fetchScanImage } from '../services/api';

const percent = value => typeof value === 'number' && Number.isFinite(value) ? (value * 100).toFixed(2) + '%' : 'Not available';
const date = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString() : 'Not available';

const fadeIn = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

function MediaPreview({ src, title, unavailable }) {
  const [state, setState] = useState('loading');
  useEffect(() => {
    if (!src || state !== 'loading') return;
    const timeout = setTimeout(() => setState('failed'), 20000);
    return () => clearTimeout(timeout);
  }, [src, state]);
  
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col h-full">
      <h2 className="font-bold text-lg text-slate-900 mb-4">{title}</h2>
      <div className="rounded-2xl bg-slate-50 border border-slate-100 flex-1 min-h-[300px] flex flex-col items-center justify-center relative overflow-hidden group">
        {!src || state === 'failed' ? (
          <div className="p-8 text-center text-slate-500">
            <ImageIcon className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-medium max-w-[250px]">{unavailable}</p>
          </div>
        ) : (
          <>
            {state === 'loading' && (
              <div className="absolute flex flex-col items-center justify-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                <p className="text-sm font-bold">Loading image...</p>
              </div>
            )}
            <img 
              src={src} 
              alt={title} 
              referrerPolicy="no-referrer" 
              onLoad={() => setState('ready')} 
              onError={() => setState('failed')} 
              className={`w-full h-80 sm:h-96 object-contain p-2 ${state === 'loading' ? 'invisible' : 'group-hover:scale-105 transition-transform duration-500'}`} 
            />
          </>
        )}
      </div>
    </div>
  );
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
  
  return <MediaPreview src={src} title="Original Image" unavailable={src || failed ? 'Original image unavailable. Use Refresh result to try again.' : 'Loading original image...'} />;
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

  if (state.loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20">
        <RefreshCw className="w-10 h-10 text-sky-500 animate-spin mb-4" />
        <p className="text-lg font-bold text-slate-700">Loading analysis results...</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div role="alert" className="p-6 rounded-2xl border border-rose-200 bg-rose-50 flex flex-col items-center text-center max-w-lg mx-auto mt-10">
        <AlertTriangle className="w-12 h-12 text-rose-400 mb-4" />
        <p className="font-bold text-rose-700 text-lg">{state.error}</p>
        <p className="text-sm font-medium text-rose-500 mt-2">Check that you are signed in to the account that owns this scan.</p>
        <button onClick={onRetry} className="mt-6 px-6 py-2 bg-white text-rose-600 font-bold rounded-xl border border-rose-200 hover:bg-rose-100 transition-colors">Try Again</button>
      </div>
    );
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-8">
      
      {/* Header Area */}
      <motion.div variants={fadeIn} className="flex flex-col md:flex-row md:items-end justify-between gap-5 bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-sky-100/50 to-transparent rounded-full -mr-20 -mt-20 blur-2xl pointer-events-none"></div>
        <div className="relative z-10 min-w-0">
          <p className="text-xs font-bold text-sky-500 uppercase tracking-[0.15em] mb-2">Saved Analysis</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight break-all">{scan ? scan.original_file_name : 'Scan details'}</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">Scan #{scan.scan_id} &bull; Analyzed on {date(scan.created_at)}</p>
        </div>
        <div className="relative z-10 flex flex-wrap items-center gap-3 shrink-0">
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <ExportReportButton scanId={scan.scan_id} />
        </div>
      </motion.div>

      {/* Main Verdict & Scores */}
      <motion.section variants={fadeIn} className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-slate-100 pb-8">
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-4">Overall Verdict</h2>
            <StatusBadge status={result?.verdict || scan.status} />
          </div>
          <div className="max-w-md text-sm font-medium text-slate-500 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            {result?.verdict === 'uncertain' ? 'No clear class was selected by the AI.' : 'The selected class follows the model’s decision policy, which may use a threshold other than 50%.'}
            {' '}Class scores are estimates, not absolute proof.
          </div>
        </div>

        {result ? (
          <div className="grid sm:grid-cols-3 gap-6">
            {[[scorePresentation(result).label, scorePresentation(result).value], ['Authentic Score', result.authentic_score], ['AI-generated Score', result.ai_generated_score]].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-6 flex flex-col justify-center items-center text-center hover:shadow-md hover:border-sky-200 transition-all">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
                <p className="text-3xl font-extrabold text-slate-900 mt-2">{percent(value)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center font-medium text-slate-500 bg-slate-50 p-6 rounded-2xl border border-slate-100">
            {scan.status === 'failed' ? 'Analysis failed. This image is saved, but no prediction is available.' : 'This image is saved, but no prediction is available yet. Refresh to check its status.'}
          </p>
        )}
        <div className="mt-6"><ScanCreditNotice scan={scan} /></div>
      </motion.section>

      {/* Image & Grad-CAM Visuals */}
      <motion.div variants={fadeIn} className="grid lg:grid-cols-2 gap-8">
        <OriginalImage scanId={scan.scan_id} />
        
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-bold text-lg text-slate-900">Explainable AI / Heatmap</h2>
            <div className="group relative cursor-help">
              <Info className="w-4 h-4 text-sky-400" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                Grad-CAM highlights the specific areas of the image that caused the AI to make its prediction.
              </div>
            </div>
          </div>
          
          <div className="rounded-2xl bg-slate-50 border border-slate-100 flex-1 min-h-[300px] flex flex-col items-center justify-center overflow-hidden mb-4 p-2">
             <ProtectedHeatmap scanId={scan.scan_id} available={Boolean(result?.heatmap_url)} className="w-full h-80 sm:h-96 object-contain hover:scale-105 transition-transform duration-500" />
          </div>
          
          {result && (
            <div className="bg-sky-50 border border-sky-100 p-4 rounded-xl">
               <AnalysisExplanation result={result}/>
            </div>
          )}
        </div>
      </motion.div>

      {/* Technical Record & Info */}
      <motion.div variants={fadeIn} className="grid md:grid-cols-2 gap-8">
        <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h2 className="font-bold text-lg text-slate-900 mb-6 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-400" /> Technical Record
          </h2>
          <dl className="grid sm:grid-cols-2 gap-6 text-sm">
            {[['Model Version', result?.model_version || 'Not available'], ['Analyzed At', date(result?.analyzed_at)], ['File Format', scan.mime_type || 'Not available'], ['File Size', Number.isFinite(scan.file_size_bytes) ? (scan.file_size_bytes / 1024).toFixed(1) + ' KB' : 'Not available']].map(([label, value]) => (
              <div key={label}>
                <dt className="text-slate-500 font-medium text-xs mb-1 uppercase tracking-wider">{label}</dt>
                <dd className="font-bold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          {result?.policy_version && (
            <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-medium text-slate-400 leading-relaxed">
              Policy: {result.policy_version} &bull; Authentic threshold: {result.decision_threshold} &bull; Margin: {result.uncertainty_margin} &bull; Preprocessing: {result.preprocessing_version}
            </div>
          )}
        </section>

        <aside className="rounded-3xl border border-sky-200 bg-sky-50 p-6 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-sky-600" />
            </div>
            <h2 className="font-bold text-sky-900">How to read this result</h2>
          </div>
          <p className="text-sm leading-relaxed text-sky-800/80 font-medium">
            Predictions are estimates, not absolute proof of authenticity or manipulation. A class score is not overall model accuracy. The Grad-CAM heatmap explains what the AI focused on for a specific class, not proven edited areas. Object detection is not currently included.
          </p>
        </aside>
      </motion.div>
      
    </motion.div>
  );
}

export default function ScanDetailsPage() {
  const { scanId } = useParams();
  const [attempt, setAttempt] = useState(0);
  
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-sky-600 hover:bg-sky-50 px-3 py-1.5 rounded-lg transition-colors mb-6 -ml-3">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>
        <SavedResult key={scanId + ':' + attempt} scanId={scanId} onRetry={() => setAttempt(value => value + 1)} />
      </div>
    </DashboardLayout>
  );
}
