export const PROJECT_ID = 'demo-authentiscan-local';
export const BUCKET = PROJECT_ID + '.appspot.com';
export const HOSTS = Object.freeze({
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
});
export function requireLocalEnvironment(env) {
  if(env.AUTHENTISCAN_DATA_MODE&&env.AUTHENTISCAN_DATA_MODE!=='emulator')throw new Error('Emulator mode cannot use cloud configuration.');
  if (env.GCLOUD_PROJECT !== PROJECT_ID || env.GOOGLE_CLOUD_PROJECT !== PROJECT_ID)
    throw new Error('Refusing to run: only the local demo project is allowed.');
  for (const [key, value] of Object.entries(HOSTS)) {
    if (env[key] !== value) throw new Error('Refusing to run: missing or non-local emulator address: ' + key);
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS)
    throw new Error('Remove cloud credentials/configuration before running this local test.');
  // emulators:exec injects its own demo configuration. Permit only that local
  // project; never accept arbitrary configuration paths or cloud project IDs.
  if (env.FIREBASE_CONFIG) {
    let config;
    try { config = JSON.parse(env.FIREBASE_CONFIG); } catch { throw new Error('Non-local Firebase configuration'); }
    if (config.projectId !== PROJECT_ID || (config.storageBucket && config.storageBucket !== BUCKET) || (config.databaseURL && config.databaseURL !== `https://${PROJECT_ID}.firebaseio.com`))
      throw new Error('Non-local Firebase configuration');
  }
}
export function localEnvironment(parent = process.env) {
  if(parent.AUTHENTISCAN_DATA_MODE&&parent.AUTHENTISCAN_DATA_MODE!=='emulator')throw new Error('Open a fresh terminal for emulator mode.');
  // Never silently override a supplied production credential or endpoint.
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_CONFIG'])
    if (parent[key]) throw new Error('Cloud configuration is present: ' + key);
  for (const [key, value] of Object.entries(HOSTS))
    if (parent[key] && parent[key] !== value) throw new Error('Unexpected emulator endpoint: ' + key);
  for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT'])
    if (parent[key] && parent[key] !== PROJECT_ID) throw new Error('Unexpected project: ' + key);
  return {...parent, ...HOSTS, GCLOUD_PROJECT: PROJECT_ID, GOOGLE_CLOUD_PROJECT: PROJECT_ID};
}
