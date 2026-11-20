import {readFile,writeFile} from 'node:fs/promises';
import {cert} from 'firebase-admin/app';
const key=JSON.parse(await readFile(new URL('../.secrets/firebase-admin.json',import.meta.url),'utf8'));
if(key.project_id!=='authentiscan-bc704')throw new Error('Unexpected project');
const {access_token}=await cert(key).getAccessToken();
const base='https://identitytoolkit.googleapis.com/admin/v2/projects/authentiscan-bc704/config';
const headers={Authorization:'Bearer '+access_token,'Content-Type':'application/json'};
const beforeResponse=await fetch(base,{headers,signal:AbortSignal.timeout(20000)}),before=await beforeResponse.json();
if(!beforeResponse.ok)throw new Error('Cannot read registration policy: HTTP '+beforeResponse.status);
const mode=process.argv[2]||'--check';
if(['--lock','--unlock'].includes(mode)){
 const backup=new URL('../../output/verify-first-registration-20261114/firebase-policy-before-'+Date.now()+'.json',import.meta.url);
 await writeFile(backup,JSON.stringify({project:key.project_id,disabledUserSignup:before.client?.permissions?.disabledUserSignup===true},null,2));
 const response=await fetch(base+'?updateMask=client.permissions.disabledUserSignup',{method:'PATCH',headers,body:JSON.stringify({client:{permissions:{disabledUserSignup:mode==='--lock'}}}),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok)throw new Error('Policy update failed: HTTP '+response.status+' '+data.error?.status);
}
const response=await fetch(base,{headers,signal:AbortSignal.timeout(20000)}),after=await response.json();
if(!response.ok)throw new Error('Cannot verify signup policy');
const disabled=after.client?.permissions?.disabledUserSignup===true;
if(mode==='--lock'&&!disabled)throw new Error('Direct signup is still enabled');
console.log(JSON.stringify({project:key.project_id,clientSignupDisabled:disabled,emailPasswordSignInEnabled:after.signIn?.email?.enabled===true,operation:mode}));
