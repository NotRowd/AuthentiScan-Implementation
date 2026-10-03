const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { requestAnalysis } = require('../src/services/aiService');

test('AI response validation, unavailable service, server failure, and timeout', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'authentiscan-ai-test-'));
  const filePath = path.join(directory, 'fixture.png');
  await fs.writeFile(filePath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const original = process.env.AI_SERVICE_URL;
  process.env.AI_SERVICE_URL = 'http://ai-fixture.test';
  const input = { filePath, mimeType: 'image/png', originalFileName: 'fixture.png' };
  const data = { verdict: 'authentic', confidence_score: .8, authentic_score: .8, ai_generated_score: .2, readable_explanation: 'Model estimate.', model_version: 'fixture', heatmap_path: '/heatmaps/fixture.png' };
  try {
    const result = await requestAnalysis(input, { fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'error'); assert.equal(options.headers, undefined);
      return { ok: true, json: async () => ({ success: true, data }) };
    } });
    assert.equal(result.verdict, 'authentic');
    await assert.rejects(requestAnalysis(input, { fetchImpl: async () => { throw Error('connection refused'); } }), { code: 'AI_UNAVAILABLE' });
    await assert.rejects(requestAnalysis(input, { fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ detail: 'private traceback' }) }) }), { code: 'AI_RESPONSE_ERROR' });
    for (const bad of [null, {}, { ...data, confidence_score: null }, { ...data, confidence_score: true }, { ...data, authentic_score: '0.8' }]) {
      await assert.rejects(requestAnalysis(input, { fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, data: bad }) }) }), { code: 'AI_INVALID_RESPONSE' });
    }
    await assert.rejects(requestAnalysis(input, { timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })) }), { code: 'AI_TIMEOUT' });
    delete process.env.AI_SERVICE_URL;
    assert.equal(await requestAnalysis(input), null);
  } finally {
    if (original === undefined) delete process.env.AI_SERVICE_URL; else process.env.AI_SERVICE_URL = original;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
