import {mkdir,writeFile} from 'node:fs/promises';
import {reportFixture} from './report-layout-fixtures.mjs';
import report from '../server/scanReport.cjs';
import {mapTruthScanClassification} from '../shared/truthscan-policy.mjs';
import {withDigitalEditingDisplay} from '../shared/digital-editing-display.mjs';
const {scan,original,heatmap}=await reportFixture();
const out=new URL('../../output/pdf-score-fix-20261121/pdf/',import.meta.url);await mkdir(out,{recursive:true});
const variants=[['authentic','Real',97.46],['ai-generated','AI Generated',93.15],['ai-edited','AI Edited',91.25],['uncertain','AI Generated',58.4],['digital','Digitally Edited',96.04],['unsupported','Unknown category',75],['zero','Real',0],['full','AI Generated',100]];
for(const [name,label,confidence]of variants){
 const record={...scan,...mapTruthScanClassification({final_result:label,final_label_confidence:confidence}),original_file_name:'synthetic-export-check.png',provider_review:{text:'Synthetic PDF regression fixture. No real image was analyzed.'},localization:null,gradcam:null,feature_review:null,object_detection:null,scene_analysis:null};
 const grouped=withDigitalEditingDisplay({status:'completed',analysis:record}).analysis;
 await writeFile(new URL(name+'.pdf',out),await report.buildScanReport(grouped,heatmap,new Date('2026-11-21T08:00:00Z'),heatmap,{originalImage:original}));
}
for(const [name,changes]of [['missing',{provider:'truthscan',provider_label:'Real',provider_label_confidence:null,authentic_score:null,ai_generated_score:null}],['invalid',{provider:'truthscan',provider_label:'Real',provider_label_confidence:1.2}],['failed',{status:'failed',result_id:null,provider:'truthscan',provider_label_confidence:.9746}],['class-scores',{}]]){
 await writeFile(new URL(name+'.pdf',out),await report.buildScanReport({...scan,...changes},null,new Date(),null,{originalImage:original}));
}
console.log('12 synthetic PDF fixtures generated; no API calls or scan credits.');
