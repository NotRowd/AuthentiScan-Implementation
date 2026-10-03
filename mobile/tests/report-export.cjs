const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
process.env.EXPO_PUBLIC_API_MODE = 'backend';
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://10.0.2.2:5000';
let revision = 1, token = 'fixture-token', cleared = 0, available = true, os = 'ios', failWrite = false;
const files = new Map(), shared = [], requests = [];
let shareImpl = async () => {};
class TestDirectory {
  constructor() { this.uri = 'file:///private-cache/authentiscan-report-exports'; }
  create() {}
  list() { return [...files.values()]; }
}
class TestFile {
  constructor(directory, name) { this.name = name; this.uri = directory.uri + '/' + name; this.exists = false; }
  create() { this.exists = true; files.set(this.uri, this); }
  write(bytes) { if (failWrite) throw new Error('Storage full'); this.bytes = bytes; }
  delete() { this.exists = false; files.delete(this.uri); }
}
const original = Module._load;
Module._load = function(name, parent, main) {
  if (name === 'expo-file-system') return { Directory: TestDirectory, File: TestFile, Paths: { cache: 'file:///private-cache' } };
  if (name === 'expo-sharing') return { isAvailableAsync: async () => available, shareAsync: async (uri, options) => {
    assert.ok(files.get(uri)?.bytes, 'Only downloaded bytes may be shared'); shared.push({uri, options}); await shareImpl();
  }};
  if (name === 'react-native') return { Platform: { get OS() { return os; } } };
  if (name === '../api/session') return { getToken: async () => token, sessionRevision: () => revision,
    clearSession: async expected => { assert.equal(expected, token); token = null; revision++; cleared++; } };
  return original.call(this, name, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { downloadScanReport, shareSavedScanReport } = require('../services/scan/reportExport.ts');
const pdf = Buffer.from('%PDF-1.3\nfixture-only\n%%EOF');
const response = () => new Response(pdf, {headers: {'content-type':'application/pdf'}});
let fetchImpl = async () => response();
global.fetch = async (url, options) => { requests.push({url, options}); return fetchImpl(url, options); };
let passed = 0;
async function test(name, run) {
  files.clear(); shared.length = 0; requests.length = 0;
  available = true; os = 'ios'; failWrite = false; token = 'fixture-token'; revision++; shareImpl = async () => {}; fetchImpl = async () => response();
  await run(); passed++; console.log('PASS ' + name);
}
(async () => {
  await test('saved PDF uses one owner-authenticated GET, exact bytes and native PDF sharing options', async () => {
    await shareSavedScanReport('19'); assert.equal(requests.length, 1);
    const {url, options} = requests[0]; assert.equal(url, 'http://10.0.2.2:5000/api/v1/scans/19/report');
    assert.equal(options.method, 'GET'); assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    assert.equal(options.redirect, 'error'); assert.equal(options.body, undefined);
    assert.equal(shared[0].options.UTI, 'com.adobe.pdf'); assert.equal(shared[0].options.mimeType, 'application/pdf');
    assert.deepEqual(Buffer.from(files.get(shared[0].uri).bytes), pdf);
    assert.ok(!shared[0].uri.includes(token)); assert.equal(cleared, 0);
  });
  await test('invalid IDs and missing session never request or share', async () => {
    for (const id of ['../1', '0', '1?token=a', '9007199254740992']) await assert.rejects(downloadScanReport(id), /Invalid/);
    token = null; await assert.rejects(downloadScanReport('19'), /sign in/); assert.equal(requests.length, 0);
  });
  await test('unavailable sharing and browser platform do not download', async () => {
    available = false; await assert.rejects(shareSavedScanReport('19'), /unavailable/);
    available = true; os = 'web'; await assert.rejects(shareSavedScanReport('19'), /web History/); assert.equal(requests.length, 0);
  });
  await test('404 and 429 preserve server errors without sharing', async () => {
    for (const status of [404, 429]) { fetchImpl = async () => Response.json({message:'Report unavailable'}, {status}); await assert.rejects(shareSavedScanReport('19'), /Report unavailable/); }
    assert.equal(shared.length, 0); assert.equal(files.size, 0);
  });
  await test('HTML, invalid PDF, empty and oversized responses never reach disk', async () => {
    for (const r of [new Response('html'), new Response('broken',{headers:{'content-type':'application/pdf'}}), new Response('',{headers:{'content-type':'application/pdf'}}), new Response(pdf,{headers:{'content-type':'application/pdf','content-length':'20000000'}})]) {
      fetchImpl = async () => r; await assert.rejects(shareSavedScanReport('19'), /PDF|report/);
    }
    assert.equal(shared.length, 0); assert.equal(files.size, 0);
  });
  await test('current 401 clears session but late old-session response does not clear a new login', async () => {
    fetchImpl = async () => new Response('',{status:401}); await assert.rejects(downloadScanReport('19'), /expired/); assert.equal(cleared, 1);
    token = 'new-token'; fetchImpl = async () => { revision++; return new Response('',{status:401}); };
    await assert.rejects(downloadScanReport('19'), /Session changed/); assert.equal(cleared, 1);
  });
  await test('cancelled, timed-out and changed-session downloads cannot share or retry', async () => {
    const c = new AbortController(); c.abort(); await assert.rejects(shareSavedScanReport('19', c.signal), /cancelled/); assert.equal(requests.length, 0);
    fetchImpl = async (_url, {signal}) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    await assert.rejects(downloadScanReport('19', undefined, 5), /timed out.*No scan credit/); assert.equal(requests.length, 1);
    fetchImpl = async () => { revision++; return response(); }; await assert.rejects(shareSavedScanReport('19'), /Session changed/); assert.equal(shared.length, 0);
  });
  await test('duplicate exports are locked until chooser completes, then cancel/retry is allowed', async () => {
    let release; shareImpl = () => new Promise(resolve => release = resolve);
    const pending = shareSavedScanReport('19'); while (!release) await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(shareSavedScanReport('19'), /already open/); assert.equal(requests.length, 1);
    release(); await pending; shareImpl = async () => {}; await shareSavedScanReport('19'); assert.equal(requests.length, 2);
  });
  await test('storage errors remove incomplete file and release the export lock', async () => {
    failWrite = true; await assert.rejects(shareSavedScanReport('19'), /Storage full/); assert.equal(files.size, 0); assert.equal(shared.length, 0);
    failWrite = false; await shareSavedScanReport('19'); assert.equal(shared.length, 1);
  });
  await test('Android handoff keeps bytes available; cache cleanup targets only old generated PDFs', async () => {
    os = 'android'; const d = new TestDirectory(); const old = new TestFile(d, 'AuthentiScan-scan-19-1.pdf'); old.create();
    const unrelated = new TestFile(d, 'keep.pdf'); unrelated.create();
    await shareSavedScanReport('19'); assert.equal(old.exists, false); assert.equal(unrelated.exists, true);
    assert.ok(files.get(shared[0].uri).exists);
  });
  console.log(`${passed} PDF export tests passed. Native sharing/storage and network mocked; no accounts, scans or credits changed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
