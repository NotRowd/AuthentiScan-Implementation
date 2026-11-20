import {mkdir,writeFile} from 'node:fs/promises';
import {reportFixture} from './report-layout-fixtures.mjs';
import report from '../server/scanReport.cjs';
import {withDigitalEditingDisplay} from '../shared/digital-editing-display.mjs';
import {mapTruthScanClassification} from '../shared/truthscan-policy.mjs';
const {scan,original,heatmap}=await reportFixture();const out=new URL('../../output/digital-editing-display-20261116/pdf/',import.meta.url);await mkdir(out,{recursive:true});
for(const [name,label,confidence]of [['edited-96','Digitally Edited',96.04],['edited-60','Digitally Edited',60],['edited-low','Digitally Edited',55.5]]){
 const record={...scan,...mapTruthScanClassification({final_result:label,final_label_confidence:confidence}),provider_review:{text:'Synthetic layout example: compare the highlighted region with the original image. This is not a real detection result.'},localization:null,gradcam:null,feature_review:null,object_detection:null,scene_analysis:null};
 const grouped=withDigitalEditingDisplay({status:'completed',analysis:record});
 const pdf=await report.buildScanReport({...record,...grouped.analysis},name==='authentic'?null:heatmap,new Date('2026-11-15T08:00:00Z'),name==='authentic'?null:heatmap,{originalImage:original});
 await writeFile(new URL(name+'.pdf',out),pdf);
}
console.log('Created three synthetic PDF fixtures; no live scans or API calls.');
