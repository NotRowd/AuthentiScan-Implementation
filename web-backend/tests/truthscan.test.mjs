import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createTruthScanClient, validateTruthScanResult} from '../server/truthscan.mjs';

const id = '123e4567-e89b-12d3-a456-426614174000';
const key = 'test-private-key';
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const done = details => ({id, status: 'done', result_details: {
  is_valid: true, final_result: 'AI Generated', final_label_confidence: 95, ...details,
}});

test('preserves provider labels and rejects invalid scores or mismatched jobs', () => {
  assert.equal(validateTruthScanResult(done({final_result: 'Digitally Edited'}), id).result_details.final_result, 'Digitally Edited');
  assert.throws(() => validateTruthScanResult(done({final_label_confidence: 101}), id));
  assert.throws(() => validateTruthScanResult({...done(), id: 'wrong'}, id));
  assert.throws(() => validateTruthScanResult(done({is_valid: false}), id));
});

test('persists submission state and never leaks the key to upload storage or query', async () => {
  const image = await sharp({create: {width: 100, height: 100, channels: 3, background: 'white'}}).png().toBuffer();
  // Provider requires at least 1 KB; trailing data leaves a valid PNG image.
  const bytes = Buffer.concat([image, Buffer.alloc(1024)]);
  const calls = [], records = [];
  const client = createTruthScanClient({apiKey: key, fetchImpl: async (url, options) => {
    calls.push({url, options});
    if (url.includes('/get-presigned-url')) return json({presigned_url: 'https://test.nyc3.digitaloceanspaces.com/uploads/photo.png?signature=abc', file_path: 'uploads/photo.png'});
    if (options.method === 'PUT') {
      assert.equal(records.at(-1).status, 'uploading');
      assert.equal(JSON.stringify(options.headers).includes(key), false);
      return new Response('', {status: 200});
    }
    assert.equal(records.at(-1).status, 'submission_started');
    assert.equal(JSON.parse(options.body).id, id);
    return json({id, status: 'pending'});
  }});
  assert.equal(await client.submit(bytes, {id, saveJob: async record => records.push(record)}), id);
  assert.equal(calls.length, 3);
  assert.equal(records.at(-1).status, 'pending');
});

test('does not retry an ambiguous chargeable submission', async () => {
  const image = await sharp({create: {width: 50, height: 50, channels: 3, background: 'red'}}).png().toBuffer();
  let submissions = 0;
  const records = [];
  const client = createTruthScanClient({apiKey: key, fetchImpl: async (url, options) => {
    if (url.includes('/get-presigned-url')) return json({presigned_url: 'https://test.nyc3.digitaloceanspaces.com/uploads/x.png', file_path: 'uploads/x.png'});
    if (options.method === 'PUT') return new Response('');
    submissions++;
    throw new Error('Socket closed after server acceptance');
  }});
  await assert.rejects(client.submit(Buffer.concat([image, Buffer.alloc(1024)]), {id, saveJob: async row => records.push(row)}));
  assert.equal(submissions, 1);
  assert.equal(records.at(-1).job_id, id);
  assert.equal(records.at(-1).status, 'submission_started');
});

test('polls optional assets after classification without another detect call', async () => {
  let count = 0;
  const client = createTruthScanClient({apiKey: key, wait: async () => {}, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://detect-image.truthscan.com/query');
    assert.deepEqual(JSON.parse(options.body), {id});
    count++;
    return json(done({heatmap_status: count === 1 ? 'pending' : 'ready', analysis_results_status: 'ready'}));
  }});
  assert.equal((await client.poll(id)).result_details.heatmap_status, 'ready');
  assert.equal(count, 2);
});

test('rate limits and exhausted access produce actionable errors', async () => {
  for (const [status, code] of [[429, 'TRUTHSCAN_RATE_LIMIT'], [403, 'TRUTHSCAN_ACCESS']]) {
    const client = createTruthScanClient({apiKey: key, fetchImpl: async () => json({}, status)});
    await assert.rejects(client.credits(), {code});
  }
});

test('asset downloads reject HTML and do not follow arbitrary result URLs', async () => {
  const client = createTruthScanClient({apiKey: key, fetchImpl: async url => {
    assert.equal(url, 'https://detect-image.truthscan.com/heatmap/' + id);
    return new Response('<html>not an image</html>', {headers: {'Content-Type': 'text/html'}});
  }});
  await assert.rejects(client.heatmap(id));
});

test('pending asset response is optional and does not invent a heatmap', async () => {
  const client = createTruthScanClient({apiKey: key, fetchImpl: async () => json({heatmap_status: 'pending'}, 202)});
  assert.equal(await client.heatmap(id), null);
});
