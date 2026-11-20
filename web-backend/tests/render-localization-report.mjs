// Synthetic layout fixture only; never a model prediction or a user image.
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import report from '../server/scanReport.cjs';
import {experimentalFixture} from './experimental-localization-fixture.mjs';
const localization={...experimentalFixture(),image_width:640,image_height:480,
  mask:Array.from({length:1024},(_,i)=>i%32>=12&&i%32<20&&Math.floor(i/32)>=8&&Math.floor(i/32)<24?1:0)};
const preview=await sharp(Buffer.from('<svg width="640" height="480"><rect width="640" height="480" fill="#def0ff"/><rect x="240" y="120" width="160" height="240" fill="#305577"/><text x="25" y="60" font-size="28">SYNTHETIC LAYOUT FIXTURE</text></svg>')).png().toBuffer();
const scan={scan_id:'fixture',scan_number:1,original_file_name:'SYNTHETIC-NOT-A-PREDICTION.png',status:'completed',result_id:'fixture',
  verdict:'uncertain',authentic_score:.52,ai_generated_score:.48,model_version:'synthetic-fixture',created_at:'2026-10-09T00:00:00Z',localization};
const bytes=await report.buildScanReport(scan,null,new Date('2026-10-09T00:00:00Z'),preview);
await mkdir('.test-results/localization-report',{recursive:true});
await writeFile('.test-results/localization-report/report.pdf',bytes);
