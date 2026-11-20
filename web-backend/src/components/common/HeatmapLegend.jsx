export default function HeatmapLegend({result}){
  const g=result?.gradcam;
  if(g?.status!=='available'||g.palette!=='blue-green-yellow-v1'||!['authentic','ai_generated'].includes(g.target))return null;
  return <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-xs text-ink-secondary" aria-label="Grad-CAM color legend">
    <p className="font-semibold">Influence on the {g.target==='authentic'?'Authentic':'AI-generated'} score</p>
    <div aria-hidden="true" className="h-4 rounded-full mt-3 border border-control" style={{background:'linear-gradient(90deg,#0000ff 0%,#00ff00 33.33%,#ffff00 66.67%,#ffff00 100%)'}}/>
    <div className="flex justify-between gap-3 mt-2"><span>Blue · lower</span><span>Green · medium</span><span>Yellow · higher</span></div>
    <details className="mt-3"><summary className="cursor-pointer py-1">About these colors</summary><p className="mt-2 leading-relaxed">Yellow does not mean edited, and blue does not mean authentic. Colors are relative within this image, not probabilities. Scale: 0–1; yellow saturates from about 0.67 upward. The overlay is blended 40% with the original. Colors cannot be compared as absolute scores between images.</p></details>
  </div>;
}
