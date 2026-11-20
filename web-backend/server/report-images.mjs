import sharp from 'sharp';
import {localizationPreview} from './localization-preview.mjs';

// Input comes only from the owned scan's stored original. No URLs or model calls.
export async function prepareReportImages(bytes,scan,localizationMask=null){
  const images={originalImage:null,objectImage:null,localizationImage:null};
  const decoder=()=>sharp(bytes,{limitInputPixels:16000000,failOn:'error'});
  const options={width:1200,height:1200,fit:'inside',withoutEnlargement:true};
  try{images.originalImage=await decoder().rotate().flatten({background:'#ffffff'}).resize(options).png().toBuffer();}catch{}
  if(scan.status==='completed'&&scan.object_detection?.status==='available'){
    try{
      const meta=await decoder().metadata(),d=scan.object_detection;
      if(meta.width===d.image_width&&meta.height===d.image_height)
        images.objectImage=await decoder().flatten({background:'#ffffff'}).resize(options).png().toBuffer();
    }catch{}
  }
  if(scan.status==='completed'&&scan.localization?.status==='available'){
    try{images.localizationImage=await localizationPreview(bytes,scan.localization,localizationMask);}catch{}
  }
  return images;
}
