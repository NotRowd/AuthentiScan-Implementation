import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {prepareReportImages} from '../server/report-images.mjs';
import {localizationFixture} from './localization-fixture.mjs';

test('report previews preserve separate upright and detector coordinate spaces',async()=>{
  const original=await sharp({create:{width:64,height:32,channels:3,background:'#abcdee'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const hash=createHash('sha256').update(original).digest('hex');
  const scan={status:'completed',object_detection:{status:'available',image_width:64,image_height:32},localization:{...localizationFixture(hash),image_width:32,image_height:64}};
  const images=await prepareReportImages(original,scan);
  for(const key of ['originalImage','localizationImage']){
    const meta=await sharp(images[key]).metadata();assert.equal(meta.width,32);assert.equal(meta.height,64);assert.equal(meta.orientation,undefined);
  }
  const raw=await sharp(images.objectImage).metadata();assert.equal(raw.width,64);assert.equal(raw.height,32);assert.equal(raw.orientation,undefined);
  const wrong=await prepareReportImages(original,{...scan,object_detection:{...scan.object_detection,image_width:32},localization:{...scan.localization,input_sha256:'a'.repeat(64)}});
  assert.equal(wrong.objectImage,null);assert.equal(wrong.localizationImage,null);assert.ok(wrong.originalImage);
});
test('unavailable, uncertain, failed and invalid previews remain safe without inference',async()=>{
  const original=await sharp({create:{width:32,height:32,channels:3,background:'#aabbcc'}}).png().toBuffer();
  for(const scan of [{status:'failed'}, {status:'completed',localization:{status:'uncertain',score_grid:Array(1024).fill(9500)}}]){
    const images=await prepareReportImages(original,scan);assert.ok(images.originalImage);assert.equal(images.localizationImage,null);assert.equal(images.objectImage,null);
  }
  assert.deepEqual(await prepareReportImages(Buffer.from('not an image'),{status:'completed'}),{originalImage:null,objectImage:null,localizationImage:null});
});
