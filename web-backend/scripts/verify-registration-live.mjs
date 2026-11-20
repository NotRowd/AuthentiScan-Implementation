import {readFile,writeFile} from 'node:fs/promises';
import {CLOUD_FIREBASE_CONFIG} from '../cloud-config.mjs';
const origin='https://authentiscan.52-65-43-68.sslip.io',checks=[];
for(const [path,body]of [
 ['/api/v1/auth/registration/send-code',{email:'not-an-email'}],
 ['/api/v1/auth/registration/send-code',{email:'test@example.invalid',password:'must not be accepted'}],
 ['/api/v1/auth/registration/complete',{email:'test@example.invalid',challenge_id:'11111111-1111-4111-8111-111111111111',code:'000000',firstName:'Test',lastName:'Only',password:'SyntheticOnly!123',accept_terms:true}],
]){
 const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 if(response.status!==400)throw new Error('Unexpected status '+response.status+' at '+path);
 const data=await response.json();checks.push({path,status:response.status,message:data.message});
}
const signup=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+encodeURIComponent(CLOUD_FIREBASE_CONFIG.apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'not-an-email',password:'invalid',returnSecureToken:true}),signal:AbortSignal.timeout(20000)});
const payload=await signup.json();
if(signup.ok||!['ADMIN_ONLY_OPERATION','INVALID_EMAIL'].includes(payload.error?.message))throw new Error('Unexpected direct-signup rejection: '+payload.error?.message);
checks.push({path:'Firebase direct signup',status:signup.status,error:payload.error.message});
const html=await fetch(origin+'/register',{signal:AbortSignal.timeout(20000)});const live=await html.text(),local=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');if(live!==local)throw new Error('Live HTML differs');checks.push({path:'/register',status:html.status,matchesBuild:true});
for(const name of ['App-CGPGBUHc.js','api-jBJBO0rw.js','index-vNZLgioQ.js']){
 const response=await fetch(origin+'/assets/'+name,{signal:AbortSignal.timeout(20000)});const data=Buffer.from(await response.arrayBuffer()),expected=await readFile(new URL('../dist/assets/'+name,import.meta.url));if(!data.equals(expected))throw new Error('Live asset differs '+name);checks.push({path:'/assets/'+name,status:response.status,matchesBuild:true});
}
await writeFile(new URL('../../output/verify-first-registration-20261114/live-checks.json',import.meta.url),JSON.stringify(checks,null,2));
console.log('PASS live registration rejects malformed requests and unknown OTP proof; Firebase rejects malformed signup input; live registration HTML and JS match tested build. Direct-signup policy is verified separately. No accounts or emails created.');
