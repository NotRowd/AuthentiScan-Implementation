import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import {avatarRoutes,normalizeAvatar} from '../server/avatar.mjs';

test('avatar decoding rejects nonimages/oversize and normalizes to a bounded JPEG without metadata',async()=>{
  for(const bytes of [Buffer.from('<svg/>'),Buffer.alloc(2*1024*1024+1)])await assert.rejects(()=>normalizeAvatar(bytes),{status:400});
  const input=await sharp({create:{width:800,height:400,channels:4,background:'#0ea5e9'}}).png().toBuffer();
  const result=await normalizeAvatar(input),bytes=Buffer.from(result.split(',')[1],'base64'),meta=await sharp(bytes).metadata();
  assert.match(result,/^data:image\/jpeg;base64,/);assert.equal(meta.width,256);assert.equal(meta.height,256);assert.equal(meta.exif,undefined);assert.ok(bytes.length<100000);
});
test('avatar upload/removal updates only the authenticated profile and preserves plan and names',async()=>{
  let profile={uid:'owner',first_name:'Alex',last_name:'Rivera',plan:'Pro',status:'active'};
  const ref={};const db={runTransaction:async callback=>callback({get:async actual=>{assert.equal(actual,ref);return {exists:true,data:()=>({...profile})};},update:(actual,changes)=>{assert.equal(actual,ref);profile={...profile,...changes};}})};
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.account={uid:'owner'};req.userRef=ref;next();});avatarRoutes(app,{db});app.use((err,_req,res,_next)=>res.status(err.status||400).json({message:err.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  try{
    const input=await sharp({create:{width:100,height:100,channels:3,background:'#00ff00'}}).png().toBuffer();
    const form=new FormData();form.append('image',new Blob([input],{type:'image/png'}),'photo.png');
    let r=await fetch(base+'/auth/me/avatar',{method:'PUT',body:form});assert.equal(r.status,200);let result=await r.json();assert.equal(result.data.user.user_id,'owner');assert.match(profile.avatar_url,/^data:image\/jpeg;/);assert.equal(profile.plan,'Pro');assert.equal(profile.first_name,'Alex');
    const prior=profile.avatar_url;const bad=new FormData();bad.append('image',new Blob(['not a photo'],{type:'image/png'}),'bad.png');r=await fetch(base+'/auth/me/avatar',{method:'PUT',body:bad});assert.equal(r.status,400);assert.equal(profile.avatar_url,prior);
    const override=new FormData();override.append('image',new Blob([input]),'photo.png');override.append('uid','other');r=await fetch(base+'/auth/me/avatar',{method:'PUT',body:override});assert.equal(r.status,400);assert.equal(profile.avatar_url,prior);
    r=await fetch(base+'/auth/me/avatar',{method:'DELETE'});assert.equal(r.status,200);assert.equal(profile.avatar_url,null);assert.equal(profile.plan,'Pro');
    profile.status='disabled';r=await fetch(base+'/auth/me/avatar',{method:'DELETE'});assert.equal(r.status,403);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
