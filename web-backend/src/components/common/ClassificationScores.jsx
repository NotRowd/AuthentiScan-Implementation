const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const percent = value => valid(value) ? `${(value * 100).toFixed(2)}%` : 'Not supplied';

export default function ClassificationScores({analysis}) {
  if(analysis.display_grouping==='authentiscan_digital_editing_group_v1')return <div aria-label="Model scores">
    <div className="rounded-2xl border border-line bg-canvas p-4">
      <p className="text-sm font-semibold text-ink-secondary">Reported confidence</p>
      <p className="text-2xl sm:text-3xl font-bold text-ink mt-1">{percent(analysis.provider_label_confidence)}</p>
      <div {...(valid(analysis.provider_label_confidence)?{role:'progressbar','aria-label':'Reported confidence','aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':Number((analysis.provider_label_confidence*100).toFixed(2))}:{'aria-hidden':true})} className="h-2 rounded-full bg-surface-raised mt-3 overflow-hidden"><div className="theme-action h-full bg-action" style={{width:`${valid(analysis.provider_label_confidence)?analysis.provider_label_confidence*100:0}%`}}/></div>
      <p className="mt-2 text-xs text-ink-secondary">See result explanation for score details.</p>
    </div>
  </div>;
  if(analysis.provider==='truthscan'&&analysis.provider_label==='Digitally Edited')return <div aria-label="Model scores">
    <div className="rounded-2xl border border-line bg-canvas p-4">
      <p className="text-sm font-semibold text-ink-secondary">Confidence in detecting digital editing</p>
      <p className="text-2xl sm:text-3xl font-bold text-ink mt-1">{percent(analysis.provider_label_confidence)}</p>
      <div {...(valid(analysis.provider_label_confidence)?{role:'progressbar','aria-label':'Digital-editing confidence','aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':Number((analysis.provider_label_confidence*100).toFixed(2))}:{'aria-hidden':true})} className="h-2 rounded-full bg-surface-raised mt-3 overflow-hidden"><div className="theme-action h-full bg-action" style={{width:`${valid(analysis.provider_label_confidence)?analysis.provider_label_confidence*100:0}%`}}/></div>
      <p className="mt-2 text-xs text-ink-secondary">This is editing confidence, not confidence in authenticity.</p>
    </div>
    <p className="mt-3 text-xs text-ink-secondary">Authenticity confidence: Not supplied</p>
    {analysis.display_grouping&&<p className="mt-2 text-xs text-ink-secondary">AuthentiScan display category. This grouping does not verify human authorship.</p>}
  </div>;
  const selected = ['authentic', 'ai_generated'].includes(analysis.verdict) ? analysis.verdict : null;
  const provider = analysis.provider === 'truthscan';
  let rows = [
    {key: 'authentic', label: 'Authentic', score: analysis.authentic_score, providerLabel: 'Real'},
    {key: 'ai_generated', label: 'AI-generated', score: analysis.ai_generated_score, providerLabel: 'AI Generated'},
  ].filter(row => !selected || row.key === selected).map(row => ({...row,
    score: provider && selected && (analysis.provider_label === row.providerLabel || row.key === 'ai_generated' && analysis.provider_label === 'AI Edited')
      ? analysis.provider_label_confidence : row.score,
  }));
  const sourceKey = analysis.provider_label === 'Real' ? 'authentic'
    : ['AI Generated', 'AI Edited'].includes(analysis.provider_label) ? 'ai_generated' : null;
  const comparison = provider && analysis.verdict === 'uncertain' && sourceKey &&
    valid(analysis.provider_label_confidence) && analysis.provider_label_confidence < .6 &&
    rows.every(row => !valid(row.score));
  if (comparison) rows = rows.map(row => ({...row,
    score: row.key === sourceKey ? analysis.provider_label_confidence : 1 - analysis.provider_label_confidence,
    derived: row.key !== sourceKey,
  }));
  const missingPair = provider && !selected && rows.some(row => !valid(row.score));
  return <div aria-label="Model scores" className={`grid gap-3 ${selected ? 'grid-cols-1' : 'grid-cols-2'}`}>
    {missingPair && <p className="col-span-2 text-sm leading-relaxed text-ink-secondary">Separate Authentic and AI-generated percentages were not supplied for this Uncertain result. Confidence in the returned label: {percent(analysis.provider_label_confidence)}. This is not a pair of class percentages.</p>}
    {rows.map(row => <div key={row.key} data-testid={`classification-${row.key}`} className="rounded-2xl border border-line bg-canvas p-4">
      <p className="text-sm font-semibold text-ink-secondary">{row.label}</p>
      <p className="text-2xl sm:text-3xl font-bold text-ink mt-1">{percent(row.score)}</p>
      {comparison && <p className="mt-1 text-xs text-ink-secondary">{row.derived ? 'Calculated remainder (100% minus returned confidence)' : analysis.provider_label === 'AI Edited' ? 'Returned AI-editing label confidence' : 'Returned label confidence'}</p>}
      {provider && selected && <p className="mt-1 text-xs text-ink-secondary">{analysis.provider_label === 'AI Edited' ? 'Confidence in detected AI editing' : 'Confidence in this classification'}</p>}
      <div {...(valid(row.score) ? {role:'progressbar', 'aria-label':`${row.label} ${row.derived ? 'calculated remainder' : provider && (selected || comparison) ? 'label confidence' : 'class score'}`, 'aria-valuemin':0, 'aria-valuemax':100, 'aria-valuenow':Number((row.score * 100).toFixed(2))} : {'aria-hidden':true})} className="h-2 rounded-full bg-surface-raised mt-3 overflow-hidden">
        <div className={row.key === 'authentic' ? 'h-full bg-action' : 'h-full bg-ai'} style={{width:`${valid(row.score) ? row.score * 100 : 0}%`}} />
      </div>
    </div>)}
    {comparison && <p className="col-span-2 text-sm leading-relaxed text-ink-secondary">Only the returned label confidence was supplied. The other value is a calculated remainder for display, not a separate model score or verified probability. The Uncertain result still uses the original, unrounded confidence below 60%.</p>}
  </div>;
}
