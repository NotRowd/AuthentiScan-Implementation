import {createHash} from 'node:crypto';
import sharp from 'sharp';

export const MAX_LOCALIZATION_MASK_BYTES=8*1024*1024;

// Validate the private, upright, single-channel binary mask before saving or compositing it.
export async function validateLocalizationMask(bytes,metadata){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_LOCALIZATION_MASK_BYTES)throw new Error('Invalid localization mask size.');
  const sha=createHash('sha256').update(bytes).digest('hex');
  if(sha!==metadata?.mask_sha256)throw new Error('Localization mask checksum mismatch.');
  const decoder=sharp(bytes,{limitInputPixels:16000000,failOn:'error'});
  const info=await decoder.metadata();
  if(info.format!=='png'||info.width!==metadata.image_width||info.height!==metadata.image_height||info.channels!==1||info.pages>1)throw new Error('Localization mask geometry or format mismatch.');
  const {data,info:rawInfo}=await decoder.greyscale().raw().toBuffer({resolveWithObject:true});
  if(rawInfo.channels!==1||data.length!==metadata.image_width*metadata.image_height)throw new Error('Invalid localization mask pixels.');
  let count=0;
  for(const pixel of data){if(pixel===255)count++;else if(pixel!==0)throw new Error('Localization mask is not binary.');}
  if(count!==metadata.highlighted_pixels)throw new Error('Localization mask count mismatch.');
  return bytes;
}
