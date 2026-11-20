import {LOCALIZER_MODEL,LOCALIZER_SCOPE} from '../shared/localization-contract.mjs';
export function localizationFixture(hash='a'.repeat(64)){
  return {schema_version:1,status:'available',reason:null,model_version:LOCALIZER_MODEL,scope:LOCALIZER_SCOPE,
    input_sha256:hash,policy_sha256:'b'.repeat(64),threshold:.05,coordinate_space:'normalized_upright_rgb',
    image_width:32,image_height:32,grid_shape:[32,32],mask:Array.from({length:1024},(_,i)=>i<16?1:0)};
}
