const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHistoryQuery } = require('../src/services/scanHistoryQuery');

test('history defaults remain owner-scoped and exclude deleted records', () => {
  assert.deepEqual(buildHistoryQuery({}, 17), {
    where: 's.user_id = ? AND s.is_deleted = FALSE', params: [17], limit: 20, offset: 0
  });
});

test('history parameters are validated before SQL execution', () => {
  for (const query of [
    { limit: '0' }, { limit: '101' }, { limit: '1.5' }, { limit: ['20'] },
    { offset: '-1' }, { offset: '' }, { offset: '1e2' }, { offset: '9007199254740992' },
    { offset: {} }, { q: ['x', 'y'] }, { q: {} }, { q: 'x'.repeat(121) },
    { status: 'unknown' }, { status: ['failed'] }, { status: "all' OR 1=1" }
  ]) assert.throws(() => buildHistoryQuery(query, 17), { statusCode: 400 });
  assert.equal(buildHistoryQuery({ q: 'x'.repeat(120), limit: '100', offset: '0' }, 17).limit, 100);
});

test('search binds literal text and does not interpolate SQL or wildcard characters', () => {
  const search = "x%' OR 1=1 --_";
  const result = buildHistoryQuery({ q: search, limit: '5', offset: '20' }, 17);
  assert.deepEqual(result.params, [17, search, search]);
  assert.ok(!result.where.includes(search));
  assert.match(result.where, /LOCATE\(LOWER\(\?\), LOWER\(s.original_file_name\)\)/);
  assert.deepEqual(buildHistoryQuery({ q: '  #19  ' }, 17).params, [17, '#19', '19']);
});

test('processing states are distinct from completed verdicts', () => {
  for (const status of ['queued', 'processing', 'failed', 'completed']) {
    const result = buildHistoryQuery({ status }, 17);
    assert.match(result.where, /s.status = \?/);
    assert.doesNotMatch(result.where, /ar.verdict/);
    assert.deepEqual(result.params, [17, status]);
  }
  for (const status of ['authentic', 'ai_generated', 'uncertain']) {
    const result = buildHistoryQuery({ status }, 17);
    assert.match(result.where, /s.status = 'completed' AND ar.verdict = \?/);
    assert.deepEqual(result.params, [17, status]);
  }
});

test('HTTP history authentication, filters, counts, and paging', async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'history-tests-only-not-a-real-secret';
  const jwt = require('jsonwebtoken');
  const { pool } = require('../src/config/db');
  const original = pool.execute;
  const calls = [];
  pool.execute = async (sql, params) => {
    calls.push({ sql, params });
    return sql.includes('COUNT(*)') ? [[{ total: 23 }]] : [[{
      scan_id: 19, original_file_name: 'Example.png', file_size_bytes: 100,
      mime_type: 'image/png', status: 'failed', result_id: null,
      created_at: '2026-09-14', updated_at: '2026-09-14'
    }]];
  };
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/api/v1/scans`;
  const headers = { Authorization: 'Bearer ' + jwt.sign({ userId: 17 }, process.env.JWT_SECRET) };
  try {
    await t.test('requires a valid session, with no database call on rejection', async () => {
      assert.equal((await fetch(origin)).status, 401);
      assert.equal((await fetch(origin, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
      assert.equal(calls.length, 0);
    });
    await t.test('rejects invalid repeated or structured parameters', async () => {
      for (const query of ['?q=a&q=b', '?q[x]=a', '?status=invalid', '?limit=101', '?offset=-1']) {
        assert.equal((await fetch(origin + query, { headers })).status, 400);
      }
      assert.equal(calls.length, 0);
    });
    await t.test('count and results use identical filters and token owner', async () => {
      const response = await fetch(origin + '?q=Example&status=failed&limit=5&offset=20&userId=999', { headers });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.data.pagination, { total: 23, limit: 5, offset: 20 });
      assert.equal(body.data.scans[0].analysis, null);
      assert.equal(body.data.scans[0].analysis_status, 'failed');
      assert.equal(calls.length, 2);
      const where = calls[0].sql.split('WHERE ')[1].split('ORDER BY')[0].trim();
      assert.equal(calls[1].sql.split('WHERE ')[1].trim(), where);
      assert.deepEqual(calls[0].params, [17, 'Example', 'Example', 'failed', 5, 20]);
      assert.deepEqual(calls[1].params, [17, 'Example', 'Example', 'failed']);
      assert.match(calls[0].sql, /ORDER BY s.created_at DESC, s.scan_id DESC/);
    });
  } finally {
    pool.execute = original;
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
