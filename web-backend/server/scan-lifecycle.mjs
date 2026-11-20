const number = value => Number.isSafeInteger(value) && value > 0 ? value : 0;
const fail = (status,message) => Object.assign(new Error(message),{status});

// Upgrade existing records oldest-first without deriving display IDs from pagination.
// Small transactions keep migration bounded; the account counter serializes concurrent requests.
export async function ensureScanNumbers(db,user) {
  const snapshot=await user.collection('scans').get();
  const docs=[...snapshot.docs].sort((a,b)=>String(a.data().created_at||'').localeCompare(String(b.data().created_at||''))||a.id.localeCompare(b.id));
  const highest=docs.reduce((max,doc)=>Math.max(max,number(doc.data().scan_number)),0);
  const missing=docs.filter(doc=>!number(doc.data().scan_number));
  if(!missing.length)return snapshot;
  for(let offset=0;offset<missing.length;offset+=200){
    const batch=missing.slice(offset,offset+200);
    await db.runTransaction(async tx=>{
      const account=await tx.get(user);
      if(!account.exists||account.data().status!=='active')throw fail(403,'Account unavailable.');
      const current=[];
      for(const doc of batch)current.push(await tx.get(doc.ref));
      let last=Math.max(highest,number(account.data().last_scan_number));
      for(const doc of current){
        if(!doc.exists)continue;
        if(number(doc.data().scan_number)){last=Math.max(last,doc.data().scan_number);continue;}
        if(!Number.isSafeInteger(last+1))throw fail(409,'Scan number limit reached.');
        tx.update(doc.ref,{scan_number:++last});
      }
      tx.update(user,{last_scan_number:last});
    });
  }
  return user.collection('scans').get();
}

// No soft-delete success: a temporary flag only keeps partial failures retryable.
// Allowance documents and the account's monotonically increasing counter are untouched.
export async function hardDeleteScan({db,user,uid,scanId,mediaForRecord}) {
  if(typeof uid!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(uid)||typeof scanId!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(scanId))throw fail(400,'Invalid scan ID.');
  if(user.path!==`users/${uid}`)throw fail(403,'Account mismatch.');
  const ref=user.collection('scans').doc(scanId);
  const record=await db.runTransaction(async tx=>{
    const account=await tx.get(user), snapshot=await tx.get(ref);
    if(!account.exists||account.data().status!=='active')throw fail(403,'Account unavailable.');
    if(!snapshot.exists)throw fail(404,'Scan not found. It may already have been deleted.');
    const row=snapshot.data();
    if(row.owner_uid!==uid||row.scan_id!==scanId)throw fail(403,'Scan ownership could not be verified.');
    if(!['completed','failed'].includes(row.status))throw fail(409,'This scan is still processing. Refresh History and wait for it to finish before deleting.');
    tx.update(ref,{deleting:true});
    return row;
  });
  try{
    const media=mediaForRecord(record);
    // Always try both: even a failed upload can leave a partial original or heatmap.
    for(const file of ['original','heatmap.png','localization-mask.png'])await media.file(`users/${uid}/scans/${scanId}/${file}`).delete({ignoreNotFound:true});
    await db.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(current.exists){
        if(!current.data().deleting||current.data().owner_uid!==uid)throw new Error('Deletion state changed');
        tx.delete(ref);
      }
    });
  }catch{
    throw Object.assign(fail(503,'Deletion is incomplete. Some files may already be removed. Retry Delete to finish; your used scan credits have not changed.'),{code:'SCAN_DELETE_INCOMPLETE'});
  }
  return {scan_id:scanId,scan_number:record.scan_number};
}
