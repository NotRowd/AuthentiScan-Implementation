import {Link} from 'react-router-dom';
import {UploadCloud, CheckCircle2, ArrowRight, Sparkles} from 'lucide-react';
import StatusBadge from './StatusBadge';
import ExportReportButton from './ExportReportButton';
import LocalizationPanel from './LocalizationPanel';
import ScanAllowance from './ScanAllowance';
import {scorePresentation, verdictExplanation} from '../../utils/analysisPresentation';

export default function CompletedScanWorkspace({scan, file, previewUrl, onChooseAnother}) {
  const analysis = scan.analysis;
  const score = scorePresentation(analysis);
  const validScore = typeof score.value === 'number' && Number.isFinite(score.value) && score.value >= 0 && score.value <= 1;
  const provider = analysis.provider === 'truthscan';
  const explanation = verdictExplanation(scan);
  return <div className="space-y-5">
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">Analysis workspace</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Scan Image</h1>
      <p className="mt-2 text-sm text-ink-muted">Your analysis is saved. Review the result and available heatmap.</p>
    </header>
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-accent-soft/60 px-4 py-3 text-xs leading-relaxed text-ink-secondary">
      <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-accent"/>
      <p><strong className="font-semibold text-ink">Ready to review.</strong> Results are estimates, not proof of authenticity or AI generation.</p>
    </div>
    <div data-testid="completed-scan-layout" className="grid items-start gap-5 xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-1">
        <section aria-labelledby="saved-upload-title" className="min-w-0 rounded-3xl border border-line bg-surface p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><UploadCloud aria-hidden="true" className="h-4 w-4"/></span>
            <div><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Uploaded image</p><h2 id="saved-upload-title" className="text-xs font-semibold text-ink">Saved to your account</h2></div>
          </div>
          {previewUrl && <img src={previewUrl} alt="Selected upload thumbnail" width="240" height="135" className="aspect-video w-full rounded-xl border border-line bg-canvas object-contain"/>}
          <p className="mt-3 break-words text-xs font-semibold leading-relaxed text-ink [overflow-wrap:anywhere]">{scan.original_file_name || file?.name || 'Uploaded image'}</p>
          {file && <p className="mt-1 text-xs text-ink-muted">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-success"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5"/>Scan saved</p>
          <button type="button" onClick={onChooseAnother} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink-secondary transition-colors hover:border-line hover:bg-accent-soft"><UploadCloud aria-hidden="true" className="h-4 w-4 shrink-0"/>Choose another image</button>
          <p className="mt-2 text-[10px] text-ink-muted">JPEG, PNG, or WebP · Up to 10 MB</p>
        </section>
        <ScanAllowance scan={scan}/>
      </div>
      <section aria-labelledby="completed-result-title" className="min-w-0 rounded-3xl border border-line bg-surface p-4 shadow-sm sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div><p role="status" className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-success"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5"/>Analysis complete</p><h2 id="completed-result-title" className="text-xl font-bold tracking-tight text-ink">Your scan result</h2></div>
          <div data-testid="completed-report-actions" className="flex flex-wrap items-start gap-2">
            <Link to={`/scans/${scan.scan_id}`} className="theme-action inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-action px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-action-hover">View full report<ArrowRight aria-hidden="true" className="h-4 w-4"/></Link>
            <ExportReportButton key={scan.scan_id} scanId={scan.scan_id} scanNumber={scan.scan_number}/>
          </div>
        </header>
        <div className="grid gap-5 py-5 sm:grid-cols-2">
          <div className="min-w-0"><h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Image classification</h3><StatusBadge status={analysis.verdict}/><p className="mt-3 text-xs leading-relaxed text-ink-secondary">{explanation.summary}</p></div>
          <div aria-label="Classification confidence" className="min-w-0 self-start rounded-2xl border border-line bg-canvas p-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{provider ? 'Returned label confidence' : score.label}</h3>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-ink">{validScore ? `${(score.value * 100).toFixed(2)}%` : 'Not available'}</p>
            {validScore && <div role="progressbar" aria-label={provider ? `Confidence in returned label ${analysis.provider_label || 'not recorded'}` : score.label} aria-valuenow={Number((score.value * 100).toFixed(2))} aria-valuemin={0} aria-valuemax={100} className="my-3 h-1.5 overflow-hidden rounded-full bg-surface-raised"><div className="theme-action h-full bg-action" style={{width:`${score.value * 100}%`}}/></div>}
            {provider ? <><p className="mt-2 text-[11px] leading-relaxed text-ink-muted">Confidence refers to the returned label, not a pair of Authentic and AI-generated percentages.{analysis.verdict === 'uncertain' ? ' A high value for an editing label can still produce Uncertain.' : ''}</p></> : <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">Saved model score, not verified proof. This result uses its recorded decision rule.</p>}
          </div>
        </div>
        <div className="border-t border-line pt-5"><LocalizationPanel scan={scan} layout="workspace"/></div>
        <footer className="mt-5 flex flex-wrap justify-between gap-2 border-t border-line pt-4 text-[10px] leading-relaxed text-ink-muted"><span>AI estimate · Not proof of authenticity</span>{analysis.verdict === 'uncertain' && <span>Uncertain is a completed result, not a failed scan.</span>}</footer>
      </section>
    </div>
  </div>;
}
