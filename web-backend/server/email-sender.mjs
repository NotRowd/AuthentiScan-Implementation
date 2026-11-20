import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHmac} from 'node:crypto';
import nodemailer from 'nodemailer';

// Secrets stay in backend memory; never return or log SMTP errors/credentials.
let pending;
export function loadEmailSender(){
  if(!pending)pending=load().catch(()=>{pending=null;throw Object.assign(new Error('Email sender unavailable'),{status:503,code:'EMAIL_DELIVERY_UNAVAILABLE'});});
  return pending;
}
async function load(){
  let email=process.env.AUTHENTISCAN_SMTP_USER,password=process.env.AUTHENTISCAN_SMTP_PASSWORD;
  if(!email&&!password&&process.platform==='win32'){
    const script=fileURLToPath(new URL('../scripts/read-email-sender.ps1',import.meta.url));
    const raw=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-BackendPipe'],
      {windowsHide:true,timeout:10000,maxBuffer:8192},(err,stdout)=>err?reject(new Error('Sender unavailable')):resolve(stdout)));
    ({email,password}=JSON.parse(raw));
  }
  if(typeof email!=='string'||! /^[a-z0-9][a-z0-9._%+\-]{0,63}@gmail\.com$/i.test(email)||! /^[a-z]{16}$/.test(password))throw new Error('Invalid sender');
  const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,
    tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},auth:{user:email,pass:password},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
    logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
  return {key:createHmac('sha256',password).update('AuthentiScan email verification v1').digest(),
    async send(to,code){
      if(typeof to!=='string'||to.length>254||! /^[^\s<>,;:"\\]+@[^\s<>,;:"\\]+\.[^\s<>,;:"\\]+$/.test(to)||! /^\d{6}$/.test(code))throw new Error('Invalid email');
      try{
        const result=await transport.sendMail({from:{name:'AuthentiScan',address:email},to:[{address:to}],
          subject:'Your AuthentiScan verification code',
          text:`Your AuthentiScan email verification code is: ${code}\n\nThis code expires in 10 minutes and can be used once. Do not share it. If you did not request this, ignore this email.\n\nAuthentiScan`});
        if(!result.accepted?.length)throw new Error('Not accepted');
      }catch{throw Object.assign(new Error('Email delivery unavailable'),{status:503,code:'EMAIL_DELIVERY_UNAVAILABLE'});}
    }};
}
