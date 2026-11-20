import {mkdir,writeFile} from 'node:fs/promises';
import {reportFixture} from './report-layout-fixtures.mjs';
import report from '../server/scanReport.cjs';
import {mapTruthScanClassification} from '../shared/truthscan-policy.mjs';
const {scan,original,heatmap}=await reportFixture();const out=new URL('../../output/report-wording-20261115/',import.meta.url);await mkdir(out,{recursive:true});
for(const [name,label,confidence]of [['ai-generated','AI Generated',93.15],['authentic','Real',89.75],['uncertain','AI Generated',52.24]]){
 const record={...scan,...mapTruthScanClassification({final_result:label,final_label_confidence:confidence}),provider_review:{text:'Synthetic layout example: compare the highlighted region with the original image. This is not a real detection result.'},localization:null,gradcam:null,feature_review:null,object_detection:null,scene_analysis:null};
 const pdf=await report.buildScanReport(record,name==='authentic'?null:heatmap,new Date('2026-11-15T08:00:00Z'),name==='authentic'?null:heatmap,{originalImage:original});
 await writeFile(new URL(name+'.pdf',out),pdf);
}
console.log('Created three synthetic PDF fixtures; no live scans or API calls.');
