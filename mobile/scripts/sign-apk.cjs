// Sign the locally built APK with a persistent, private key. Never print passwords.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const project = path.resolve(__dirname, '..');
const signing = path.join(project, '.android-signing');
const output = path.resolve(process.argv[2] || path.join(project, '../../output/mobile-apk-20261118/AuthentiScan-1.0.0.apk'));
const source = path.join(project, 'android/app/build/outputs/apk/release/app-release.apk');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk || !process.env.JAVA_HOME) throw new Error('Set ANDROID_HOME and JAVA_HOME.');
if (!fs.existsSync(source)) throw new Error('Build :app:assembleRelease first.');
fs.mkdirSync(signing, {recursive:true});
const settingsPath = path.join(signing, 'credentials.json');
const key = path.join(signing, 'authentiscan-release.jks');
const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath,'utf8')) : {alias:'authentiscan',password:crypto.randomBytes(32).toString('hex')};
if (!fs.existsSync(settingsPath)) fs.writeFileSync(settingsPath,JSON.stringify(settings),{mode:0o600});
const env = {...process.env, AUTHENTISCAN_SIGNING_PASSWORD:settings.password};
function run(command,args) {
  const result = spawnSync(command,args,{env,encoding:'utf8',windowsHide:true,shell:false});
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || result.error?.message || 'Signing command failed').replaceAll(settings.password,'[redacted]'));
  return result.stdout;
}
if (!fs.existsSync(key)) run(path.join(process.env.JAVA_HOME,'bin/keytool.exe'),['-genkeypair','-noprompt','-keystore',key,'-storetype','JKS','-storepass:env','AUTHENTISCAN_SIGNING_PASSWORD','-keypass:env','AUTHENTISCAN_SIGNING_PASSWORD','-alias',settings.alias,'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=AuthentiScan Android, OU=Mobile, O=AuthentiScan, C=PH']);
const tools = path.join(sdk,'build-tools','37.0.0','lib','apksigner.jar');
fs.mkdirSync(path.dirname(output),{recursive:true});
run(path.join(process.env.JAVA_HOME,'bin/java.exe'),['-jar',tools,'sign','--ks',key,'--ks-key-alias',settings.alias,'--ks-pass','env:AUTHENTISCAN_SIGNING_PASSWORD','--key-pass','env:AUTHENTISCAN_SIGNING_PASSWORD','--out',output,source]);
console.log(run(path.join(process.env.JAVA_HOME,'bin/java.exe'),['-jar',tools,'verify','--verbose','--print-certs',output]));
console.log('APK: '+output);
console.log('SHA256: '+crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
