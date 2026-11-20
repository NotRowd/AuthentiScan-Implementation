import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {normalizeLocalization,MESORCH_LOCALIZER_MODEL} from '../shared/localization-contract.mjs';
import {validateLocalizationMask} from './localization-mask.mjs';

// Both browser and PDF must overlay the very same upright, owner-protected input.
export async function localizationPreview(original,metadata,maskBytes=null){
  const result=normalizeLocalization(metadata,createHash('sha256').update(original).digest('hex'));
  if(result.status!=='available'&&!(result.status==='uncertain'&&result.score_grid))throw new Error('No candidate-region preview is available.');
  const decoder=sharp(original,{limitInputPixels:16000000,failOn:'error'});
  const meta=await decoder.metadata(),swapped=[5,6,7,8].includes(meta.orientation);
  if((swapped?meta.height:meta.width)!==result.image_width ||
     (swapped?meta.width:meta.height)!==result.image_height)throw new Error('Localization geometry mismatch.');
  const image=await decoder.rotate().flatten({background:'#ffffff'})
    .resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  if(result.model_version!==MESORCH_LOCALIZER_MODEL)return image;
  if(result.status!=='available')return image;
  await validateLocalizationMask(maskBytes,result);
  const imageMeta=await sharp(image).metadata();
  const resizedMask=await sharp(maskBytes,{limitInputPixels:16000000,failOn:'error'})
    .resize(imageMeta.width,imageMeta.height,{fit:'fill',kernel:'nearest'}).greyscale().raw().toBuffer();
  const overlay=Buffer.alloc(imageMeta.width*imageMeta.height*4);
  for(let pixel=0,offset=0;pixel<resizedMask.length;pixel++,offset+=4){
    if(resizedMask[pixel]===255){overlay[offset]=249;overlay[offset+1]=115;overlay[offset+2]=22;overlay[offset+3]=112;}
  }
  const layer=await sharp(overlay,{raw:{width:imageMeta.width,height:imageMeta.height,channels:4}}).png().toBuffer();
  return sharp(image).composite([{input:layer}]).png().toBuffer();
}
