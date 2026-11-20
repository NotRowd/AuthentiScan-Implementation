import {verdictExplanation} from '../../utils/analysisPresentation';
import FeatureReviewPanel from './FeatureReviewPanel';

export function ResultExplanation({scan,standalone=false,inline=false}){
  const explanation=verdictExplanation(scan);
  const verdict=scan.analysis?.verdict;
  const summary=scan.analysis?.provider==='truthscan'?explanation.summary:scan.status!=='completed'?explanation.summary:verdict==='ai_generated'
    ?'The model classified this image as AI-generated. This is an estimate, not proof of how the image was made.'
    :verdict==='authentic'?'The model classified this image as Authentic. It may still contain filters or edits, or AI content the model missed.'
    :verdict==='uncertain'?'The model could not confidently choose between Authentic and AI-generated. Check the image’s source before trusting it.'
    :explanation.summary;
  return <section aria-labelledby="result-explanation-title" className={inline?'mt-4':standalone?'':'mt-5 border-t border-line pt-5'}>
    <h2 id="result-explanation-title" className={inline?'sr-only':'font-bold text-lg text-ink'}>Result explanation</h2>
    <p className={`${inline?'':'mt-3 '}text-sm leading-relaxed text-ink-secondary`}>{summary}</p>
  </section>;
}

export default function SceneExplanationPanel({scan,embedded=false,observationsOnly=false}){
  return <section aria-labelledby="scene-title" className={embedded?'mt-5 border-t border-line pt-5':'bg-surface rounded-3xl border border-line shadow-sm p-6'}>
    {!observationsOnly&&<ResultExplanation scan={scan}/>}
    <h2 id="scene-title" className="font-bold text-lg text-ink">What looks unusual?</h2>
    <FeatureReviewPanel key={scan.scan_id} scan={scan} autoStart />
  </section>;
}
