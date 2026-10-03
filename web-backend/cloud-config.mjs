// Public Firebase web configuration, not an Admin credential.
export const CLOUD_PROJECT_ID='authentiscan-bc704';
export const CLOUD_FIREBASE_CONFIG=Object.freeze({
  apiKey:'AIzaSyAOhdAC57WuliJ1z3UnnxPCyyLqrTXc_XE',
  authDomain:'authentiscan-bc704.firebaseapp.com',
  projectId:CLOUD_PROJECT_ID,
  messagingSenderId:'103577539770',
  appId:'1:103577539770:web:2463031611a9887bb81e83',
});
export function dataMode(env=process.env){
  const mode=env.AUTHENTISCAN_DATA_MODE||'emulator';
  if(!['emulator','cloud-hybrid'].includes(mode))throw new Error('Unknown AuthentiScan data mode.');
  return mode;
}
export function requireCloudEnvironment(env){
  if(dataMode(env)!=='cloud-hybrid')throw new Error('Cloud mode must be explicitly selected.');
  for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','STORAGE_EMULATOR_HOST','FIREBASE_CONFIG'])
    if(env[key])throw new Error(`Cloud mode cannot use ${key}. Open a fresh terminal.`);
  for(const key of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT'])
    if(env[key]&&env[key]!==CLOUD_PROJECT_ID)throw new Error('Cloud project does not match AuthentiScan.');
}
