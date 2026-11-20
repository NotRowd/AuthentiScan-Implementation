// Separate evidence stream: never derives a mask from class scores or object boxes.
export const LOCALIZER_MODEL='trail-dinov2s14-flux1dev-v1';
export const EXPERIMENTAL_LOCALIZER_MODEL='supervised-dinov2s14-flux1dev-v1-experimental';
export const EXPERIMENTAL_HEAD_SHA='a5568dc4839b10c72074e70978ffe435e66560e2f13d03d5a931e0277068abad';
export const MESORCH_LOCALIZER_MODEL='mesorch-p-118-capstone-preview-v1';
export const MESORCH_CHECKPOINT_SHA='efa61592f2c783698a8760c2d3e48dc58c1b4890c50dbcdc166b24425a197674';
export const MESORCH_MASK_ASSET='localization-mask.png';
export const MESORCH_SCOPE='pixel_level_forensic_edit_localization';
export const MESORCH_VALIDATION_STATUS='development_gates_failed';
export const EXPERIMENTAL_WARNING='Experimental prototype — validation failed. This model missed all candidate regions in 61 of 80 edited validation images and had poor mask overlap. Do not use it as reliable manipulation evidence.';
export const LOCALIZER_SCOPE='experimental_flux1dev_partial_edits';
export const unavailableLocalization=(reason='candidate_not_approved')=>({schema_version:1,status:'unavailable',reason});
export const unavailableMesorchLocalization=(reason='service_unavailable')=>({schema_version:1,status:'unavailable',reason,model_version:MESORCH_LOCALIZER_MODEL,validation_status:MESORCH_VALIDATION_STATUS});
const unavailableReasons=new Set(['candidate_not_approved','validation_pending','service_unavailable','invalid_response','not_recorded','analysis_failed','storage_failed']);
export function normalizeLocalization(data,expectedHash){
  if(data?.schema_version!==1)throw new Error('Invalid localization schema.');
  if(data.status==='unavailable'){
    if(!unavailableReasons.has(data.reason))throw new Error('Invalid localization availability.');
    if(data.model_version===MESORCH_LOCALIZER_MODEL){
      if(data.validation_status!==MESORCH_VALIDATION_STATUS)throw new Error('Invalid unavailable pixel-localization response.');
      return unavailableMesorchLocalization(data.reason);
    }
    if(data.model_version!==undefined)throw new Error('Invalid unavailable localization model.');
    return unavailableLocalization(data.reason);
  }
  if(data.model_version===MESORCH_LOCALIZER_MODEL){
    const base=data.schema_version===1&&['available','uncertain'].includes(data.status)&&
      data.scope===MESORCH_SCOPE&&data.coordinate_space==='normalized_upright_rgb'&&
      data.checkpoint_sha256===MESORCH_CHECKPOINT_SHA&&data.validation_status===MESORCH_VALIDATION_STATUS&&
      /^[a-f0-9]{64}$/.test(data.input_sha256||'')&&(!expectedHash||data.input_sha256===expectedHash)&&
      Number.isFinite(data.threshold)&&data.threshold===.5&&
      [data.image_width,data.image_height].every(n=>Number.isInteger(n)&&n>0)&&
      data.image_width*data.image_height<=16000000&&
      Number.isInteger(data.highlighted_pixels)&&data.highlighted_pixels>=0&&data.highlighted_pixels<=data.image_width*data.image_height&&
      Number.isFinite(data.highlighted_fraction)&&data.highlighted_fraction>=0&&data.highlighted_fraction<=1&&
      Math.abs(data.highlighted_fraction-data.highlighted_pixels/(data.image_width*data.image_height))<1e-6;
    if(!base)throw new Error('Invalid pixel-localization metadata.');
    const result={schema_version:1,status:data.status,model_version:MESORCH_LOCALIZER_MODEL,scope:MESORCH_SCOPE,
      coordinate_space:'normalized_upright_rgb',input_sha256:data.input_sha256,checkpoint_sha256:MESORCH_CHECKPOINT_SHA,
      validation_status:MESORCH_VALIDATION_STATUS,threshold:.5,image_width:data.image_width,image_height:data.image_height,
      highlighted_pixels:data.highlighted_pixels,highlighted_fraction:data.highlighted_fraction};
    if(data.status==='uncertain'){
      if(!['no_candidate_region','diffuse_response','constant_input','invalid_scores'].includes(data.reason)||
        data.mask_asset!==null||data.mask_sha256!==null)throw new Error('Invalid inconclusive pixel-localization response.');
      return {...result,reason:data.reason,mask_asset:null,mask_sha256:null};
    }
    if(data.reason!==null||data.mask_asset!==MESORCH_MASK_ASSET||
      !/^[a-f0-9]{64}$/.test(data.mask_sha256||'')||data.highlighted_pixels===0||
      data.highlighted_pixels===data.image_width*data.image_height)throw new Error('Invalid pixel-localization mask metadata.');
    return {...result,reason:null,mask_asset:MESORCH_MASK_ASSET,mask_sha256:data.mask_sha256};
  }
  const experimental=data.model_version===EXPERIMENTAL_LOCALIZER_MODEL;
  if(experimental&&(data.usage_mode!=='experimental'||data.validation_status!=='failed'||data.release_approved!==false||data.model_sha256!==EXPERIMENTAL_HEAD_SHA||data.threshold!==.97))throw new Error('Missing experimental disclosure or wrong candidate.');
  if(!['available','uncertain'].includes(data.status)||(!experimental&&data.model_version!==LOCALIZER_MODEL)||
    data.scope!==LOCALIZER_SCOPE||data.coordinate_space!=='normalized_upright_rgb'||
    !/^[a-f0-9]{64}$/.test(data.input_sha256||'')||(expectedHash&&data.input_sha256!==expectedHash)||
    !/^[a-f0-9]{64}$/.test(data.policy_sha256||'')||
    !Number.isFinite(data.threshold)||data.threshold<=0||data.threshold>=2||
    ![data.image_width,data.image_height].every(n=>Number.isInteger(n)&&n>0)||data.image_width*data.image_height>16000000||
    !Array.isArray(data.grid_shape)||data.grid_shape.length!==2||data.grid_shape.some(n=>n!==32))throw new Error('Invalid localization metadata.');
  const result={schema_version:1,status:data.status,model_version:data.model_version,scope:data.scope,
    coordinate_space:data.coordinate_space,input_sha256:data.input_sha256,policy_sha256:data.policy_sha256,
    threshold:data.threshold,image_width:data.image_width,image_height:data.image_height,grid_shape:[32,32]};
  if(experimental)Object.assign(result,{usage_mode:'experimental',validation_status:'failed',release_approved:false,model_sha256:data.model_sha256});
  if(data.score_grid!==undefined||data.score_scale!==undefined){
    if(!experimental||data.score_scale!==10000||!Array.isArray(data.score_grid)||data.score_grid.length!==1024||
      data.score_grid.some(n=>!Number.isInteger(n)||n<0||n>10000))throw new Error('Invalid localization score preview.');
    Object.assign(result,{score_scale:10000,score_grid:[...data.score_grid]});
  }
  if(data.status==='uncertain'){
    if(!['no_candidate_region','diffuse_response'].includes(data.reason)||data.mask!==null)throw new Error('Invalid uncertain localization.');
    return {...result,reason:data.reason,mask:null};
  }
  if(data.reason!==null||!Array.isArray(data.mask)||data.mask.length!==1024||data.mask.some(n=>n!==0&&n!==1))throw new Error('Invalid localization mask.');
  const count=data.mask.reduce((a,b)=>a+b,0);
  if(count===0||count===1024)throw new Error('Empty/diffuse maps must abstain.');
  return {...result,reason:null,mask:[...data.mask]};
}

// Display-only exploration. Never changes the saved status, mask or classifier.
export function localizationScoreMask(data,cutoff=.5){
  const result=normalizeLocalization(data);
  if(!result.score_grid||!Number.isFinite(cutoff)||cutoff<.01||cutoff>.99)throw new Error('Invalid display threshold.');
  return result.score_grid.map(value=>Number(value>=Math.round(cutoff*result.score_scale)));
}

export function localizationMessage(data){
  if(!data)return 'Not assessed for this saved scan. No manipulated-region finding is available.';
  if(data.model_version===MESORCH_LOCALIZER_MODEL&&data.status==='available')return 'Orange highlights mark image regions flagged for review by a separate pixel-level model. It may miss edits or highlight original content; this does not change the classification.';
  if(data.status==='available')return 'Magenta cells mark candidate edited regions from a separate experimental model. The grid is coarse, not an exact boundary or proof of AI generation.';
  if(data.status==='uncertain')return data.reason==='diffuse_response'
    ?'The response covers the whole grid; no reliable local boundary is shown. This does not establish that the entire image is AI-generated.'
    :'No reliable candidate region is shown. This does not prove that the image is authentic or unedited.';
  if(data.reason==='validation_pending')return 'Not available yet: the localization candidate is still being evaluated. No manipulation mask has been generated for this scan.';
  if(data.reason==='candidate_not_approved')return 'No localization model is approved for use yet. The evaluated candidate did not reliably locate edits, so no manipulation mask is shown. Classification and Grad-CAM remain separate.';
  if(data.reason==='not_recorded')return 'Not assessed for this saved scan. No manipulated-region finding is available.';
  return 'Localization could not complete. The classification and Grad-CAM results are separate and remain unchanged.';
}
