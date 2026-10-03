import {readFileSync} from 'node:fs';
import {v2 as cloudinary} from 'cloudinary';

export const CLOUD_NAME='fyicw41z';
const MAX_BYTES=10*1024*1024;
const PREFIX='authentiscan-bc704/';
const mediaError=code=>Object.assign(new Error('Protected cloud media unavailable.'),{code});
export function mediaId(name){
  if(typeof name!=='string'||!/^users\/[A-Za-z0-9_-]{1,128}\/(?:scans\/[a-f0-9-]{36}\/(?:original|heatmap\.png)|storage-tests\/[a-f0-9-]{36})$/.test(name))throw new Error('Invalid private media path.');
  return PREFIX+name;
}
export function loadCloudinaryCredentials(){
  let c;
  try{c=JSON.parse(readFileSync(new URL('../.secrets/cloudinary.json',import.meta.url),'utf8'));}
  catch{throw new Error('Save Cloudinary credentials in .secrets/cloudinary.json.');}
  if(c.cloud_name!==CLOUD_NAME||typeof c.api_key!=='string'||!/^\d+$/.test(c.api_key)||typeof c.api_secret!=='string'||c.api_secret.length<10||c.api_secret.includes('PASTE_'))throw new Error('Cloudinary credentials are incomplete or belong to another cloud.');
  return {cloud_name:CLOUD_NAME,api_key:c.api_key,api_secret:c.api_secret,secure:true};
}

// Raw authenticated assets retain exact input bytes, without image transformations.
// Signed URLs stay server-side; the app's API verifies owner UID before download.
export function createCloudinaryMedia(credentials,{sdk=cloudinary,fetcher=fetch}={}){
  const options={...credentials,resource_type:'raw',type:'authenticated',timeout:60000};
  return {
    async getFiles(){try{await sdk.api.ping({...options});return [[]];}catch{throw mediaError('CLOUD_MEDIA_UNAVAILABLE');}},
    file(name){
      const public_id=mediaId(name);
      return {
        async save(bytes){
          if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_BYTES)throw new Error('Invalid media content or size.');
          let result;
          try{result=await new Promise((resolve,reject)=>{
            const stream=sdk.uploader.upload_stream({...options,public_id,overwrite:false,unique_filename:false,use_filename:false},(e,r)=>e?reject(e):resolve(r));
            stream.on('error',reject);stream.end(bytes);
          });}catch{throw mediaError('CLOUD_MEDIA_UPLOAD_FAILED');}
          if(result?.existing)throw mediaError('EEXIST');
          if(result?.public_id!==public_id||result?.type!=='authenticated'||result?.resource_type!=='raw'||result?.bytes!==bytes.length)throw mediaError('CLOUD_MEDIA_INVALID_RESPONSE');
        },
        async download(){
          try{
            const url=sdk.utils.private_download_url(public_id,undefined,{...options,expires_at:Math.floor(Date.now()/1000)+60});
            const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(45000)});
            if(!response.ok){await response.body?.cancel();throw mediaError(response.status===404?'ENOENT':'CLOUD_MEDIA_DOWNLOAD_FAILED');}
            const chunks=[];let size=0;
            for await(const chunk of response.body){size+=chunk.length;if(size>MAX_BYTES)throw mediaError('CLOUD_MEDIA_TOO_LARGE');chunks.push(Buffer.from(chunk));}
            if(!size)throw mediaError('CLOUD_MEDIA_EMPTY');
            return [Buffer.concat(chunks)];
          }catch(e){throw mediaError(e.code?.startsWith('CLOUD_MEDIA_')||e.code==='ENOENT'?e.code:'CLOUD_MEDIA_DOWNLOAD_FAILED');}
        },
        async delete({ignoreNotFound=false}={}){
          let result;
          try{result=await sdk.uploader.destroy(public_id,{...options,invalidate:true});}catch{throw mediaError('CLOUD_MEDIA_DELETE_FAILED');}
          if(result?.result==='ok'||(ignoreNotFound&&result?.result==='not found'))return;
          throw mediaError(result?.result==='not found'?'ENOENT':'CLOUD_MEDIA_DELETE_FAILED');
        },
      };
    },
  };
}
