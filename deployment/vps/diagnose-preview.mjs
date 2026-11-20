import {db,auth,mediaForRecord} from '/app/server/firebase.mjs';
import {localizationPreview} from '/app/server/localization-preview.mjs';
const account=await auth.getUserByEmail('kentamielle31@gmail.com');
const rows=await db.collection('users').doc(account.uid).collection('scans').where('original_file_name','==','makaigo ka ha.png').limit(5).get();
for(const doc of rows.docs){
 const row=doc.data(),uid=doc.ref.parent.parent.id;
 const info={scan_number:row.scan_number,provider:row.media_provider,status:row.status,localization:row.localization?.status};
 const start=Date.now();let original,mask;
 try{[original]=await mediaForRecord(row).file(`users/${uid}/scans/${row.scan_id}/original`).download();info.original_bytes=original.length;info.original_ms=Date.now()-start;}
 catch(e){info.original_error=e.code||e.name;}
 if(original&&row.localization?.status==='available'){
  try{[mask]=await mediaForRecord(row).file(`users/${uid}/scans/${row.scan_id}/localization-mask.png`).download();info.mask_bytes=mask.length;}
  catch(e){info.mask_error=e.code||e.name;}
  try{info.preview_bytes=(await localizationPreview(original,row.localization,mask)).length;}catch(e){info.preview_error=e.message;}
 }
 info.total_ms=Date.now()-start;console.log(JSON.stringify(info));
}
await db.terminate();
