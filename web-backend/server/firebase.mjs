import { requireLocalEnvironment, PROJECT_ID, BUCKET } from '../local-config.mjs';
import { initializeApp,cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dataMode,requireCloudEnvironment,CLOUD_PROJECT_ID,CLOUD_FIREBASE_CONFIG} from '../cloud-config.mjs';
import {createLocalMedia} from './local-media.mjs';
import {createCloudinaryMedia,loadCloudinaryCredentials} from './cloudinary-media.mjs';
import {createMediaRouter} from './media-routing.mjs';

export const isCloud=dataMode()==='cloud-hybrid';
let options;
if(isCloud){
  requireCloudEnvironment(process.env);
  let key;
  try{key=JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS||fileURLToPath(new URL('../.secrets/firebase-admin.json',import.meta.url)),'utf8'));}
  catch{throw new Error('Save the private Firebase Admin JSON as .secrets/firebase-admin.json. Never put it in src/public or paste it into chat.');}
  if(key.type!=='service_account'||key.project_id!==CLOUD_PROJECT_ID||typeof key.private_key!=='string'||typeof key.client_email!=='string')throw new Error('The credential must be a service account for authentiscan-bc704.');
  options={projectId:CLOUD_PROJECT_ID,credential:cert(key)};
}else{
  requireLocalEnvironment(process.env);
  options={projectId: PROJECT_ID, storageBucket: BUCKET};
}
export const firebaseApp = initializeApp(options);
const app=firebaseApp;
export const auth = getAuth(app);
export const db = getFirestore(app);
let configuredMedia='local-disk';
if(isCloud){
  try{configuredMedia=JSON.parse(readFileSync(new URL('../media-config.json',import.meta.url),'utf8')).provider;}
  catch(e){if(e.code!=='ENOENT')throw new Error('Invalid media-config.json.');}
}
const media=createMediaRouter({isCloud,provider:configuredMedia,
  local:isCloud?createLocalMedia(fileURLToPath(new URL('../.local-media/authentiscan-bc704',import.meta.url))):null,
  emulator:isCloud?null:getStorage(app).bucket(),
  cloudFactory:()=>createCloudinaryMedia(loadCloudinaryCredentials()),
});
export const bucket=media.bucket,mediaProvider=media.provider,mediaForRecord=media.forRecord;
export const publicConfig=isCloud?{mode:'cloud-hybrid',media:mediaProvider,firebase:CLOUD_FIREBASE_CONFIG,authEmulatorUrl:null}:{mode:'emulator',media:mediaProvider,firebase:{projectId:PROJECT_ID,apiKey:'local-test-key',appId:'authentiscan-local-web'},authEmulatorUrl:'http://127.0.0.1:9099'};

export async function emulatorHealth() {
  const results = await Promise.allSettled([
    auth.listUsers(1),
    db.doc('_health/probe').get(),
    bucket.getFiles({maxResults: 1}),
  ]);
  const names = ['authentication', 'firestore', 'storage'];
  return Object.fromEntries(results.map((r, i) => [names[i], r.status === 'fulfilled']));
}
