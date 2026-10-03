// Only this run's random synthetic object can be removed by this test.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createCloudinaryMedia,loadCloudinaryCredentials,mediaId,CLOUD_NAME} from '../server/cloudinary-media.mjs';
assert.equal(process.env.AUTHENTISCAN_LIVE_TEST,'yes','Explicit live test opt-in required.');
const storage=createCloudinaryMedia(loadCloudinaryCredentials());
const name=`users/cloudinary_verification/storage-tests/${randomUUID()}`;
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
let uploaded=false;
try{
  await storage.getFiles();console.log('Cloudinary credential check passed.');
  await storage.file(name).save(bytes);uploaded=true;
  assert.deepEqual((await storage.file(name).download())[0],bytes);
  for(const type of ['authenticated','upload']){
    const response=await fetch(`https://res.cloudinary.com/${CLOUD_NAME}/raw/${type}/${mediaId(name)}`,{redirect:'error',signal:AbortSignal.timeout(15000)});
    assert.ok([401,403,404].includes(response.status),'Unsigned media must be denied');await response.body?.cancel();
  }
  await assert.rejects(()=>storage.file(name).save(Buffer.from('must not overwrite')),{code:'EEXIST'});
  assert.deepEqual((await storage.file(name).download())[0],bytes);
  console.log('Protected upload, exact-byte download, unsigned access denial, and overwrite protection passed.');
}catch(e){console.error('Cloudinary live test failed:',e.code||e.name);process.exitCode=1;}
finally{if(uploaded){try{await storage.file(name).delete();console.log('Only this test\'s synthetic Cloudinary image was removed.');}catch{console.error('Synthetic test cleanup failed; test object retained:',mediaId(name));process.exitCode=1;}}}
