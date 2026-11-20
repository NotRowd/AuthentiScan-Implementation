import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {normalizeAnalysis} from '../server/ai-contract.mjs';
import {analyze} from '../server/ai.mjs';
import {CURRENT_AI_RELEASE} from '../server/current-ai-release.mjs';
import {scorePresentation,heatmapExplanation,verdictExplanation} from '../src/utils/analysisPresentation.js';
import report from '../server/scanReport.cjs';

const legacy={verdict:'authentic',authentic_score:0.45,ai_generated_score:0.55,confidence_score:0.55,model_version:'fixture',readable_explanation:'Fixture only.'};
const modern=()=>({...legacy,confidence_score:.45,confidence_kind:'verdict_class_score',inference_contract_version:2,
  preprocessing_version:'rgb-pillow-bilinear-224-v1',policy_version:'sha256:fixture',decision_threshold:.38,uncertainty_margin:.05,
  heatmap_path:'/heatmaps/test.png',gradcam:{status:'available',target:'authentic',reason:null,method:'gradcam',palette:'blue-green-yellow-v1',overlay_alpha:.4,source_grid:[7,7]}});

function manuscript(score,verdict){
  const uncertain=verdict==='uncertain';
  return {...modern(),verdict,authentic_score:score,ai_generated_score:1-score,
    confidence_score:uncertain?Math.max(score,1-score):verdict==='authentic'?score:1-score,
    confidence_kind:uncertain?'max_class_score_no_verdict':'verdict_class_score',
    decision_rule:'manuscript_min_score_v1',minimum_class_score:.6,decision_threshold:.5,uncertainty_margin:.1,
    policy_version:'sha256:manuscript-fixture',heatmap_path:null,
    gradcam:{...modern().gradcam,status:'unavailable',target:uncertain?null:verdict,reason:uncertain?'uncertain_prediction':'no_positive_attribution'}};
}

test('manuscript 60% policy preserves exact boundaries, metadata and uncertain heatmap semantics',()=>{
  for(const [score,verdict] of [[0,'ai_generated'],[.4,'ai_generated'],[.40000000000001,'uncertain'],[.5102,'uncertain'],[.59999999999999,'uncertain'],[.6,'authentic'],[1,'authentic']]){
    const source=manuscript(score,verdict),result=normalizeAnalysis(source);
    assert.equal(result.verdict,verdict);assert.equal(result.minimum_class_score,.6);
    assert.equal(result.decision_rule,'manuscript_min_score_v1');
    assert.match(verdictExplanation({status:'completed',analysis:result}).policy,/Exactly 60% selects/);
    if(verdict==='uncertain'){
      assert.equal(result.gradcam.target,null);assert.match(heatmapExplanation(result),/No single-class/);
    }
  }
  const correct=manuscript(.5102,'uncertain');
  for(const patch of [{decision_rule:'unknown'},{minimum_class_score:.55},{decision_threshold:.32},{uncertainty_margin:.05},
    {verdict:'authentic'},{gradcam:{...correct.gradcam,target:'authentic'}},
    {ai_generated_score:.489805}])assert.throws(()=>normalizeAnalysis({...correct,...patch}));
  assert.throws(()=>normalizeAnalysis({...modern(),minimum_class_score:.6}));
  assert.match(verdictExplanation({status:'completed',analysis:normalizeAnalysis(modern())}).policy,/38.00%/);
});
test('legacy and v2 scores refer to selected class without altering original saved data',()=>{
  const source={...legacy};assert.equal(normalizeAnalysis(source).confidence_score,.45);assert.equal(source.confidence_score,.55);
  assert.equal(scorePresentation(source).value,.45);assert.deepEqual(report.scoreForReport(source),['Authentic class score',.45]);
  assert.match(heatmapExplanation(source),/older result/);assert.match(report.heatmapTarget(source),/Not recorded/);
  const normalized=normalizeAnalysis(modern());assert.equal(normalized.gradcam.target,'authentic');assert.equal(normalized.policy_version,'sha256:fixture');
  assert.equal(normalized.decision_threshold,.38);assert.equal(normalized.preprocessing_version,'rgb-pillow-bilinear-224-v1');
});
test('uncertain result has no selected target and no heatmap',()=>{
  const source={...modern(),verdict:'uncertain',authentic_score:.38,ai_generated_score:.62,confidence_score:.62,confidence_kind:'max_class_score_no_verdict',heatmap_path:null};
  source.gradcam={...source.gradcam,status:'unavailable',target:null,reason:'uncertain_prediction'};
  const result=normalizeAnalysis(source);
  assert.equal(result.gradcam.target,null);assert.match(scorePresentation(result).label,/uncertain/);
  assert.match(heatmapExplanation(result),/No single-class heatmap/);assert.match(report.heatmapTarget(result),/None/);
  assert.equal(report.scoreForReport(result)[1],.62);
});
test('invalid numeric, policy, confidence, and heatmap metadata are rejected',()=>{
  for(const change of [{authentic_score:NaN},{confidence_score:Infinity},{ai_generated_score:.9},
    {inference_contract_version:3},{confidence_score:.55},{decision_threshold:NaN},{uncertainty_margin:-1},
    {verdict:'ai_generated'},{policy_version:''},{heatmap_path:'https://example.com/private.png'},
    {gradcam:{...modern().gradcam,target:'ai_generated'}},{gradcam:{...modern().gradcam,source_grid:[0,7]}}]) {
    assert.throws(()=>normalizeAnalysis({...modern(),...change}));
  }
});
test('AI HTTP adapter persists metadata and tolerates missing optional heatmap bytes',async()=>{
  const previous=process.env.AI_SERVICE_URL;
  let payload={...manuscript(.8,'authentic'),...CURRENT_AI_RELEASE,heatmap_path:'/heatmaps/test.png',gradcam:modern().gradcam};
  const server=createServer(async(req,res)=>{
    for await(const _chunk of req){};
    if(req.url==='/predict'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,data:payload}));}
    else {res.statusCode=404;res.end();}
  }).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  process.env.AI_SERVICE_URL=`http://127.0.0.1:${server.address().port}`;
  try {
    const value=await analyze(Buffer.from('fixture'),'image/png','fixture.png');
    assert.equal(value.heatmap,null);assert.equal(value.result.gradcam.reason,'delivery_failed');
    assert.equal(value.result.policy_version,CURRENT_AI_RELEASE.policy_version);assert.equal(value.result.confidence_score,.8);
    payload={...legacy};await assert.rejects(analyze(Buffer.from('fixture'),'image/png','fixture.png'),/AI analysis unavailable or invalid/);
    payload=modern();await assert.rejects(analyze(Buffer.from('fixture'),'image/png','fixture.png'),/AI analysis unavailable or invalid/);
  } finally {
    if(previous===undefined)delete process.env.AI_SERVICE_URL;else process.env.AI_SERVICE_URL=previous;
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
