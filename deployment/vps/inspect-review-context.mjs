import {db,auth} from '/app/server/firebase.mjs';
const account=await auth.getUserByEmail('kentamielle31@gmail.com');
const rows=await db.collection('users').doc(account.uid).collection('scans').orderBy('created_at','desc').limit(4).get();
for(const doc of rows.docs){const row=doc.data();console.log(JSON.stringify({scan_number:row.scan_number,review_type:row.feature_review?.image_type,scene_type:row.scene_analysis?.image_type,description:row.scene_analysis?.observation,findings:row.feature_review?.findings?.filter(f=>f.status==='possible_concern')}));}
await db.terminate();
