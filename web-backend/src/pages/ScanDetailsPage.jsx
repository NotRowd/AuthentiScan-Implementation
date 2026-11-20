import { useEffect, useState } from 'react';

import { Link, useParams } from 'react-router-dom';

import { ArrowLeft, RefreshCw, AlertTriangle, ScanLine, MessageSquare } from 'lucide-react';

import { motion } from 'framer-motion';

import DashboardLayout from '../components/layout/DashboardLayout';

import StatusBadge from '../components/common/StatusBadge';

import ExportReportButton from '../components/common/ExportReportButton';

import ScanCreditNotice from '../components/common/ScanCreditNotice';

import LocalizationPanel from '../components/common/LocalizationPanel';

import SceneExplanationPanel, {ResultExplanation} from '../components/common/SceneExplanationPanel';

import ScanFeedback from '../components/common/ScanFeedback';

import ScanOriginalPreview from '../components/common/ScanOriginalPreview';

import ClassificationScores from '../components/common/ClassificationScores';

import { fetchScanDetails } from '../services/api';

import {scanNumber} from '../utils/scanNumber';





const fadeIn = {

  hidden: { opacity: 0, y: 15 },

  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }

};



const staggerContainer = {

  hidden: { opacity: 0 },

  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }

};



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

        <RefreshCw className="w-10 h-10 text-accent animate-spin mb-4" />

        <p className="text-lg font-bold text-ink-secondary">Loading analysis results...</p>

      </div>

    );

  }



  if (state.error) {

    return (

      <div role="alert" className="p-6 rounded-2xl border border-danger bg-danger-soft flex flex-col items-center text-center max-w-lg mx-auto mt-10">

        <AlertTriangle className="w-12 h-12 text-danger mb-4" />

        <p className="font-bold text-danger text-lg">{state.error}</p>

        <p className="text-sm font-medium text-danger mt-2">Check that you are signed in to the account that owns this scan.</p>

        <button onClick={onRetry} className="mt-6 px-6 py-2 bg-surface text-danger font-bold rounded-xl border border-danger hover:bg-danger-soft transition-colors">Try Again</button>

      </div>

    );

  }



  const completed=scan.status==='completed'&&Boolean(result);

  const authentic=completed&&result.verdict==='authentic';

  return (

    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-5 sm:space-y-6">

      <motion.header variants={fadeIn} className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">

        <div className="min-w-0">

          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-accent"><ScanLine aria-hidden="true" className="h-4 w-4"/>Saved analysis<span className="text-ink-muted">/</span><span className="tracking-normal text-ink-muted">Scan {scanNumber(scan)}</span></div>

          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Scan report</h1>

          <p className="mt-2 text-sm text-ink-muted">Your image, classification, and visual observations in one place.</p>

        </div>

        <div className="flex shrink-0 flex-wrap items-start gap-2 [&_button]:min-h-10 [&_button]:rounded-xl [&_button]:text-sm [&_button]:font-semibold">

          <button type="button" onClick={onRetry} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink-secondary transition hover:border-line hover:text-accent"><RefreshCw aria-hidden="true" className="h-4 w-4"/>Refresh</button>

          <ExportReportButton scanId={scan.scan_id} scanNumber={scan.scan_number}/>

        </div>

      </motion.header>



      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12" data-testid="result-bento-grid">

        <motion.div variants={fadeIn} className="min-w-0 xl:col-span-7"><ScanOriginalPreview key={scan.scan_id} scan={scan}/></motion.div>

        <motion.section variants={fadeIn} aria-labelledby="classification-title" className="relative min-w-0 overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-6 xl:col-span-5">

          <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${result?.verdict==='authentic'?'bg-success':result?.verdict==='ai_generated'?'bg-ai':'bg-warning'}`}/>

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">

            <h2 id="classification-title" className="text-lg font-bold text-ink">Image classification</h2>

            <span className="text-xs font-medium text-ink-muted">{completed?'Analysis complete':scan.status==='failed'?'Analysis failed':'Analysis pending'}</span>

          </div>

          <div className="mb-5 [&_.status-badge]:px-4 [&_.status-badge]:py-2 [&_.status-badge]:text-base [&_.status-badge]:font-bold"><StatusBadge status={result?.verdict||scan.status}/></div>

          {result?<ClassificationScores analysis={result}/>:<p className="rounded-2xl border border-line bg-canvas p-4 text-sm leading-relaxed text-ink-secondary">{scan.status==='failed'?'Analysis failed. This image is saved, but no prediction is available.':'Your image is saved. Refresh to check whether analysis has completed.'}</p>}

          <ResultExplanation scan={scan} inline/>

          <p className="mt-4 text-xs leading-relaxed text-ink-muted">AI estimate · Not proof of authenticity</p>

          <div className="mt-4 border-t border-line pt-1"><ScanCreditNotice scan={scan}/></div>

        </motion.section>

      </div>



      <div className={`grid grid-cols-1 items-start gap-5 ${authentic?'':'xl:grid-cols-12'}`}>

        {!authentic&&<motion.div variants={fadeIn} className="min-w-0 xl:col-span-7"><LocalizationPanel scan={scan}/></motion.div>}

        <motion.div variants={fadeIn} className={authentic?'min-w-0':'min-w-0 xl:col-span-5'}><SceneExplanationPanel scan={scan} observationsOnly/></motion.div>

      </div>

      <motion.div variants={fadeIn} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4">

        <p className="text-sm text-ink-secondary">Ready to review another image?</p>

        <div className="flex flex-wrap gap-2">

          {completed&&<a href="#report-feedback" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-secondary hover:bg-canvas"><MessageSquare aria-hidden="true" className="h-4 w-4"/>Rate this report</a>}

          <Link to="/scan" className="theme-action inline-flex min-h-11 items-center gap-2 rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-on-action shadow-sm transition hover:bg-action-hover"><ScanLine aria-hidden="true" className="h-4 w-4"/>Scan another image</Link>

        </div>

      </motion.div>

      {completed&&<div id="report-feedback" className="scroll-mt-6"><ScanFeedback key={scanId} scanId={scanId}/></div>}

    </motion.div>

  );

}



export default function ScanDetailsPage() {

  const { scanId } = useParams();

  const [attempt, setAttempt] = useState(0);

  

  return (

    <DashboardLayout>

      <div className="max-w-7xl mx-auto">

        <Link to="/history" className="inline-flex items-center gap-2 text-sm font-bold text-ink-muted hover:text-accent hover:bg-accent-soft px-3 py-1.5 rounded-lg transition-colors mb-6 -ml-3">

          <ArrowLeft className="w-4 h-4" /> Back to history

        </Link>

        <SavedResult key={scanId + ':' + attempt} scanId={scanId} onRetry={() => setAttempt(value => value + 1)} />

      </div>

    </DashboardLayout>

  );

}

