import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createLocalMedia} from '../server/local-media.mjs';
import {dataMode,requireCloudEnvironment,CLOUD_FIREBASE_CONFIG} from '../cloud-config.mjs';
import {localEnvironment} from '../local-config.mjs';

test('cloud mode is explicit, pinned to the real project, and cannot use emulator endpoints',()=>{
  assert.equal(dataMode({}),'emulator');assert.throws(()=>dataMode({AUTHENTISCAN_DATA_MODE:'production'}));
  const safe={AUTHENTISCAN_DATA_MODE:'cloud-hybrid',GCLOUD_PROJECT:'authentiscan-bc704'};
  assert.doesNotThrow(()=>requireCloudEnvironment(safe));
  for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','STORAGE_EMULATOR_HOST','FIREBASE_CONFIG'])assert.throws(()=>requireCloudEnvironment({...safe,[key]:'localhost:9000'}));
  assert.throws(()=>requireCloudEnvironment({...safe,GCLOUD_PROJECT:'other-project'}));
  assert.throws(()=>localEnvironment(safe));
  assert.equal(CLOUD_FIREBASE_CONFIG.projectId,'authentiscan-bc704');assert.equal(CLOUD_FIREBASE_CONFIG.storageBucket,undefined);
});
test('disk media saves exact bytes privately, survives reopening, and never overwrites an existing image',async()=>{
  const folder=await mkdtemp(path.join(os.tmpdir(),'authentiscan-media-test-'));
  try{
    const storage=createLocalMedia(folder),name=`users/test_user/scans/${randomUUID()}/original`,bytes=Buffer.from('synthetic image');
    await storage.file(name).save(bytes);assert.deepEqual((await storage.file(name).download())[0],bytes);
    assert.deepEqual((await createLocalMedia(folder).file(name).download())[0],bytes);
    await assert.rejects(()=>storage.file(name).save(Buffer.from('overwrite')),{code:'EEXIST'});
    assert.deepEqual((await storage.file(name).download())[0],bytes);
    assert.equal((await readdir(path.dirname(path.join(folder,name)))).some(n=>n.startsWith('.pending-')),false);
    await storage.file(name).delete();await storage.file(name).delete({ignoreNotFound:true});
    await assert.rejects(()=>storage.file(name).download(),{code:'ENOENT'});
  }finally{await rm(folder,{recursive:true});} // Only the exact freshly-created test directory.
});
test('disk media rejects traversal, invalid owners, oversized content and linked folders',async()=>{
  const folder=await mkdtemp(path.join(os.tmpdir(),'authentiscan-path-test-'));
  try{
    const storage=createLocalMedia(folder);
    for(const name of ['../secret','users/../original','C:/secret','users/x/scans/../../secret','users/x/files/test','users/x/scans/x/original'])assert.throws(()=>storage.file(name));
    const name=`users/test_user/scans/${randomUUID()}/original`;
    await assert.rejects(()=>storage.file(name).save(Buffer.alloc(10*1024*1024+1)));
    await writeFile(path.join(folder,'outside-test'),'safe');
    const linked=path.join(folder,'users');
    await symlink(folder,linked,process.platform==='win32'?'junction':'dir');
    await assert.rejects(()=>storage.file(name).save(Buffer.from('bad')));
    assert.equal(await readFile(path.join(folder,'outside-test'),'utf8'),'safe');
  }finally{await rm(folder,{recursive:true});}
});
