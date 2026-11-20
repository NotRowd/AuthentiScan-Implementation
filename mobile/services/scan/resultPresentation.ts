import type { ScanResult } from '../../types';
export type ScoreRow = { key: 'authentic' | 'ai_generated'; label: string; percent: number | null; note: string; derived?: boolean };
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const percent = (v: unknown): number | null => valid(v) ? Math.round(v * 10000) / 100 : null;
// Mirror the website's display contract. Never change the saved verdict or confidence.
export function classificationRows(result: ScanResult): {rows: ScoreRow[]; explanation: string} {
  const analysis = result.analysis;
  if(result.analysisProvider==='truthscan'&&analysis?.display_grouping==='authentiscan_digital_editing_group_v1')return {rows:[{key:'authentic',label:'Reported confidence',percent:percent(analysis.provider_label_confidence),note:''}],explanation:''};
  if(result.analysisProvider==='truthscan'&&analysis?.provider_label==='Digitally Edited')return {rows:[{key:'authentic',label:'Confidence in detecting digital editing',percent:percent(analysis.provider_label_confidence),note:'This is editing confidence, not confidence in authenticity.'}],explanation:'Authenticity confidence: Not supplied. '+(analysis.display_grouping?'AuthentiScan display category. This grouping does not verify human authorship.':'')};
  const selected = result.verdict === 'uncertain' ? null : result.verdict;
  const provider = result.analysisProvider === 'truthscan';
  let rows: ScoreRow[] = [
    {key:'authentic',label:'Authentic',percent:result.authenticScore,note:''},
    {key:'ai_generated',label:'AI-generated',percent:result.aiGeneratedScore,note:''},
  ];
  rows = rows.filter(row => !selected || row.key === selected).map(row => {
    const matches = row.key === 'authentic' ? analysis?.provider_label === 'Real' : ['AI Generated','AI Edited'].includes(analysis?.provider_label || '');
    return {...row, percent:provider && selected && matches ? percent(analysis?.provider_label_confidence) : row.percent,
      note:provider && selected ? analysis?.provider_label === 'AI Edited' ? 'Confidence in detected AI editing' : 'Confidence in this classification' : ''};
  });
  const source = analysis?.provider_label === 'Real' ? 'authentic' : ['AI Generated','AI Edited'].includes(analysis?.provider_label || '') ? 'ai_generated' : null;
  const confidence = analysis?.provider_label_confidence;
  const comparison = provider && !selected && source && valid(confidence) && confidence < .6 && rows.every(row => row.percent === null);
  if (comparison) rows = rows.map(row => ({...row,percent:percent(row.key === source ? confidence : 1-confidence),derived:row.key !== source,
    note:row.key === source ? 'Returned label confidence' : 'Calculated remainder (100% minus returned confidence)'}));
  const explanation = comparison ? 'Only the returned label confidence was supplied. The other value is a calculated remainder for display, not a separate model score or verified probability. The Uncertain result uses the original, unrounded confidence below 60%.'
    : provider && !selected && rows.some(row=>row.percent===null) ? 'Separate Authentic and AI-generated percentages were not supplied. Confidence in the returned label: '+(percent(confidence)?.toFixed(2) ?? 'not supplied')+'%. This is not a pair of class percentages.' : '';
  return {rows,explanation};
}
export function resultExplanation(result: ScanResult): string {
  if(!result.hasAnalysis||result.analysisProvider!=='truthscan')return result.summary;
  const analysis=result.analysis;
  if(analysis?.display_grouping==='authentiscan_digital_editing_group_v1')return 'This result does not confirm that the image is unedited or human-made, and it does not rule out AI involvement. Results are estimates, not proof.';
  if(analysis?.provider_label==='AI Edited'&&result.verdict==='ai_generated')return 'The analysis found signs of AI involvement. This does not mean the entire image was AI-generated. Results are estimates, not proof.';
  const limit=result.verdict==='authentic'
    ?'Authentic does not mean unedited. This does not rule out filters, editing, or AI-generated content that the model missed.'
    :result.verdict==='ai_generated'
      ?'This is a model prediction, not proof of AI generation. It does not identify a specific visual defect or edited region.'
      :'Uncertain is a completed result, not a failed scan. It does not confirm authenticity or AI generation.';
  return result.summary+' '+limit;
}
export function regionPresentation(result: ScanResult) {
  return {originalOnly:result.verdict==='authentic'||result.analysis?.provider_label==='Digitally Edited',available:result.verdict!=='authentic'&&result.analysis?.provider_label!=='Digitally Edited'&&result.localization?.status==='available',
    image:'/api/v1/scans/'+result.id+'/localization-image'};
}
