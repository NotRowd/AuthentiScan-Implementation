// Illustration and scores are synthetic layout fixtures, not real model predictions.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import report from '../server/scanReport.cjs';
import {prepareReportImages} from '../server/report-images.mjs';
import {experimentalFixture} from './experimental-localization-fixture.mjs';
import {objectFixture} from './object-fixture.mjs';
import {featureFixture} from './feature-review-fixture.mjs';
import {SCENE_MODEL,SCENE_REVISION} from '../shared/scene-contract.mjs';
export async function reportFixture(){
  const svg=`<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="480" fill="#d9edf5"/><rect y="320" width="640" height="160" fill="#b5d2bd"/><path d="M0 320L155 150L310 320M270 320L460 110L640 320" fill="#94b8b0"/><circle cx="95" cy="82" r="32" fill="#f7d780"/><rect x="242" y="230" width="96" height="142" rx="20" fill="#247da0"/><circle cx="290" cy="190" r="41" fill="#d79e78"/><path d="M266 367L260 436M313 367L327 436M247 255L200 328M328 255L367 325" stroke="#334a62" stroke-width="22" stroke-linecap="round"/><ellipse cx="465" cy="375" rx="54" ry="30" fill="#b17d50"/><circle cx="511" cy="355" r="24" fill="#b17d50"/><path d="M515 336L537 345L525 364" fill="#6a4b33"/><path d="M430 392L425 431M489 392L494 431" stroke="#6a4b33" stroke-width="12"/><text x="20" y="30" font-family="sans-serif" font-size="17" fill="#25495c">ILLUSTRATIVE SAMPLE - NOT A REAL ANALYSIS</text></svg>`;
  const original=await sharp(Buffer.from(svg)).png().toBuffer(),hash=createHash('sha256').update(original).digest('hex');
  const overlay=Buffer.from('<svg width="640" height="480"><defs><radialGradient id="heat"><stop stop-color="#ffff00" stop-opacity=".65"/><stop offset=".4" stop-color="#00ff00" stop-opacity=".4"/><stop offset="1" stop-color="#0000ff" stop-opacity=".35"/></radialGradient></defs><rect width="640" height="480" fill="url(#heat)"/></svg>');
  const heatmap=await sharp(original).composite([{input:overlay}]).png().toBuffer();
  const localization={...experimentalFixture(hash),image_width:640,image_height:480,
    mask:Array.from({length:1024},(_,i)=>i%32>=11&&i%32<17&&Math.floor(i/32)>=10&&Math.floor(i/32)<25?1:0)};
  const scan={scan_id:'12345678-1234-4234-9234-123456789012',scan_number:12,result_id:'fixture',status:'completed',
    original_file_name:'illustrative-sample.png',created_at:'2026-10-10T05:00:00Z',analyzed_at:'2026-10-10T05:00:20Z',file_sha256:hash,
    feature_review:featureFixture(hash),
    verdict:'ai_generated',authentic_score:.18,ai_generated_score:.82,confidence_score:.82,model_version:'loyd-classifier-v1-research',
    decision_rule:'manuscript_min_score_v1',minimum_class_score:.6,decision_threshold:.5,uncertainty_margin:.1,
    policy_version:'sha256:f56f876dbf8234b6',preprocessing_version:'exif-white-rgb-pillow-bilinear-224-v2',
    gradcam:{status:'available',target:'ai_generated',palette:'blue-green-yellow-v1',reason:null},localization,
    object_detection:{...objectFixture(),objects:[{class_id:1,label:'person',score:.92,box:[.29,.29,.60,.94]},{class_id:18,label:'dog',score:.81,box:[.63,.68,.86,.93]}]},
    scene_analysis:{schema_version:1,status:'available',assessment:'tentative',model_version:SCENE_MODEL,model_revision:SCENE_REVISION,input_sha256:hash,
      explanation_version:2,image_type:'illustration',visual_assessment:'Not assessed for artwork.',observation:'An illustrated person and dog stand outdoors, with mountains and a sun in the background. This description and all scores in this sample report are illustrative, not actual model findings.',changes_verdict:false}};
  return {scan,original,heatmap};
}
export async function writeReportFixtures(){
  const {scan,original,heatmap}=await reportFixture();
  scan.feature_review.findings[0]={category:'eyes',status:'possible_concern',observation:'Synthetic fixture: a bright glow appears around the eye area.'};
  const exported=new Date('2026-10-10T05:05:00Z');
  const variants={sample:scan,uncertain:{...scan,verdict:'uncertain',authentic_score:.52,ai_generated_score:.48,gradcam:{status:'unavailable',target:null,reason:'uncertain_prediction'},localization:{...scan.localization,status:'uncertain',reason:'no_candidate_region',mask:null}},
    missing:{...scan,scene_analysis:null,feature_review:null,object_detection:null,localization:null,gradcam:null},
    failed:{...scan,status:'failed',result_id:null,analysis_error:{message:'The AI service was unavailable. No scan credit was used.'}},
    invalid:{...scan,feature_review:{...scan.feature_review,changes_verdict:true,findings:[]},scene_analysis:{...scan.scene_analysis,changes_verdict:true,observation:'INVALID SCENE MUST NOT APPEAR'},object_detection:{...scan.object_detection,objects:[{label:'invented',score:2,box:[0,0,1,1]}]},localization:{...scan.localization,mask:[1]}},
    long:{...scan,original_file_name:'Long filename \u{1f50e} '.repeat(10)+'.png',scene_analysis:{...scan.scene_analysis,observation:('This is a long saved description used to check report pagination and readability. ').repeat(19)},object_detection:{...scan.object_detection,truncated:true,objects:Array.from({length:20},(_,i)=>({...scan.object_detection.objects[i%2],label:'a long object category name for wrapping'}))}}};
  variants.long.feature_review={...scan.feature_review,findings:scan.feature_review.findings.map(item=>({...item,status:'possible_concern',observation:('Synthetic fixture: an unusual bright edge appears along this surface. ').repeat(8).trim()}))};
  await mkdir('.test-results/report-layout',{recursive:true});
  await mkdir('../output/pdf',{recursive:true});
  for(const [name,record] of Object.entries(variants)){
    const images=name==='missing'?{}:await prepareReportImages(original,record);
    const pdf=await report.buildScanReport(record,name==='missing'?null:heatmap,exported,images.localizationImage,images);
    await writeFile(`.test-results/report-layout/${name}.pdf`,pdf);
    if(name==='sample')await writeFile('../output/pdf/AuthentiScan-sample-report.pdf',pdf);
  }
}
if(process.argv[1]?.endsWith('report-layout-fixtures.mjs'))await writeReportFixtures();
