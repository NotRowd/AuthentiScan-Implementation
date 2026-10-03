const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
process.env.EXPO_PUBLIC_API_MODE = 'backend';
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://10.0.2.2:5000';
process.env.EXPO_PUBLIC_AI_MEDIA_BASE_URL = 'http://10.0.2.2:5001';
const secure = new Map(), offline = new Map();
const originalLoad = Module._load;
let storageFail = false;
class TestFile {
  constructor(uri) { this.uri = uri; this.name = uri.split('/').pop(); this.type = 'image/png'; }
  async bytes() { return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); }
}
Module._load = function(name, parent, main) {
  if (name === 'expo-file-system') return { File: TestFile };
  if (name.endsWith('/blobUtils')) return { blobToArrayBufferAsync: blob => blob.arrayBuffer() };
  if (name === 'expo-secure-store') return {
    getItemAsync: async key => secure.get(key) ?? null,
    setItemAsync: async (key, value) => { if (storageFail) throw new Error('Secure storage unavailable'); secure.set(key, value); },
    deleteItemAsync: async key => { secure.delete(key); },
  };
  if (name === '@react-native-async-storage/async-storage') return {
    getItem: async key => offline.get(key) ?? null,
    setItem: async (key, value) => { offline.set(key, value); },
    removeItem: async key => { offline.delete(key); },
  };
  return originalLoad.call(this, name, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
global.FormData = class { _parts = []; get parts() { return this._parts; } };
require('../node_modules/expo/src/winter/FormData.ts').installFormDataPatch(global.FormData);
const { convertFormDataAsync } = require('../node_modules/expo/src/winter/fetch/convertFormData.ts');
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => status < 400 ? { success: true, data } : { success: false, message: data } });
const user = { user_id: 17, first_name: 'Mobile', last_name: 'Test', email: 'mobile@example.test', plan: { name: 'Free', scan_limit: 5 } };
const auth = require('../services/auth/authService.ts').default;
const session = require('../services/api/session.ts');
const { apiRequest } = require('../services/api/client.ts');
const { mediaSource, loadMediaSource } = require('../services/api/media.ts');
const { validateBaseUrl } = require('../services/api/config.ts');
const { realScanService } = require('../services/scan/scanService.ts');
const { scanHistoryService: history } = require('../services/scan/scanHistoryService.ts');
const { makeScanFixture } = require('../services/scan/mockScanService.ts');
const { getLatestScanResult, setLatestScanResult } = require('../services/scan/scanSession.ts');
const image = { uri: 'file:///picker-cache/random-uuid.png', fileName: 'test.png', mimeType: 'image/png', fileSize: 100 };
const raw = scenario => makeScanFixture(image, scenario, 19).data;
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
async function login() {
  global.fetch = async () => response({ user, token: 'TEST-TOKEN-NOT-A-REAL-JWT' });
  assert.equal((await auth.login({ email: user.email, password: 'test-password-only' })).success, true);
}
async function main() {
  await test('mock identities are not accepted as backend sessions', async () => {
    offline.set('@authentiscan/offline-v2/session', JSON.stringify(user));
    assert.equal(await auth.getSession(), null);
    await assert.rejects(history.getAll(), /paginated/);
  });
  await test('registration sends backend fields and saves only a secure token', async () => {
    global.fetch = async (url, options) => {
      assert.equal(url, 'http://10.0.2.2:5000/api/v1/auth/register');
      assert.equal(options.headers.Authorization, undefined);
      assert.deepEqual(JSON.parse(options.body), { firstName: 'Mobile', lastName: 'Test', email: user.email, password: 'not-real-password' });
      return response({ user, token: 'TEST-TOKEN-NOT-A-REAL-JWT' }, 201);
    };
    const result = await auth.register({ firstName: ' Mobile ', lastName: 'Test', email: 'MOBILE@example.test', password: 'not-real-password' });
    assert.equal(result.success, true); assert.equal(result.data.scanLimit, 5);
    assert.equal(secure.size, 1);
    assert.ok(!JSON.stringify([...secure.values()]).includes('not-real-password'));
    assert.ok(!JSON.stringify([...offline.values()]).includes('TEST-TOKEN'));
  });
  await test('restored identity is validated through auth/me', async () => {
    global.fetch = async (url, options) => {
      assert.ok(url.endsWith('/auth/me')); assert.match(options.headers.Authorization, /^Bearer /);
      const { plan, ...identity } = user;
      return response({ user: identity, plan });
    };
    assert.equal((await auth.getSession()).name, 'Mobile Test');
  });
  await test('server validation messages are preserved', async () => {
    global.fetch = async () => response('An account with this email already exists.', 409);
    const result = await auth.register({ firstName: 'Mobile', lastName: 'Test', email: user.email, password: 'test-password' });
    assert.equal(result.success, false); assert.match(result.error, /already exists/);
  });
  await test('native multipart preserves original filename instead of picker UUID and lets fetch set boundary', async () => {
    global.fetch = async (url, options) => {
      assert.ok(url.endsWith('/scans')); assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], undefined); assert.match(options.headers.Authorization, /^Bearer /);
      const part = options.body.get('image');
      assert.equal(part.name, image.fileName);
      assert.equal(typeof part.bytes, 'function');
      const encoded = await convertFormDataAsync(options.body, 'regression-boundary');
      const multipart = Buffer.from(encoded.body);
      assert.ok(multipart.includes(Buffer.from('name="image"; filename="test.png"')));
      assert.ok(multipart.includes(Buffer.from('content-type: image/png')));
      assert.ok(multipart.includes(Buffer.from(await part.bytes())));
      return response(raw('authentic'), 201);
    };
    const scan = await realScanService.analyzeImage(image);
    assert.equal(scan.authenticScore, 94); assert.equal(scan.imageUri, image.uri);
  });
  await test('queued processing and failed uploads do not invent scores', async () => {
    for (const status of ['queued', 'processing', 'failed']) {
      global.fetch = async () => response(raw(status), 201);
      const scan = await realScanService.analyzeImage(image);
      assert.equal(scan.hasAnalysis, false); assert.equal(scan.status, status); assert.equal(scan.authenticScore, null);
    }
  });
  await test('actual Expo converter rejects the legacy URI object that broke Android', async () => {
    const oldBody = new FormData();
    oldBody.append('image', { uri: image.uri, name: 'test.png', type: 'image/png' });
    await assert.rejects(convertFormDataAsync(oldBody), /Unsupported FormDataPart/);
  });
  await test('native socket reset has an actionable message and does not retry registration', async () => {
    let calls = 0;
    global.fetch = async () => { calls++; throw new Error('fetch failed: java.net.SocketException: Connection reset'); };
    const result = await auth.register({ firstName: 'Mobile', lastName: 'Test', email: user.email, password: 'test-password' });
    assert.equal(result.success, false);
    assert.match(result.error, /Registration may already have completed/);
    assert.equal(calls, 1);
  });
  await test('server quota rejection does not remove the session', async () => {
    global.fetch = async () => response('Your plan scan limit has been reached.', 403);
    await assert.rejects(realScanService.analyzeImage(image), /limit/);
    assert.ok(await session.getToken());
  });
  await test('history uses explicit pagination and keeps server totals', async () => {
    global.fetch = async (url) => {
      assert.ok(url.endsWith('/scans?limit=20&offset=20'));
      return response({ scans: [raw('authentic')], pagination: { total: 45, limit: 20, offset: 20 } });
    };
    const page = await history.getPage(20);
    assert.equal(page.pagination.total, 45); assert.equal(page.scans.length, 1);
  });
  await test('history passes encoded search and status to the server on every page', async () => {
    global.fetch = async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('q'), 'photo & 100%_');
      assert.equal(parsed.searchParams.get('status'), 'failed');
      assert.equal(parsed.searchParams.get('offset'), '20');
      assert.equal(parsed.searchParams.get('limit'), '5');
      assert.match(options.headers.Authorization, /^Bearer /);
      return response({ scans: [raw('failed')], pagination: { total: 21, limit: 5, offset: 20 } });
    };
    const page = await history.getPage(20, 5, { q: ' photo & 100%_ ', status: 'failed' });
    assert.equal(page.pagination.total, 21);
    assert.equal(page.scans[0].status, 'failed');
    await assert.rejects(history.getPage(-1), /pagination/);
    await assert.rejects(history.getPage(0, 20, { q: 'x'.repeat(121) }), /120/);
  });
  await test('dashboard stats come from the stats endpoint', async () => {
    global.fetch = async url => {
      assert.ok(url.endsWith('/users/stats'));
      return response({ total_scans: 45, queued_scans: 2, ai_generated_found: 7, scans_remaining: null, plan: { name: 'Premium', scan_limit: null } });
    };
    assert.equal((await history.getStats()).total_scans, 45);
  });
  await test('image auth is restricted to backend; heatmaps never receive JWT', async () => {
    const source = await mediaSource('/api/v1/scans/19/image');
    assert.equal(source.uri, 'http://10.0.2.2:5000/api/v1/scans/19/image');
    assert.match(source.headers.Authorization, /^Bearer /);
    const heatmap = await mediaSource('http://127.0.0.1:5001/heatmaps/test.png', true);
    assert.equal(heatmap.uri, 'http://10.0.2.2:5001/heatmaps/test.png'); assert.equal(heatmap.headers, undefined);
    await assert.rejects(mediaSource('https://untrusted.example/image'), /Invalid/);
    await assert.rejects(mediaSource('https://untrusted.example/heatmaps/test.png', true), /host/);
    assert.throws(() => validateBaseUrl('https://user:pass@example.test'), /without credentials/);
  });
  await test('protected image bytes use authenticated fetch and never expose a token in the image URI', async () => {
    global.fetch = async (url, options) => {
      assert.equal(url, 'http://10.0.2.2:5000/api/v1/scans/19/image');
      assert.match(options.headers.Authorization, /^Bearer /);
      assert.equal(options.redirect, 'error');
      assert.equal(options.cache, 'no-store');
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => Uint8Array.from([137,80,78,71]).buffer };
    };
    const loaded = await loadMediaSource('/api/v1/scans/19/image');
    assert.equal(loaded.uri, 'data:image/png;base64,iVBORw==');
    assert.equal(loaded.headers, undefined);
  });
  await test('image failures reject HTML oversized and missing files without displaying them', async () => {
    for (const [response, pattern] of [
      [{ ok: false, status: 404 }, /not found/],
      [{ ok: true, headers: new Headers({ 'content-type': 'text/html' }) }, /Unsupported/],
      [{ ok: true, headers: new Headers({ 'content-type': 'image/png', 'content-length': '10485761' }) }, /too large/],
    ]) {
      global.fetch = async () => response;
      await assert.rejects(loadMediaSource('/api/v1/scans/19/image'), pattern);
    }
  });
  await test('image finishing after logout cannot display the previous account data', async () => {
    let finish, started;
    const ready = new Promise(resolve => { started = resolve; });
    global.fetch = async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: () => { started(); return new Promise(resolve => { finish = resolve; }); } });
    const pending = loadMediaSource('/api/v1/scans/19/image');
    await ready; await auth.logout(); finish(new Uint8Array([137]).buffer);
    await assert.rejects(pending, /cancelled/);
    await login();
  });
  await test('401 clears secure session and current report', async () => {
    let notified = false;
    const stop = session.onSessionCleared(() => { notified = true; });
    setLatestScanResult({ id: 'old-report' });
    global.fetch = async () => response('Invalid token', 401);
    await assert.rejects(apiRequest('/api/v1/users/stats'), /expired/);
    assert.equal(await session.getToken(), null); assert.equal(secure.size, 0);
    assert.equal(getLatestScanResult(), null); assert.equal(notified, true); stop();
  });
  await test('late response after logout cannot restore another account data', async () => {
    await login();
    let deliver, started;
    const ready = new Promise(resolve => { started = resolve; });
    global.fetch = () => { started(); return new Promise(resolve => { deliver = resolve; }); };
    const pending = history.getPage();
    await ready; await auth.logout();
    deliver(response({ scans: [raw('authentic')], pagination: { total: 1, limit: 20, offset: 0 } }));
    await assert.rejects(pending, /Session changed/);
  });
  await test('timeout has no automatic upload retry or mock fallback', async () => {
    await login();
    let calls = 0;
    global.fetch = (_url, options) => { calls++; return new Promise((_resolve, reject) => {
      const fail = () => reject(new Error('AbortError'));
      if (options.signal.aborted) fail(); else options.signal.addEventListener('abort', fail);
    }); };
    await assert.rejects(apiRequest('/api/v1/scans', { method: 'POST', timeoutMs: 5 }), /timed out.*History/);
    assert.equal(calls, 1);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(apiRequest('/api/v1/scans', { method: 'POST', signal: controller.signal }), /cancelled/);
  });
  await test('failed secure storage never authenticates the app', async () => {
    await auth.logout(); storageFail = true;
    global.fetch = async () => response({ user, token: 'test-token' });
    const result = await auth.login({ email: user.email, password: 'test-password' });
    assert.equal(result.success, false); assert.equal(await session.getToken(), null);
    storageFail = false;
  });
  await test('secure token survives reload but is bound to server origin', async () => {
    await login();
    const modulePath = require.resolve('../services/api/session.ts');
    delete require.cache[modulePath];
    const fresh = require(modulePath);
    assert.equal(await fresh.getToken(), 'TEST-TOKEN-NOT-A-REAL-JWT');
    secure.set('authentiscan.backend.session.v1', JSON.stringify({ origin: 'https://different.example', token: 'other-token' }));
    delete require.cache[modulePath];
    assert.equal(await require(modulePath).getToken(), null);
  });
  console.log(passed + ' backend contract tests passed. Fetch and storage were mocked; no real accounts created.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
