// Opt-in only: creates two test accounts and one synthetic scan in the LOCAL backend.
// Native SecureStore/FormData are bridged for Node; Android UI verification remains separate.
if (process.env.AUTHENTISCAN_LIVE_TEST !== '1') throw new Error('Set AUTHENTISCAN_LIVE_TEST=1 to allow local test records.');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
process.env.EXPO_PUBLIC_API_MODE = 'backend';
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5000';
process.env.EXPO_PUBLIC_AI_MEDIA_BASE_URL = 'http://127.0.0.1:5001';
const storage = new Map();
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === 'expo-file-system') return { File: class extends Blob {
    constructor(uri) { super([png], { type: 'image/png' }); this.name = uri.split('/').pop(); }
  } };
  if (name === 'expo-secure-store') return {
    getItemAsync: async k => storage.get(k) ?? null,
    setItemAsync: async (k,v) => { storage.set(k,v); },
    deleteItemAsync: async k => { storage.delete(k); },
  };
  if (name === '@react-native-async-storage/async-storage') return {
    getItem: async () => null, setItem: async () => { throw new Error('Live test must not use offline storage'); }, removeItem: async () => {},
  };
  return originalLoad.call(this, name, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) { crc ^= value; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^0xffffffff)>>>0;
}
function chunk(type, data) {
  const bytes=Buffer.concat([Buffer.from(type),data]), length=Buffer.alloc(4), crc=Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(bytes));
  return Buffer.concat([length,bytes,crc]);
}
const header=Buffer.alloc(13); header.writeUInt32BE(32,0); header.writeUInt32BE(32,4); header[8]=8; header[9]=2;
const pixels=Buffer.alloc(32*(1+32*3));
for(let y=0;y<32;y++) for(let x=0;x<32;x++) { const i=y*97+1+x*3; pixels[i]=x*8; pixels[i+1]=y*8; pixels[i+2]=128; }
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
const NativeFormData=global.FormData;
global.FormData=class extends NativeFormData {
  append(name,value,...rest) {
    if(value && typeof value==='object' && value.uri) return super.append(name,new Blob([png],{type:value.type}),value.name);
    return super.append(name,value,...rest);
  }
};
const auth=require('../services/auth/authService.ts').default;
const session=require('../services/api/session.ts');
const { realScanService }=require('../services/scan/scanService.ts');
const { scanHistoryService:history }=require('../services/scan/scanHistoryService.ts');
const { mediaSource }=require('../services/api/media.ts');
async function main() {
  const db=await (await fetch('http://127.0.0.1:5000/api/v1/database/health')).json();
  assert.equal(db.success,true);
  const ai=await (await fetch('http://127.0.0.1:5001/health')).json();
  assert.equal(ai.model_loaded,true); assert.equal(ai.model_version,'curated-v1-candidate-v1-dev');
  const run=Date.now(), password=crypto.randomBytes(24).toString('base64url');
  const account={firstName:'Mobile',lastName:'Integration Test',email:'mobile.integration.'+run+'@example.test',password};
  const second={...account,email:'mobile.isolation.'+run+'@example.test'};
  const registration=await auth.register(account); assert.equal(registration.success,true,registration.error);
  console.log('Created local test account: '+account.email);
  assert.equal((await auth.getSession()).email,account.email);
  const scan=await realScanService.analyzeImage({uri:'file:///synthetic-integration.png',fileName:'mobile-integration-synthetic.png',mimeType:'image/png',fileSize:png.length});
  assert.equal(scan.status,'completed'); assert.equal(scan.hasAnalysis,true);
  assert.equal(scan.modelVersion,'curated-v1-candidate-v1-dev');
  const page=await history.getPage(); assert.equal(page.pagination.total,1); assert.equal(page.scans[0].id,scan.id);
  const stats=await history.getStats(); assert.equal(stats.total_scans,1); assert.equal(stats.scans_remaining,4);
  const original=await mediaSource(scan.imagePath); const imageResponse=await fetch(original.uri,{headers:original.headers});
  assert.equal(imageResponse.status,200); assert.match(imageResponse.headers.get('content-type'),/image\/png/);
  assert.ok(scan.gradCam?.heatmapUri);
  const heatmap=await mediaSource(scan.gradCam.heatmapUri,true);
  assert.equal((await fetch(heatmap.uri)).status,200);
  const token=await session.getToken();
  const direct=await (await fetch('http://127.0.0.1:5000/api/v1/scans',{headers:{Authorization:'Bearer '+token}})).json();
  assert.equal(String(direct.data.scans[0].scan_id),scan.id); // Same API used by web.
  await auth.logout();
  const wrong=await auth.login({email:account.email,password:'deliberately-wrong'});
  assert.equal(wrong.success,false);
  const signedIn=await auth.login({email:account.email,password}); assert.equal(signedIn.success,true);
  assert.equal((await history.getScan(scan.id)).id,scan.id);
  await auth.logout();
  const other=await auth.register(second); assert.equal(other.success,true,other.error);
  console.log('Created local isolation-test account: '+second.email);
  assert.equal((await history.getPage()).pagination.total,0);
  await assert.rejects(history.getScan(scan.id),/not found/i);
  await auth.logout(); assert.equal(await session.getToken(),null);
  console.log(JSON.stringify({result:'PASS',scanId:scan.id,modelVersion:scan.modelVersion,verdict:scan.verdict,accountsCreated:2,scansCreated:1,checks:['register','login','invalid password','me','upload','real AI','history','stats','protected image','heatmap','same web API','account isolation','logout']}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
