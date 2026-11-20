import test from 'node:test';
import assert from 'node:assert/strict';
import {runTruthScanPipeline} from '../server/truthscan-pipeline.mjs';

function fixture() {
  const record={scan_id:'123e4567-e89b-12d3-a456-426614174000',owner_uid:'fixture-user',file_sha256:'a'.repeat(64)};
  const updates=[],writes=[];
  let submits=0;
  const client={
    submit:async(_bytes,{id,saveJob})=>{submits++;await saveJob({provider:'truthscan',job_id:id,status:'pending'});return id;},
    poll:async()=>({status:'done',result_details:{final_result:'AI Generated',final_label_confidence:87,
      heatmap_status:'ready',analysis_results:{detailedReasoning:'A provider observation.',keyIndicators:['One indicator.']}}}),
    heatmap:async()=>Buffer.from('test-image-bytes'),
  };
  const args={record,ref:{update:async value=>updates.push(value)},
    media:{file:path=>({save:async bytes=>writes.push({path,bytes})})},
    finish:async details=>details,client};
  return {args,updates,writes,submits:()=>submits};
}

test('normal provider upload produces saved classification, heatmap and narrative',async()=>{
  const f=fixture();
  const result=await runTruthScanPipeline({...f.args,submit:true,bytes:Buffer.from('input')});
  assert.equal(f.submits(),1);
  assert.notEqual(f.updates[0].provider_job.job_id,f.args.record.scan_id);
  assert.match(f.updates[0].provider_job.job_id,/^[a-f0-9-]{36}$/);
  assert.equal(result.analysis.verdict,'ai_generated');
  assert.equal(result.analysis.authentic_score,null);
  assert.equal(result.has_heatmap,true);
  assert.equal(result.localization.provider,'truthscan');
  assert.equal(result.localization.highlighted_pixels,undefined);
  assert.equal(result.provider_review.text,'A provider observation.');
  assert.equal(f.writes[0].path,`users/fixture-user/scans/${f.args.record.scan_id}/heatmap.png`);
});

test('resume queries existing job and never submits or invokes local models',async()=>{
  const f=fixture();
  f.args.record.provider_job={provider:'truthscan',job_id:f.args.record.scan_id,status:'pending'};
  await runTruthScanPipeline(f.args);
  assert.equal(f.submits(),0);
  await assert.rejects(runTruthScanPipeline({...f.args,submit:true}));
});

test('heatmap storage failure preserves classification without a false available image',async()=>{
  const f=fixture();
  f.args.media={file:()=>({save:async()=>{throw new Error('Storage offline');}})};
  const result=await runTruthScanPipeline({...f.args,submit:true});
  assert.equal(result.analysis.verdict,'ai_generated');
  assert.equal(result.has_heatmap,false);
  assert.equal(result.localization.status,'unavailable');
});

test('pending provider task remains unfinished and keeps its durable job',async()=>{
  const f=fixture();
  f.args.client.poll=async()=>{throw Object.assign(new Error('Pending'),{code:'TRUTHSCAN_PENDING'});};
  await assert.rejects(runTruthScanPipeline({...f.args,submit:true}),{code:'TRUTHSCAN_PENDING'});
  assert.equal(f.updates[0].provider_job.status,'pending');
  assert.equal(f.writes.length,0);
});

test('edited labels and missing optional analysis remain a completed uncertain result',async()=>{
  const f=fixture();
  f.args.client.poll=async()=>({result_details:{final_result:'Digitally Edited',final_label_confidence:99}});
  const result=await runTruthScanPipeline({...f.args,submit:true});
  assert.equal(result.analysis.verdict,'uncertain');
  assert.equal(result.localization.status,'unavailable');
  assert.equal(result.provider_review.status,'unavailable');
});
