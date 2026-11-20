// Read-only replay using exact deployed frontend helper files copied to /tmp.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {db,auth} from '/app/server/firebase.mjs';
import {normalizeFeatureReview} from '/app/shared/feature-review-contract.mjs';
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const contextUrl=moduleUrl(readFileSync('/tmp/visual-review-context.mjs','utf8').replace("'./scene-provider-contract.mjs'","'file:///app/shared/scene-provider-contract.mjs'"));
const {visualReviewContext}=await import(contextUrl);
const paragraphUrl=moduleUrl(readFileSync('/tmp/visual-review-paragraph.mjs','utf8')
 .replace("'./visual-review-context.mjs'",JSON.stringify(contextUrl))
 .replace("'./visual-finding-quality.mjs'","'file:///app/shared/visual-finding-quality.mjs'"));
const {visualReviewParagraph}=await import(paragraphUrl);
const account=await auth.getUserByEmail('kentamielle31@gmail.com');
const rows=await db.collection('users').doc(account.uid).collection('scans').where('scan_number','in',[36,37]).get();
assert.equal(rows.size,2);
for(const doc of rows.docs){
 const row=doc.data(),review=normalizeFeatureReview(row.feature_review,row.file_sha256);
 assert.equal(visualReviewContext(review,row.scene_analysis),'graphic');
 const text=visualReviewParagraph(review,row.scene_analysis);
 assert.match(text,/designed graphic or collage/);
 assert.doesNotMatch(text,/eyes.*different color/i);
 console.log(JSON.stringify({scan_number:row.scan_number,context:'graphic',paragraph:text}));
}
await db.terminate();
