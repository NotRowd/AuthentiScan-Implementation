// No device, database, network, or new testing dependency required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
process.env.EXPO_PUBLIC_API_MODE = 'offline';
const memory = new Map();
const originalLoad = Module._load;
Module._load = function (name, parent, main) {
  if (name === 'expo-file-system') return { File: class { constructor() { throw new Error('Offline mode must not prepare backend uploads'); } } };
  if (name === 'expo-secure-store') return { getItemAsync: async () => null, setItemAsync: async () => { throw new Error('Offline mode must not store backend tokens'); }, deleteItemAsync: async () => {} };
  if (name === '@react-native-async-storage/async-storage') return {
    getItem: async key => memory.get(key) ?? null,
    setItem: async (key, value) => { memory.set(key, value); },
    removeItem: async key => { memory.delete(key); },
  };
  return originalLoad.call(this, name, parent, main);
};
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};
let networkCalls = 0;
global.fetch = async () => { networkCalls++; throw new Error('Network forbidden in offline tests'); };
const { mapScan, mapScanList, mapUser, mapMe, unwrap } = require('../services/api/adapters.ts');
const { MAX_IMAGE_BYTES, validateUpload, OFFLINE_MODE, API_ROUTES } = require('../services/api/contracts.ts');
const { makeScanFixture, mockScanService } = require('../services/scan/mockScanService.ts');
const { realScanService } = require('../services/scan/scanService.ts');
const { scanHistoryService } = require('../services/scan/scanHistoryService.ts');
const auth = require('../services/auth/authService.ts').default;
const { setLatestScanResult, getLatestScanResult } = require('../services/scan/scanSession.ts');
const image = { uri: 'file:///fixture.png', fileName: 'fixture.png', mimeType: 'image/png', fileSize: 100 };
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
async function main() {
  await test('offline mode and correct endpoint definitions', () => {
    assert.equal(OFFLINE_MODE, true); assert.equal(API_ROUTES.scans, '/api/v1/scans');
  });
  await test('upload formats and size boundary', () => {
    assert.equal(validateUpload(image), null);
    assert.equal(validateUpload({ ...image, fileSize: MAX_IMAGE_BYTES }), null);
    assert.ok(validateUpload({ ...image, fileSize: MAX_IMAGE_BYTES + 1 }));
    assert.ok(validateUpload({ ...image, mimeType: 'image/heic' }));
    assert.ok(validateUpload({ ...image, fileSize: 0 }));
    assert.equal(validateUpload({ uri: 'file:///a.webp' }), null);
  });
  await test('all completed verdicts and one-time percentage conversion', () => {
    for (const scenario of ['authentic', 'ai_generated', 'uncertain']) {
      const raw = unwrap(makeScanFixture(image, scenario, 1));
      const mapped = mapScan(raw, image.uri);
      assert.equal(mapped.verdict, scenario); assert.equal(mapped.hasAnalysis, true);
      assert.equal(mapped.authenticScore + mapped.aiGeneratedScore, 100);
      assert.deepEqual(mapped.manipulationIndicators, []);
    }
    const raw = unwrap(makeScanFixture(image, 'ai_generated', 2));
    raw.analysis.confidence_score = 0.8238;
    assert.equal(mapScan(raw).confidence, 82.38);
    raw.analysis.confidence_score = 82.38;
    assert.throws(() => mapScan(raw), /Invalid score/);
  });
  await test('upload success is not analysis completion', () => {
    for (const scenario of ['queued', 'processing', 'failed']) {
      const response = makeScanFixture(image, scenario, 3);
      assert.equal(response.success, true);
      const mapped = mapScan(unwrap(response));
      assert.equal(mapped.hasAnalysis, false); assert.equal(mapped.authenticScore, null);
      assert.equal(mapped.modelVersion, null); assert.equal(mapped.status, scenario);
    }
    const missing = unwrap(makeScanFixture(image, 'authentic', 4));
    missing.analysis = null;
    assert.equal(mapScan(missing).hasAnalysis, false);
  });
  await test('optional heatmap is mapped without named regions or a network request', () => {
    const raw = unwrap(makeScanFixture(image, 'authentic', 5));
    assert.equal(mapScan(raw).gradCam, undefined);
    raw.analysis.heatmap_url = 'data:image/png;base64,test';
    assert.equal(mapScan(raw).gradCam.heatmapUri, raw.analysis.heatmap_url);
    assert.deepEqual(mapScan(raw).gradCam.highlightedRegions, []);
  });
  await test('auth and me envelopes use their distinct plan locations', () => {
    const user = { user_id: 6, first_name: 'Test', last_name: 'User', email: 'test@example.test' };
    const plan = { name: 'Free', scan_limit: 5 };
    assert.equal(mapUser({ ...user, plan }).name, 'Test User');
    assert.equal(mapMe({ success: true, data: { user, plan } }).scanLimit, 5);
    assert.equal(mapUser({ ...user, plan: null }).scanLimit, 0);
    assert.throws(() => unwrap({ success: false, message: 'Invalid email or password.' }), /Invalid email/);
  });
  const a = { firstName: 'Test', lastName: 'Alpha', email: 'alpha@example.test', password: 'testonly123' };
  await test('paginated history keeps server totals and protected image paths', () => {
    const scan = unwrap(makeScanFixture(image, 'queued', 9));
    const mapped = mapScanList({ success: true, data: { scans: [scan], pagination: { total: 25, limit: 1, offset: 4 } } });
    assert.equal(mapped.pagination.total, 25);
    assert.equal(mapped.pagination.offset, 4);
    assert.equal(mapped.scans[0].imagePath, '/api/v1/scans/9/image');
    assert.equal(mapped.scans[0].imageUri, '');
  });
  const b = { ...a, lastName: 'Beta', email: 'beta@example.test' };
  await test('registration fields, minimum password length and duplicates', async () => {
    assert.equal((await auth.register({ ...a, lastName: '' })).success, false);
    assert.equal((await auth.register({ ...a, password: '1234567' })).success, false);
    assert.equal((await auth.register(a)).success, true);
    assert.equal((await auth.register(a)).success, false);
    assert.equal((await auth.getSession()).scanLimit, 5);
    assert.ok(!JSON.stringify([...memory.values()]).includes(a.password));
    assert.ok(!JSON.stringify([...memory.values()]).includes('NOT-A-JWT'));
  });
  await test('old unscoped mock history is not imported', async () => {
    memory.set('@authentiscan/scan-history', JSON.stringify([{ id: 'old-shared' }]));
    assert.deepEqual(await scanHistoryService.getAll(), []);
  });
  await test('history is separated by account and report is cleared on logout', async () => {
    const scan = await mockScanService.analyzeImage(image, 'authentic');
    setLatestScanResult(scan);
    assert.equal((await scanHistoryService.getAll()).length, 1);
    await auth.logout();
    assert.equal(getLatestScanResult(), null);
    assert.deepEqual(await scanHistoryService.getAll(), []);
    await auth.register(b);
    assert.deepEqual(await scanHistoryService.getAll(), []);
    await auth.logout();
    await auth.login({ email: a.email, password: 'test' });
    assert.equal((await scanHistoryService.getAll()).length, 1);
  });
  await test('cancelled sample does not consume quota', async () => {
    const controller = new AbortController();
    const pending = mockScanService.analyzeImage(image, 'authentic', controller.signal);
    controller.abort();
    await assert.rejects(pending, /cancelled/);
    assert.equal((await scanHistoryService.getAll()).length, 1);
  });
  await test('session change during scan does not leak a result', async () => {
    const pending = mockScanService.analyzeImage(image);
    await new Promise(resolve => setTimeout(resolve, 20));
    await auth.logout(); await auth.login({ email: b.email, password: 'test' });
    await assert.rejects(pending, /Session changed/);
    assert.deepEqual(await scanHistoryService.getAll(), []);
    await auth.logout(); await auth.login({ email: a.email, password: 'test' });
  });
  await test('quota reserves pending scans, releases failed scans, and enforces remaining allowance', async () => {
    for (const scenario of ['queued', 'processing', 'failed', 'uncertain']) await mockScanService.analyzeImage(image, scenario);
    assert.equal((await scanHistoryService.getAll()).length, 5);
    assert.equal((await scanHistoryService.getStats()).scans_remaining, 1);
    await mockScanService.analyzeImage(image, 'ai_generated');
    assert.equal((await scanHistoryService.getStats()).scans_remaining, 0);
    await assert.rejects(mockScanService.analyzeImage(image), /limit/);
  });
  await test('unsupported operations and real transport remain disabled', async () => {
    await assert.rejects(realScanService.analyzeImage(image), /disabled/);
    await assert.rejects(scanHistoryService.remove('1'), /unavailable/);
    assert.equal((await auth.updateProfile(await auth.getSession(), { name: 'Changed' })).success, false);
    assert.equal(networkCalls, 0);
    // Backend transport exists now, but every offline operation above must make zero requests.
    assert.equal(networkCalls, 0);
  });
  await test('offline filters run before pagination and separate processing states', async () => {
    const page = await scanHistoryService.getPage(0, 1, { status: 'completed' });
    assert.equal(page.pagination.total, 3);
    assert.equal(page.scans.length, 1);
    const next = await scanHistoryService.getPage(1, 1, { status: 'completed' });
    assert.equal(next.scans.length, 1);
    assert.notEqual(next.scans[0].id, page.scans[0].id);
    for (const status of ['queued', 'processing', 'failed', 'authentic', 'uncertain']) {
      const filtered = await scanHistoryService.getPage(0, 20, { status, q: 'FIXTURE' });
      assert.equal(filtered.pagination.total, 1);
    }
    assert.equal((await scanHistoryService.getPage(0, 20, { status: 'ai_generated' })).pagination.total, 1);
    assert.equal((await scanHistoryService.getPage(0, 20, { q: 'missing-file' })).pagination.total, 0);
  });
  await test('offline search supports scan IDs and treats percent and underscore literally', () => {
    const { matchesHistory } = require('../services/scan/historyFilters.ts');
    const scan = mapScan(unwrap(makeScanFixture({ ...image, fileName: 'Photo 100%_done.png' }, 'failed', 123)));
    assert.equal(matchesHistory(scan, { q: '#123' }), true);
    assert.equal(matchesHistory(scan, { q: ' PHOTO 100%_ ' }), true);
    assert.equal(matchesHistory(scan, { q: 'Photo%done' }), false);
    assert.equal(matchesHistory(scan, { status: 'queued' }), false);
    assert.equal(matchesHistory(scan, { status: 'failed' }), true);
    assert.equal(networkCalls, 0);
  });
  console.log(passed + ' offline tests passed. No backend calls.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
