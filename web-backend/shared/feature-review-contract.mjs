import {SCENE_MODEL,SCENE_REVISION} from './scene-provider-contract.mjs';
import {SCENE_MODEL as LEGACY_MODEL,SCENE_REVISION as LEGACY_REVISION} from './scene-contract.mjs';
import {unsupportedVisualFinding,WITHHELD_VISUAL_NOTE,ordinaryPeopleDifference,PEOPLE_DIFFERENCE_NOTE} from './visual-finding-quality.mjs';
export const FEATURE_REVIEW_VERSION='visual-features-v1';
export const ANOMALY_REVIEW_VERSION='visual-anomalies-simple-v1';
export const isCurrentFeatureReview=data=>data?.model_version===SCENE_MODEL&&data.anomaly_review_version===ANOMALY_REVIEW_VERSION;
export const FEATURE_LABELS={eyes:'Eyes and facial details',shape:'Anatomy, shape and proportions',texture:'Surface textures and boundaries',lighting:'Lighting, shadows and reflections',scene:'Object and environmental consistency'};
export const FEATURE_NOTE='These are separate visual-model observations, not verified edits or the classifier’s reasons. They may be wrong and do not change the result.';
export function normalizeFeatureReview(data,hash){
  const grounded=[ANOMALY_REVIEW_VERSION,'visual-anomalies-v3-tentative-1','visual-anomalies-v3','visual-anomalies-v2'].includes(data?.anomaly_review_version);
  const current=data?.anomaly_review_version===ANOMALY_REVIEW_VERSION;
  if(data?.anomaly_review_version!==undefined&&!grounded)throw new Error('Unknown anomaly review version.');
  if(data?.schema_version!==1||data.review_version!==FEATURE_REVIEW_VERSION||data.status!=='completed'||
     !((data.model_version===SCENE_MODEL&&data.model_revision===SCENE_REVISION)||(data.model_version===LEGACY_MODEL&&data.model_revision===LEGACY_REVISION))||
     !/^[a-f0-9]{64}$/.test(data.input_sha256||'')||(hash&&hash!==data.input_sha256)||
     data.changes_verdict!==false||data.classifier_reason!==false||data.validation_status!=='not_validated'||
     !Array.isArray(data.findings)||data.findings.length!==5)throw new Error('Invalid feature review.');
  const types=['photograph_like','illustration','logo_graphic','screenshot','document','uncertain'];
  if(data.image_type!==undefined&&!types.includes(data.image_type))throw new Error('Invalid visual image type.');
  const seen=new Set();
  const findings=data.findings.map(item=>{
    if(!item||!Object.hasOwn(FEATURE_LABELS,item.category)||seen.has(item.category)||
       !['possible_concern','no_clear_concern','unable_to_assess'].includes(item.status)||
       typeof item.observation!=='string'||!item.observation.trim()||item.observation.length>600||
       /[\u0000-\u001f\u007f]/.test(item.observation))throw new Error('Invalid visual finding.');
    if(item.status==='possible_concern'&&(
      item.observation.trim().split(/\s+/).length<6||!/[.!?]$/.test(item.observation.trim())||
      /\b(ai[ -]generated|authentic|fake|deepfake|photoshop\w*|manipulat\w*|proof|proves?|definitely|certainly)\b/i.test(item.observation)))
      throw new Error('Unsupported visual claim.');
    seen.add(item.category);
    if(grounded){
      const validText=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
      if(!validText(item.location,120)||!validText(item.reason,300))throw new Error('Invalid anomaly details.');
      if(item.status==='possible_concern'&&(!item.location.trim()||item.reason.trim().split(/\s+/).length<5||!/[.!?]$/.test(item.reason.trim())||
        item.reason.trim().toLowerCase()===item.observation.trim().toLowerCase()||
        /\b(ai[ -]generated|authentic|fake|deepfake|photoshop\w*|manipulat\w*|proof|proves?|definitely|certainly)\b/i.test(item.reason+' '+item.location)))throw new Error('Unsupported anomaly explanation.');
      if(item.status!=='possible_concern'&&(item.location||item.reason))throw new Error('Unexpected concern details.');
    }
    // Apply to saved records too, so previously displayed mistakes disappear
    // without another inference request or a review-version migration.
    if(item.status==='possible_concern'&&unsupportedVisualFinding(item))return {
      category:item.category,status:'unable_to_assess',observation:ordinaryPeopleDifference(item)?PEOPLE_DIFFERENCE_NOTE:WITHHELD_VISUAL_NOTE,
      ...(grounded?{location:'',reason:''}:{}),
    };
    // Also protect historical saved records and responses from an older service.
    if(item.status==='possible_concern'&&(/\b((?:cannot|can.t|unable to) (?:reliably )?(?:assess|tell|determine|see|judge|evaluate|identify|confirm|verify)|not sure|no clear (?:indication|evidence|sign)|no (?:clear |visible )?(?:visual )?(?:anomal\w*|inconsisten\w*|concern\w*))\b/i.test(item.observation+' '+(grounded?item.reason:''))||
      (grounded&&(/\b(no (?:visible |clear )?(?:anomal\w*|inconsisten\w*|concern\w*)|(?:appears?|looks?|is|are) (?:visually )?normal|consistent with|plausible (?:occlusion|interaction)|does not (?:show|have|exhibit|indicate) (?:any |a )?(?:visible |clear )?(?:anomal\w*|inconsisten\w*|concern\w*))\b/i.test(item.observation+' '+item.reason)||
        /\b(sign|symbol|logo|arrow)\b.{0,150}\b(should|supposed to|standard|typical|convention\w*)\b/i.test(item.reason)))))
      return {category:item.category,status:'unable_to_assess',observation:'This check is inconclusive because the model did not provide a consistent visual observation.',...(grounded?{location:'',reason:''}:{})};
    return {category:item.category,status:item.status,observation:item.observation,...(grounded?{location:item.location.trim(),reason:item.reason.trim()}:{})};
  });
  if(current){
    const evidence={
      eyes:/\b(eye\w*|pupil\w*|iris\w*|irises|face|facial)\b/i,
      shape:/\b(anatom\w*|bod\w*|person|human|arm\w*|hand\w*|finger\w*|limb\w*|leg\w*|torso|head|shape\w*|proportion\w*|outline\w*|boundar\w*|structur\w*|connect\w*|continu\w*|geometry|geometric|frame\w*|edge\w*|bend\w*|bent|straight|angle\w*|contour\w*)\b/i,
      texture:/\b(textur\w*|surface\w*|boundar\w*|edge\w*|pattern\w*|detail\w*|grain\w*|smooth\w*|rough\w*|blend\w*|dissolv\w*)\b/i,
      lighting:/\b(light\w*|shadow\w*|reflect\w*|illumin\w*|bright\w*|dark\w*|highlight\w*|glow\w*)\b/i,
      scene:/\b(object\w*|environment\w*|surround\w*|contact|interact\w*|position\w*|perspectiv\w*|align\w*|connect\w*|boundar\w*|road|surface\w*|solid|carry\w*|carri\w*|hold\w*|support\w*|stand\w*|animal\w*|goat\w*|float\w*|intersect\w*|pass\w*)\b/i,
    };
    const stop=new Set(['image','appears','appear','looks','which','where','there','their','these','those','while','could','would','other','around','about','unusual','visible','clearly','seems','because']);
    const words=text=>new Set((text.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(word=>!stop.has(word)).map(word=>word.slice(0,5)));
    const intersection=(a,b)=>[...a].filter(word=>b.has(word)).length;
    const overlap=(a,b)=>a.size&&b.size?intersection(a,b)/new Set([...a,...b]).size:0;
    const accepted=[];
    for(const item of findings){
      if(item.status!=='possible_concern')continue;
      const observation=words(item.observation),reason=words(item.reason);
      const offTopic=![item.observation,item.reason].every(text=>evidence[item.category].test(text));
      const duplicate=accepted.some(old=>overlap(observation,words(old.observation))>=.65||(overlap(observation,words(old.observation))>=.45&&overlap(words(item.location),words(old.location))>=.5));
      if(offTopic||duplicate)Object.assign(item,{status:'unable_to_assess',observation:'This finding was withheld because it was repeated or its explanation did not clearly match the stated visual issue.',location:'',reason:''});
      else accepted.push(item);
    }
  }
  if(grounded){
    let shown=0;
    for(const item of findings)if(item.status==='possible_concern'&&++shown>2)Object.assign(item,{
      status:'unable_to_assess',observation:'Additional observation not shown: this review keeps at most two separate findings.',location:'',reason:''});
  }
  return {schema_version:1,review_version:FEATURE_REVIEW_VERSION,status:'completed',model_version:data.model_version,
    model_revision:data.model_revision,input_sha256:data.input_sha256,findings,changes_verdict:false,
    ...(data.image_type?{image_type:data.image_type}:{}),classifier_reason:false,validation_status:'not_validated',...(grounded?{anomaly_review_version:data.anomaly_review_version}:{})};
}
