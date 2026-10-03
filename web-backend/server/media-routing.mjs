// Route by persisted metadata, never by trying providers until one succeeds.
export function createMediaRouter({isCloud,provider,local,emulator,cloudFactory}){
  const selected=isCloud?provider:'storage-emulator';
  if(!['local-disk','cloudinary','storage-emulator'].includes(selected)||isCloud&&selected==='storage-emulator')throw new Error('Invalid media provider.');
  let cloud;
  const get=name=>{
    if(!isCloud){if(name!=='storage-emulator')throw new Error('Cloud media cannot be read in emulator mode.');return emulator;}
    if(name==='local-disk')return local;
    if(name==='cloudinary')return cloud??=cloudFactory();
    throw new Error('Unknown media provider; refusing fallback.');
  };
  return {provider:selected,bucket:get(selected),forRecord:record=>get(record.media_provider??(isCloud?'local-disk':'storage-emulator'))};
}
