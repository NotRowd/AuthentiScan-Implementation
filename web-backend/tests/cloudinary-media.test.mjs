import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {createCloudinaryMedia,mediaId} from '../server/cloudinary-media.mjs';
import {createMediaRouter} from '../server/media-routing.mjs';
const name=`users/test_user/scans/${randomUUID()}/original`;
const credentials={cloud_name:'test',api_key:'123',api_secret:'not-a-real-secret'};

test('record routing preserves legacy files and never falls back on cloud errors',async()=>{
  const local={},cloud={file:()=>({download:async()=>{throw new Error('offline');}})},emulator={};
  const router=createMediaRouter({isCloud:true,provider:'cloudinary',local,cloudFactory:()=>cloud});
  assert.equal(router.bucket,cloud);assert.equal(router.forRecord({}),local);
  assert.equal(router.forRecord({media_provider:'local-disk'}),local);
  await assert.rejects(()=>router.forRecord({media_provider:'cloudinary'}).file(name).download());
  assert.throws(()=>router.forRecord({media_provider:'unknown'}));
  const rollback=createMediaRouter({isCloud:true,provider:'local-disk',local,cloudFactory:()=>cloud});
  assert.equal(rollback.forRecord({media_provider:'cloudinary'}),cloud);
  const testOnly=createMediaRouter({isCloud:false,provider:'cloudinary',emulator,cloudFactory:()=>{throw new Error('Cloud must not initialize');}});
  assert.equal(testOnly.bucket,emulator);assert.equal(testOnly.forRecord({}),emulator);
  assert.throws(()=>testOnly.forRecord({media_provider:'cloudinary'}));
});
test('upload forces private raw assets, exclusive paths, bounded bytes and redacted errors',async()=>{
  let passed;
  const sdk={uploader:{upload_stream:(options,callback)=>{
    passed=options;const stream=new PassThrough();let size=0;
    stream.on('data',b=>size+=b.length);stream.on('finish',()=>callback(null,{public_id:options.public_id,resource_type:'raw',type:'authenticated',bytes:size}));return stream;
  }}};
  const media=createCloudinaryMedia(credentials,{sdk});
  await media.file(name).save(Buffer.from('exact bytes'));
  assert.equal(passed.overwrite,false);assert.equal(passed.type,'authenticated');assert.equal(passed.resource_type,'raw');
  assert.equal(passed.public_id,mediaId(name));assert.equal(passed.transformation,undefined);
  for(const bad of ['../x','users/../../x','https://other','users/x/scans/x/original'])assert.throws(()=>media.file(bad));
  await assert.rejects(()=>media.file(name).save(Buffer.alloc(10*1024*1024+1)));
  sdk.uploader.upload_stream=(_o,callback)=>{const stream=new PassThrough();stream.resume();stream.on('finish',()=>callback(new Error('secret-provider-detail')));return stream;};
  await assert.rejects(()=>media.file(name).save(Buffer.from('x')),e=>!e.message.includes('secret-provider-detail')&&e.code==='CLOUD_MEDIA_UPLOAD_FAILED');
});
test('downloads use bounded short-lived server-side URLs and block redirects/errors',async()=>{
  let signed,request;
  const sdk={utils:{private_download_url:(id,format,options)=>{signed={id,format,options};return 'https://example.test/private';}}};
  let response=new Response(Buffer.from('original'));
  const media=createCloudinaryMedia(credentials,{sdk,fetcher:async(_u,opts)=>{request=opts;return response;}});
  assert.equal((await media.file(name).download())[0].toString(),'original');
  assert.equal(signed.options.type,'authenticated');assert.equal(signed.options.resource_type,'raw');
  assert.ok(signed.options.expires_at<=Math.floor(Date.now()/1000)+60);
  assert.equal(request.redirect,'error');
  response=new Response('not found',{status:404});await assert.rejects(()=>media.file(name).download(),{code:'ENOENT'});
  response=new Response(Buffer.alloc(10*1024*1024+1));await assert.rejects(()=>media.file(name).download(),{code:'CLOUD_MEDIA_TOO_LARGE'});
  response=new Response(null);await assert.rejects(()=>media.file(name).download());
});
