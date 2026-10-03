import {readFileSync} from 'node:fs';
import {firebaseApp,isCloud,emulatorHealth} from './firebase.mjs';
import {CLOUD_PROJECT_ID} from '../cloud-config.mjs';

export async function checkCloud(){
  if(!isCloud)throw new Error('Cloud preflight requires explicit cloud-hybrid mode.');
  const token=(await firebaseApp.options.credential.getAccessToken()).access_token;
  async function get(path){
    const r=await fetch('https://firebaserules.googleapis.com/v1/'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error(`Cannot verify Firestore security rules (HTTP ${r.status}). Check Firebase rules and this service account's Rules Viewer access.`);
    return r.json();
  }
  const release=await get(`projects/${CLOUD_PROJECT_ID}/releases/cloud.firestore`);
  if(typeof release.rulesetName!=='string'||!release.rulesetName.startsWith(`projects/${CLOUD_PROJECT_ID}/rulesets/`))throw new Error('Unexpected Firestore ruleset.');
  const rules=await get(release.rulesetName);
  const normalize=s=>s.replace(/\/\/[^\n]*/g,'').replace(/\s/g,'');
  const expected=normalize(readFileSync(new URL('../firestore.rules',import.meta.url),'utf8'));
  if(rules.source?.files?.length!==1||normalize(rules.source.files[0].content||'')!==expected)throw new Error('Publish firestore.rules in Firebase Console → Firestore → Rules before starting. Direct client access must be denied; the authenticated backend handles access.');
  const services=await emulatorHealth();
  if(!Object.values(services).every(Boolean))throw new Error('Cloud preflight failed. Check Authentication, Firestore, service-account permissions and the configured media provider.');
  return services;
}
