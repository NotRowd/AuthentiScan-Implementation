import {mkdir,writeFile} from 'node:fs/promises';
import {reportFixture} from './report-layout-fixtures.mjs';
import report from '../server/scanReport.cjs';
import {withDigitalEditingDisplay} from '../shared/digital-editing-display.mjs';
import {mapTruthScanClassification} from '../shared/truthscan-policy.mjs';
const {scan,original,heatmap}=await reportFixture();const out=new URL('../../output/original-only-20261117/pdf/',import.meta.url);await mkdir(out,{recursive:true});
for(const [name,label,confidence]of [['authentic','Real',90],['digital','Digitally Edited',96.04],['digital-low','Digitally Edited',55.5],['ai','AI Generated',99]]){
 const record={...scan,...mapTruthScanClassification({final_result:label,final_label_confidence:confidence}),provider_review:{text:'Synthetic example for layout testing only.'},localization:null,gradcam:null,feature_review:null,object_detection:null,scene_analysis:null};
 const grouped=withDigitalEditingDisplay({status:'completed',analysis:record});
 const pdf=await report.buildScanReport({...record,...grouped.analysis},heatmap,new Date('2026-11-16T17:00:00Z'),heatmap,{originalImage:original});
 await writeFile(new URL(name+'.pdf',out),pdf);
}
console.log('Created four synthetic PDFs; no real scans or credits used.');
