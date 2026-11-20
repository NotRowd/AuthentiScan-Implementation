import multer from 'multer';
import sharp from 'sharp';
import {effectivePlan} from './billing-config.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
export async function normalizeAvatar(bytes){
  if(!bytes?.length||bytes.length>2*1024*1024)throw fail(400,'Choose a profile photo up to 2 MB after cropping.');
  try{
    const image=sharp(bytes,{limitInputPixels:16000000,failOn:'error'}),meta=await image.metadata();
    if(!['jpeg','png','webp'].includes(meta.format)||(meta.pages||1)>1)throw new Error();
    const output=await image.rotate().resize(256,256,{fit:'cover'}).flatten({background:'#ffffff'}).jpeg({quality:82}).toBuffer();
    return 'data:image/jpeg;base64,'+output.toString('base64');
  }catch{throw fail(400,'Choose a valid, non-animated JPEG, PNG, or WebP photo (up to 16 million pixels).');}
}
export function avatarRoutes(router,{db}){
  const upload=multer({storage:multer.memoryStorage(),limits:{files:1,fields:0,fileSize:2*1024*1024}}).single('image');
  async function save(req,res,avatar){
    const user=await db.runTransaction(async tx=>{
      const current=await tx.get(req.userRef);
      if(!current.exists||current.data().status!=='active')throw fail(403,'Account unavailable.');
      const changes={avatar_url:avatar,updated_at:new Date().toISOString()};
      tx.update(req.userRef,changes);
      return {...current.data(),...changes,user_id:req.account.uid};
    });
    res.json({success:true,data:{user:{...user,email_verification_required:req.emailVerification?.required===true,email_verified:req.emailVerification?.verified===true},plan:effectivePlan(user)}});
  }
  router.put('/auth/me/avatar',upload,wrap(async(req,res)=>{
    if(!req.file)throw fail(400,'Choose a profile photo.');
    await save(req,res,await normalizeAvatar(req.file.buffer));
  }));
  router.delete('/auth/me/avatar',wrap(async(req,res)=>{
    if(Object.keys(req.body||{}).length)throw fail(400,'No profile fields are allowed here.');
    await save(req,res,null);
  }));
}
