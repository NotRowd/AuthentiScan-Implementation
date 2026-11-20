import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {localizeImage,localizationBase} from '../server/localization.mjs';
import {normalizeLocalization,localizationMessage,localizationScoreMask,unavailableLocalization} from '../shared/localization-contract.mjs';
import {localizationFixture} from './localization-fixture.mjs';
import {experimentalFixture} from './experimental-localization-fixture.mjs';
import sharp from 'sharp';
import report from '../server/scanReport.cjs';
import {localizationPreview} from '../server/localization-preview.mjs';

test('preview verifies original bytes and upright dimensions before overlaying',async()=>{
  const original=await sharp({create:{width:64,height:32,channels:3,background:'#abcdef'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const metadata={...localizationFixture(createHash('sha256').update(original).digest('hex')),image_width:32,image_height:64};
  const preview=await localizationPreview(original,metadata),info=await sharp(preview).metadata();
  assert.equal(info.width,32);assert.equal(info.height,64);assert.equal(info.orientation,undefined);
  await assert.rejects(()=>localizationPreview(original,{...metadata,image_width:64,image_height:32}));
  await assert.rejects(()=>localizationPreview(original,{...metadata,input_sha256:'c'.repeat(64)}));
  await assert.rejects(()=>localizationPreview(original,unavailableLocalization()));
});

test('PDF renders only valid completed localization with aligned preview, and survives missing or invalid maps',async()=>{
  const preview=await sharp({create:{width:32,height:32,channels:3,background:'#abcdef'}}).png().toBuffer();
  const scan={scan_id:'fixture',status:'completed',result_id:'fixture',verdict:'uncertain',authentic_score:.52,ai_generated_score:.48,localization:localizationFixture()};
  // The redesigned PDF places localization beside Grad-CAM on one page.
  // Assert embedded image presence, not the old one-page-per-module layout.
  const images=pdf=>(pdf.toString('latin1').match(/\/Subtype \/Image\b/g)||[]).length;
  const base=images(await report.buildScanReport(scan));
  assert.equal(images(await report.buildScanReport(scan,null,new Date(),preview)),base+1);
  for(const change of [{status:'failed'},{localization:{...scan.localization,mask:[1]}},
    {localization:{...scan.localization,image_width:64}},
    {localization:{...scan.localization,status:'uncertain',reason:'no_candidate_region',mask:null}}]){
    assert.equal(images(await report.buildScanReport({...scan,...change},null,new Date(),preview)),base);
  }
  assert.equal(images(await report.buildScanReport(scan,null,new Date(),Buffer.from('invalid png'))),base);
});

test('localization is separate, bounded, tied to the input and never substitutes a verdict',()=>{
  const fixture=localizationFixture();
  const result=normalizeLocalization({...fixture,verdict:'ai_generated',heatmap_path:'/secret'},fixture.input_sha256);
  assert.deepEqual(result,fixture);assert.notEqual(result.mask,fixture.mask);
  for(const change of [{mask:Array(1024).fill(1)},{mask:Array(1024).fill(0)},{mask:[1]},
    {mask:Array(1024).fill(.5)},{threshold:NaN},{threshold:0},{grid_shape:[1024,1]},
    {image_width:16000001},{image_height:0},{coordinate_space:'raw'},
    {input_sha256:'c'.repeat(64)},{policy_sha256:''},{scope:'all_images'},{status:'authentic'}]){
    assert.throws(()=>normalizeLocalization({...fixture,...change},fixture.input_sha256));
  }
  assert.deepEqual(normalizeLocalization(unavailableLocalization()),unavailableLocalization());
  assert.match(localizationMessage(unavailableLocalization()),/did not reliably locate edits/);
  const uncertain=normalizeLocalization({...fixture,status:'uncertain',reason:'no_candidate_region',mask:null});
  assert.equal(uncertain.mask,null);assert.match(localizationMessage(uncertain),/does not prove/);
  assert.match(localizationMessage(null),/Not assessed/);
});

test('experimental candidate cannot lose its failed-validation disclosure',()=>{
  const fixture=experimentalFixture();
  assert.deepEqual(normalizeLocalization(fixture),fixture);
  for(const change of [{usage_mode:undefined},{validation_status:'passed'},{release_approved:true},{model_sha256:'a'.repeat(64)},{threshold:.5}]){
    assert.throws(()=>normalizeLocalization({...fixture,...change}));
  }
  const uncertain=normalizeLocalization({...fixture,status:'uncertain',mask:null,reason:'no_candidate_region'});
  assert.equal(uncertain.validation_status,'failed');assert.equal(uncertain.release_approved,false);
});

test('score exploration is bounded and never promotes an uncertain saved result',async()=>{
  const original=await sharp({create:{width:32,height:32,channels:3,background:'#abcdef'}}).png().toBuffer();
  const data={...experimentalFixture(createHash('sha256').update(original).digest('hex')),image_width:32,image_height:32,
    status:'uncertain',mask:null,reason:'no_candidate_region',score_scale:10000,score_grid:Array(1024).fill(1200)};
  data.score_grid[3]=7500;
  const result=normalizeLocalization(data);
  assert.equal(localizationScoreMask(result,.5).reduce((a,b)=>a+b),1);
  assert.equal(localizationScoreMask(result,.9).reduce((a,b)=>a+b),0);
  assert.equal(result.status,'uncertain');assert.equal(result.mask,null);assert.equal(result.threshold,.97);
  assert.notEqual(result.score_grid,data.score_grid);
  assert.ok((await localizationPreview(original,result)).length>0);
  for(const change of [{score_scale:1},{score_grid:[1]},{score_grid:Array(1024).fill(NaN)},
    {score_grid:Array(1024).fill(10001)},{score_grid:Array(1024).fill(.5)},{score_grid:Array(1024).fill(-1)}]){
    assert.throws(()=>normalizeLocalization({...data,...change}));
  }
  for(const cutoff of [NaN,0,1,-1])assert.throws(()=>localizationScoreMask(data,cutoff));
});

test('localizer defaults off; enabled adapter rejects remote, invalid, unrelated or redirected output',async()=>{
  const savedUrl=process.env.LOCALIZATION_SERVICE_URL,savedEnabled=process.env.AUTHENTISCAN_LOCALIZATION_ENABLED;
  const savedMode=process.env.AUTHENTISCAN_LOCALIZATION_MODE;
  let server;
  try{
    delete process.env.AUTHENTISCAN_LOCALIZATION_ENABLED;
    delete process.env.AUTHENTISCAN_LOCALIZATION_MODE;
    assert.equal((await localizeImage(Buffer.from('test'))).reason,'candidate_not_approved');
    for(const url of ['https://example.com','http://localhost:5004/path','http://user:pass@127.0.0.1','http://localhost:5004/?q=1']){
      process.env.LOCALIZATION_SERVICE_URL=url;assert.throws(localizationBase);
    }
    const bytes=Buffer.from('fixture'),hash=createHash('sha256').update(bytes).digest('hex');let mode='valid';
    server=createServer(async(req,res)=>{
      assert.equal(req.headers['x-authentiscan-localizer'],'localization-v1');
      for await(const _chunk of req){};
      if(mode==='redirect'){res.writeHead(302,{Location:'https://example.com'});return res.end();}
      res.end(mode==='large'?'x'.repeat(33000):JSON.stringify({success:true,data:mode==='experimental'?experimentalFixture(hash):mode==='valid'?localizationFixture(hash):mode==='wrong_image'?localizationFixture():{}}));
    }).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    process.env.LOCALIZATION_SERVICE_URL=`http://127.0.0.1:${server.address().port}`;
    process.env.AUTHENTISCAN_LOCALIZATION_ENABLED='1';
    assert.equal((await localizeImage(bytes)).status,'available');
    for(mode of ['redirect','large','wrong_image','invalid'])assert.equal((await localizeImage(bytes)).status,'unavailable');
    mode='experimental';assert.equal((await localizeImage(bytes)).status,'unavailable');
    process.env.AUTHENTISCAN_LOCALIZATION_MODE='experimental';
    delete process.env.AUTHENTISCAN_LOCALIZATION_ENABLED;
    assert.equal((await localizeImage(bytes)).validation_status,'failed');
    mode='valid';assert.equal((await localizeImage(bytes)).status,'unavailable');
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(savedUrl===undefined)delete process.env.LOCALIZATION_SERVICE_URL;else process.env.LOCALIZATION_SERVICE_URL=savedUrl;
    if(savedEnabled===undefined)delete process.env.AUTHENTISCAN_LOCALIZATION_ENABLED;else process.env.AUTHENTISCAN_LOCALIZATION_ENABLED=savedEnabled;
    if(savedMode===undefined)delete process.env.AUTHENTISCAN_LOCALIZATION_MODE;else process.env.AUTHENTISCAN_LOCALIZATION_MODE=savedMode;
  }
});


test('CPU handoff response preserves its binary mask and empty result',async()=>{
  const keys=['AUTHENTISCAN_LOCALIZATION_MODE','AUTHENTISCAN_LOCALIZATION_ENABLED','MESORCH_LOCALIZATION_SERVICE_URL'];
  const saved=keys.map(key=>process.env[key]);
  const bytes=Buffer.from('CPU integration fixture');
  const mask=await sharp(Buffer.from([255,0,0,0]),{raw:{width:2,height:2,channels:1}}).toColourspace('b-w').png().toBuffer();
  const {MESORCH_LOCALIZER_MODEL,MESORCH_CHECKPOINT_SHA}=await import('../shared/localization-contract.mjs');
  let empty=false;
  const server=createServer(async(req,res)=>{
    for await(const chunk of req){}
    res.end(JSON.stringify({success:true,data:{schema_version:'mesorch-demo/1',coordinate_space:'upright_rgb',
      model_version:MESORCH_LOCALIZER_MODEL,checkpoint_sha256:MESORCH_CHECKPOINT_SHA,validation_status:'development_gates_failed',
      input_sha256:createHash('sha256').update(bytes).digest('hex'),image_width:2,image_height:2,threshold:.5,
      status:empty?'uncertain':'available',reason:empty?'no_candidate_region':null,
      highlighted_pixels:empty?0:1,highlighted_fraction:empty?0:.25,mask_png_base64:empty?null:mask.toString('base64')}}));
  }).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try{
    process.env.AUTHENTISCAN_LOCALIZATION_MODE='mesorch-p';process.env.AUTHENTISCAN_LOCALIZATION_ENABLED='1';
    process.env.MESORCH_LOCALIZATION_SERVICE_URL=`http://127.0.0.1:${server.address().port}`;
    const result=await localizeImage(bytes);
    assert.equal(result.status,'available');assert.equal(result.highlighted_pixels,1);assert.deepEqual(result.mask_png,mask);
    empty=true;assert.equal((await localizeImage(bytes)).reason,'no_candidate_region');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    keys.forEach((key,i)=>{if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];});
  }
});

