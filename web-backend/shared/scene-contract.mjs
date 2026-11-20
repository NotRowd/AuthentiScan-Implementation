export const SCENE_MODEL='smolvlm-500m-scene-v1';
export const SCENE_REVISION='a7da5b986cb59b408707209984f360a5f4ad7e47';
export const SCENE_EXPLANATION_VERSION=2;
export const SCENE_IMAGE_TYPES={logo:'Logo / graphic',photograph:'Photograph-like image',illustration:'Illustration / artwork',screenshot:'Screenshot / interface',document:'Document / text',uncertain:'Uncertain'};
export const sceneContextNote=kind=>['logo','illustration'].includes(kind)
  ?'Stylized shapes are expected in logos and artwork; they are not evidence of manipulation by themselves.'
  :'A scene description cannot establish whether an image was edited or AI-generated.';
export const SCENE_DISCLAIMER='Tentative model observation; it may miss or invent details. An unusual scene is not proof of AI generation or manipulation.';
export function normalizeScene(data,hash){
  if(data?.schema_version!==1||data.status!=='available'||data.assessment!=='tentative'||
    data.model_version!==SCENE_MODEL||data.model_revision!==SCENE_REVISION||data.changes_verdict!==false||
    !/^[a-f0-9]{64}$/.test(data.input_sha256||'')||(hash&&data.input_sha256!==hash)||
    typeof data.observation!=='string'||!data.observation.trim()||data.observation.length>1600||
    /[\u0000-\u001f\u007f]/.test(data.observation))throw new Error('Invalid scene observation.');
  const structured={};
  if(data.explanation_version!==undefined){
    if(data.explanation_version!==SCENE_EXPLANATION_VERSION||!Object.hasOwn(SCENE_IMAGE_TYPES,data.image_type)||
      typeof data.visual_assessment!=='string'||!data.visual_assessment.trim()||data.visual_assessment.length>1600||
      /[\u0000-\u001f\u007f]/.test(data.visual_assessment))throw new Error('Invalid structured scene explanation.');
    Object.assign(structured,{explanation_version:SCENE_EXPLANATION_VERSION,image_type:data.image_type,visual_assessment:data.visual_assessment});
  }
  return {schema_version:1,status:'available',assessment:'tentative',model_version:SCENE_MODEL,model_revision:SCENE_REVISION,...structured,
    input_sha256:data.input_sha256,observation:data.observation,disclaimer:SCENE_DISCLAIMER,changes_verdict:false};
}
