import {createHash} from 'node:crypto';
import {normalizeLocalization,unavailableLocalization,unavailableMesorchLocalization,MESORCH_LOCALIZER_MODEL,MESORCH_MASK_ASSET} from '../shared/localization-contract.mjs';
import {MAX_LOCALIZATION_MASK_BYTES,validateLocalizationMask} from './localization-mask.mjs';
export {normalizeLocalization,unavailableLocalization};

function loopbackOrigin(value){
  const url=new URL(value);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Only a loopback localization service is allowed.');
  return url.origin;
}
export function localizationBase(){
  return loopbackOrigin(process.env.LOCALIZATION_SERVICE_URL||'http://127.0.0.1:5004');
}
function mesorchBase(){
  return loopbackOrigin(process.env.MESORCH_LOCALIZATION_SERVICE_URL||'http://127.0.0.1:5014');
}
async function readJsonLimited(response,limit){
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw new Error('Oversized localization response.');chunks.push(Buffer.from(chunk));}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function localizeMesorch(bytes){
  if(process.env.AUTHENTISCAN_LOCALIZATION_ENABLED!=='1')return unavailableMesorchLocalization('service_unavailable');
  try{
    const response=await fetch(mesorchBase()+'/localize',{method:'POST',body:bytes,
      headers:{'Content-Type':'application/octet-stream','X-AuthentiScan-Localizer':'localization-v1'},
      redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Unavailable');
    const payload=await readJsonLimited(response,12*1024*1024);
    if(payload.success!==true||payload.data?.model_version!==MESORCH_LOCALIZER_MODEL)throw new Error('Invalid pixel-localization response.');
    let data=payload.data,maskPng=null;
    // The Windows CPU handoff uses its original wire schema and upright coordinates.
    if(data.schema_version==='mesorch-demo/1'&&data.coordinate_space==='upright_rgb'){
      data={...data,schema_version:1,coordinate_space:'normalized_upright_rgb',scope:'pixel_level_forensic_edit_localization'};
      if(data.status==='uncertain'&&['constant_input','invalid_scores'].includes(data.reason)){
        data={...data,highlighted_pixels:0,highlighted_fraction:0};
      }
    }
    if(data.status==='available'){
      const encoded=data.mask_png_base64;
      if(typeof encoded!=='string'||encoded.length>Math.ceil(MAX_LOCALIZATION_MASK_BYTES/3)*4||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw new Error('Invalid encoded localization mask.');
      maskPng=Buffer.from(encoded,'base64');
      if(maskPng.toString('base64')!==encoded)throw new Error('Invalid localization mask encoding.');
      data={...data,mask_asset:MESORCH_MASK_ASSET,mask_sha256:createHash('sha256').update(maskPng).digest('hex')};
    }else if(data.status==='uncertain')data={...data,mask_asset:null,mask_sha256:null};
    const result=normalizeLocalization(data,createHash('sha256').update(bytes).digest('hex'));
    if(maskPng)await validateLocalizationMask(maskPng,result);
    return maskPng?{...result,mask_png:maskPng}:result;
  }catch{return unavailableMesorchLocalization('service_unavailable');}
}
export async function localizeImage(bytes){
  const mode=process.env.AUTHENTISCAN_LOCALIZATION_MODE;
  if(mode==='mesorch-p')return localizeMesorch(bytes);
  // A failed model requires a separate explicit prototype mode; it is not approved.
  const experimental=mode==='experimental';
  if(process.env.AUTHENTISCAN_LOCALIZATION_ENABLED!=='1'&&!experimental)return unavailableLocalization();
  try{
    const response=await fetch(localizationBase()+'/localize',{method:'POST',body:bytes,
      headers:{'Content-Type':'application/octet-stream','X-AuthentiScan-Localizer':'localization-v1'},
      redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Unavailable');
    const payload=await readJsonLimited(response,32000);
    if(payload.success!==true)throw new Error('Invalid response');
    const result=normalizeLocalization(payload.data,createHash('sha256').update(bytes).digest('hex'));
    if(result.usage_mode==='experimental'&&!experimental)throw new Error('Experimental mode is not enabled.');
    if(experimental&&result.status!=='unavailable'&&result.usage_mode!=='experimental')throw new Error('Unexpected model for prototype mode.');
    return result;
  }catch{return unavailableLocalization('service_unavailable');}
}
