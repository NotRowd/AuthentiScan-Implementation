import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {normalizeAnalysis} from '../server/ai-contract.mjs';
import {analyze} from '../server/ai.mjs';
import {scorePresentation,heatmapExplanation} from '../src/utils/analysisPresentation.js';
import report from '../server/scanReport.cjs';

const legacy={verdict:'authentic',authentic_score:0.45,ai_generated_score:0.55,confidence_score:0.55,model_version:'fixture',readable_explanation:'Fixture only.'};
const modern=()=>({...legacy,confidence_score:.45,confidence_kind:'verdict_class_score',inference_contract_version:2,
  preprocessing_version:'rgb-pillow-bilinear-224-v1',policy_version:'sha256:fixture',decision_threshold:.38,uncertainty_margin:.05,
  heatmap_path:'/heatmaps/test.png',gradcam:{status:'available',target:'authentic',reason:null,method:'gradcam',palette:'blue-green-yellow-v1',overlay_alpha:.4,source_grid:[7,7]}});
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
  let payload=modern();
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
    assert.equal(value.result.policy_version,'sha256:fixture');assert.equal(value.result.confidence_score,.45);
    payload={...legacy};const fallback=await analyze(Buffer.from('fixture'),'image/png','fixture.png');
    assert.equal(fallback.result.gradcam,undefined);assert.equal(fallback.result.confidence_score,.45);
  } finally {
    if(previous===undefined)delete process.env.AI_SERVICE_URL;else process.env.AI_SERVICE_URL=previous;
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
