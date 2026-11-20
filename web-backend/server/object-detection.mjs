export const DETECTOR_MODEL='ssdlite320-mobilenetv3-coco-v1';
export const unavailableObjects=()=>({schema_version:1,status:'unavailable',reason:'service_unavailable',objects:[]});

export function normalizeObjects(data){
  const fraction=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
  if(data?.schema_version!==1||data.status!=='available'||data.model_version!==DETECTOR_MODEL||data.dataset!=='COCO'||
    data.threshold!==.5||data.max_detections!==20||typeof data.truncated!=='boolean'||data.coordinate_space!=='normalized_xyxy_raw_rgb'||
    ![data.image_width,data.image_height].every(n=>Number.isInteger(n)&&n>0&&n<=16000000)||data.image_width*data.image_height>16000000||
    !Array.isArray(data.objects)||data.objects.length>20)throw new Error('Invalid object detection metadata.');
  const objects=data.objects.map(o=>{
    if(typeof o.label!=='string'||! /^[a-z ]{1,40}$/.test(o.label)||!Number.isInteger(o.class_id)||o.class_id<1||o.class_id>90||
       !fraction(o.score)||o.score<.5||!Array.isArray(o.box)||o.box.length!==4||!o.box.every(fraction)||o.box[2]<=o.box[0]||o.box[3]<=o.box[1])throw new Error('Invalid object detection.');
    return {label:o.label,class_id:o.class_id,score:o.score,box:[...o.box]};
  });
  return {schema_version:1,status:'available',model_version:DETECTOR_MODEL,dataset:'COCO',threshold:.5,max_detections:20,
    image_width:data.image_width,image_height:data.image_height,coordinate_space:data.coordinate_space,truncated:data.truncated,objects};
}

export function detectorBase(){
  const url=new URL(process.env.OBJECT_DETECTOR_URL||'http://127.0.0.1:5003');
  if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Only a loopback object detector is allowed.');
  return url.origin;
}
export async function objectReadiness(){
  try{const response=await fetch(detectorBase()+'/health',{redirect:'error',signal:AbortSignal.timeout(1500)});const data=await response.json();return response.ok&&data.service==='authentiscan-object-detector'&&data.model_loaded===true&&data.model_version===DETECTOR_MODEL?'ready':'not_ready';}catch{return 'unavailable';}
}
export async function detectObjects(bytes){
  const response=await fetch(detectorBase()+'/detect',{method:'POST',body:bytes,headers:{'Content-Type':'application/octet-stream','X-AuthentiScan-Detector':'local-object-detection-v1'},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Object detector unavailable.');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>32000)throw new Error('Object response too large.');chunks.push(Buffer.from(chunk));}
  const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(payload.success!==true)throw new Error('Invalid object response.');
  return {...normalizeObjects(payload.data),detected_at:new Date().toISOString()};
}
