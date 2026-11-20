import {heatmapExplanation} from '../../utils/analysisPresentation';
export default function AnalysisExplanation({result}) {
  return <p className="text-xs leading-relaxed text-ink-secondary mt-3" role="note">{heatmapExplanation(result)}</p>;
}
