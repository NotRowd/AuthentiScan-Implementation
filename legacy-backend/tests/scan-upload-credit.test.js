const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pool } = require('../src/config/db');
const allowance = require('../src/services/scanAllowance');
const ai = require('../src/services/aiService');

test('upload failure, quota rejection, persistence and atomic completion', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'authentiscan-upload-test-'));
  const original = { execute: pool.execute, getConnection: pool.getConnection, reserve: allowance.reserveScan, request: ai.requestAnalysis, url: process.env.AI_SERVICE_URL };
  let state;
  allowance.reserveScan = async () => {
    if (state.reserveError) throw state.reserveError;
    state.saved = true;
    return 42;
  };
  ai.requestAnalysis = async () => {
    if (state.aiError) throw state.aiError;
    return { verdict: 'authentic', confidence_score: 80, authentic_score: 80, ai_generated_score: 20, raw_model_output: {}, model_version: 'fixture', heatmap_path: null, readable_explanation: 'Test' };
  };
  pool.execute = async sql => {
    if (sql.includes("status = 'processing'")) state.status = 'processing';
    else if (sql.includes("status = 'failed'")) {
      assert.match(sql, /status <> 'completed'/);
      if (state.status !== 'completed') state.status = 'failed';
    } else if (sql.includes('FROM scans AS s')) {
      if (state.readError) throw Error('read failed after saving');
      return [[{ scan_id: 42, original_file_name: 'fixture.png', status: state.status, file_size_bytes: 12, result_id: state.result ? 1 : null, verdict: 'authentic', confidence_score: 80, authentic_score: 80, ai_generated_score: 20 }]];
    } else throw Error('Unexpected query: ' + sql);
    return [{}];
  };
  pool.getConnection = async () => ({
    async beginTransaction() { state.events.push('begin'); },
    async execute(sql) {
      if (sql.startsWith('INSERT INTO analysis_results')) state.events.push('result');
      else if (sql.includes("status = 'completed'")) {
        if (state.failCompletion) throw Error('completion write failed');
        state.events.push('completed');
      } else throw Error('Unexpected transaction query');
      return [{}];
    },
    async commit() { state.events.push('commit'); state.status = 'completed'; state.result = true; },
    async rollback() { state.events.push('rollback'); },
    release() { state.events.push('release'); },
  });
  const { uploadScan } = require('../src/controllers/scanController');
  async function run(options = {}) {
    state = { status: 'queued', events: [], ...options };
    const filename = 'fixture.upload';
    const file = { path: path.join(dir, filename), filename, originalname: 'fixture.png', size: 12 };
    await fs.writeFile(file.path, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]));
    let body, error, status;
    await uploadScan({ file, user: { userId: 123 } }, { status(value) { status = value; return this; }, json(value) { body = value; } }, value => { error = value; });
    const exists = await fs.stat(file.path).then(() => true, () => false);
    if (exists) await fs.unlink(file.path);
    return { body, error, status, exists };
  }
  try {
    process.env.AI_SERVICE_URL = 'http://fixture.invalid';
    await t.test('AI failure preserves image and returns no-charge status', async () => {
      const result = await run({ aiError: Object.assign(Error('AI service unavailable'), { code: 'AI_UNAVAILABLE' }) });
      assert.equal(result.status, 201);
      assert.equal(result.body.data.credit_status, 'not_charged');
      assert.equal(result.body.data.analysis_error.code, 'AI_UNAVAILABLE');
      assert.equal(result.exists, true);
      assert.equal(state.status, 'failed');
    });
    await t.test('successful analysis commits result and completed status together', async () => {
      const result = await run();
      assert.equal(result.body.data.credit_status, 'used');
      assert.deepEqual(state.events, ['begin', 'result', 'completed', 'commit', 'release']);
    });
    await t.test('failed completion rolls back result and releases credit', async () => {
      const result = await run({ failCompletion: true });
      assert.equal(result.body.data.credit_status, 'not_charged');
      assert.equal(result.body.data.analysis, null);
      assert.deepEqual(state.events, ['begin', 'result', 'rollback', 'release']);
    });
    await t.test('post-save lookup error must not delete the saved image', async () => {
      const result = await run({ readError: true });
      assert.match(result.error.message, /read failed/);
      assert.equal(result.exists, true);
    });
    await t.test('quota rejection cleans up only the unrecorded upload', async () => {
      const result = await run({ reserveError: Object.assign(Error('quota'), { statusCode: 403 }) });
      assert.equal(result.error.statusCode, 403);
      assert.equal(result.exists, false);
      assert.equal(state.saved, undefined);
    });
    await t.test('uncertain reservation commit preserves possibly saved image', async () => {
      const result = await run({ reserveError: Object.assign(Error('commit lost'), { scanMayBeSaved: true }) });
      assert.equal(result.exists, true);
    });
    await t.test('unconfigured AI keeps queued reservation without pretending success', async () => {
      delete process.env.AI_SERVICE_URL;
      const result = await run();
      assert.equal(result.body.data.credit_status, 'reserved');
      assert.equal(result.body.data.status, 'queued');
      assert.match(result.body.message, /refreshing does not start analysis/);
    });
  } finally {
    pool.execute = original.execute;
    pool.getConnection = original.getConnection;
    allowance.reserveScan = original.reserve;
    ai.requestAnalysis = original.request;
    if (original.url === undefined) delete process.env.AI_SERVICE_URL;
    else process.env.AI_SERVICE_URL = original.url;
    await pool.end();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
