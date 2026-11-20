// Synthetic report only. No user account, private image, or cloud request.
import {mkdir,writeFile} from 'node:fs/promises';
import report from '../server/scanReport.cjs';
import {objectFixture} from './object-fixture.mjs';
const detection=objectFixture();
detection.objects=Array.from({length:20},(_,i)=>({...detection.objects[i%2]}));
const bytes=await report.buildScanReport({scan_id:'fixture',scan_number:1,original_file_name:'synthetic-review.png',status:'completed',result_id:'fixture',
  verdict:'authentic',authentic_score:.8,ai_generated_score:.2,model_version:'synthetic-fixture',created_at:'2026-10-04T00:00:00Z',
  object_detection:{...detection,detected_at:'2026-10-04T00:00:00Z'}});
await mkdir('.test-results/object-report',{recursive:true});
await writeFile('.test-results/object-report/report.pdf',bytes);
