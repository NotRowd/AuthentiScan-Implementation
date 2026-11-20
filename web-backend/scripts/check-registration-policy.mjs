import {readFile} from 'node:fs/promises';
import {cert} from 'firebase-admin/app';
const key=JSON.parse(await readFile(new URL('../.secrets/firebase-admin.json',import.meta.url),'utf8'));
if(key.project_id!=='authentiscan-bc704')throw new Error('Unexpected project');
const {access_token}=await cert(key).getAccessToken();
const response=await fetch('https://identitytoolkit.googleapis.com/admin/v2/projects/authentiscan-bc704/config',{headers:{Authorization:'Bearer '+access_token}});
const body=await response.json();
console.log(JSON.stringify({status:response.status,clientSignupDisabled:body.client?.permissions?.disabledUserSignup===true,subtype:body.subtype,errorStatus:body.error?.status}));
