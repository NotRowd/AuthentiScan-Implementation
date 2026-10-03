const test = require('node:test');
const assert = require('node:assert/strict');
const { COUNTED_STATUSES_SQL, dailyWindow, creditStatus, reserveScan } = require('../src/services/scanAllowance');
const TODAY = Date.parse('2026-09-20T12:00:00+08:00') / 1000;

// This fake models the user-row lock and transaction rollback, never a real DB.
function database(statuses = [], limit = 5) {
  const state = { now: TODAY, rows: statuses.map((status, i) => ({ id: i + 1, status, created: TODAY })), plan: { scan_limit: limit }, calls: [], released: 0, failInsert: false, failCommit: false };
  let tail = Promise.resolve();
  const pool = { async getConnection() {
    let unlock, snapshot;
    return {
      async beginTransaction() { state.calls.push('BEGIN'); },
      async execute(sql, params) {
        state.calls.push(sql);
        if (sql.startsWith('SELECT user_id')) {
          assert.match(sql, /FOR UPDATE$/);
          const prior = tail; tail = new Promise(resolve => { unlock = resolve; });
          await prior; snapshot = state.rows.map(row => ({ ...row }));
          return [[{ user_id: params[0] }]];
        }
        if (sql.includes('FROM user_subscriptions')) return [state.plan ? [state.plan] : []];
        if (sql === 'SELECT UNIX_TIMESTAMP() AS now_epoch') return [[{ now_epoch: state.now }]];
        if (sql.includes('COUNT(*)')) {
          assert.match(sql, /is_deleted = FALSE/);
          assert.ok(sql.includes('status IN ' + COUNTED_STATUSES_SQL));
          assert.match(sql, /created_at >= FROM_UNIXTIME\(\?\) AND created_at < FROM_UNIXTIME\(\?\)/);
          return [[{ allowance_used: state.rows.filter(row => row.status !== 'failed' && row.created >= params[1] && row.created < params[2]).length }]];
        }
        if (sql.startsWith('INSERT INTO scans')) {
          if (state.failInsert) throw Error('insert failed');
          const id = state.rows.length + 1; state.rows.push({ id, status: 'queued', created: params[6] });
          return [{ insertId: id }];
        }
        throw Error('Unexpected query');
      },
      async commit() { if (state.failCommit) throw Error('commit acknowledgement lost'); },
      async rollback() { if (snapshot) state.rows = snapshot; state.calls.push('ROLLBACK'); },
      release() { state.released++; unlock?.(); },
    };
  } };
  return { pool, state };
}
const file = { originalname: 'test.png', filename: 'saved.png', path: 'fixture-only.png', size: 100, mimetype: 'image/png' };

test('Philippine day boundaries include midnight and handle month/year/leap dates', () => {
  for (const date of ['2026-09-20', '2026-12-31', '2028-02-29']) {
    const midnight = Date.parse(date + 'T00:00:00+08:00') / 1000;
    assert.equal(dailyWindow(midnight).start, midnight);
    assert.equal(dailyWindow(midnight - 1).end, midnight);
    assert.equal(dailyWindow(midnight + 86399).start, midnight);
    assert.equal(dailyWindow(midnight + 86400).start, midnight + 86400);
  }
  assert.throws(() => dailyWindow(NaN));
});

test('five scans block a sixth, then midnight restores five without deleting history', async () => {
  const { pool, state } = database(Array(5).fill('completed'));
  state.rows.push({ id: 6, status: 'failed', created: TODAY });
  await assert.rejects(reserveScan(pool, 14, file), { statusCode: 403 });
  state.now = dailyWindow(TODAY).end;
  for (let i = 0; i < 5; i++) await reserveScan(pool, 14, file);
  await assert.rejects(reserveScan(pool, 14, file), { statusCode: 403 });
  assert.equal(state.rows.length, 11);
  assert.equal(state.rows.filter(r => r.created === TODAY).length, 6);
});

test('previous-day pending scans do not reduce the new day and completion keeps the original day', async () => {
  const { pool, state } = database(['queued', 'processing', 'completed']);
  state.now = dailyWindow(TODAY).end;
  state.rows[1].status = 'completed';
  for (let i = 0; i < 5; i++) await reserveScan(pool, 14, file);
  await assert.rejects(reserveScan(pool, 14, file), { statusCode: 403 });
});

test('unused allowance does not accumulate over skipped days', async () => {
  const { pool, state } = database(['completed']);
  state.now += 86400 * 3;
  for (let i = 0; i < 5; i++) await reserveScan(pool, 14, file);
  await assert.rejects(reserveScan(pool, 14, file), { statusCode: 403 });
});

test('credit statuses distinguish failures, reservations, and completed scans', () => {
  assert.equal(creditStatus('failed'), 'not_charged');
  assert.equal(creditStatus('queued'), 'reserved');
  assert.equal(creditStatus('processing'), 'reserved');
  assert.equal(creditStatus('completed'), 'used');
});
test('previous failed scans do not consume allowance and remain stored', async () => {
  const { pool, state } = database(['failed', 'failed', 'failed', 'failed', 'failed']);
  assert.equal(await reserveScan(pool, 14, file), 6);
  assert.equal(state.rows.filter(row => row.status === 'failed').length, 5);
  assert.equal(state.released, 1);
});
test('completed and pending scans share the same limit', async () => {
  const { pool, state } = database(['completed', 'completed', 'queued', 'processing', 'completed', 'failed']);
  await assert.rejects(reserveScan(pool, 14, file), { statusCode: 403 });
  assert.equal(state.rows.length, 6);
  assert.equal(state.released, 1);
});
test('simultaneous requests cannot reserve the same final credit', async () => {
  const { pool, state } = database(['completed', 'completed', 'queued', 'processing', 'failed']);
  const results = await Promise.allSettled([reserveScan(pool, 14, file), reserveScan(pool, 14, file)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.statusCode, 403);
  assert.equal(state.rows.filter(row => row.status !== 'failed').length, 5);
  assert.equal(state.released, 2);
});
test('unlimited plans, no plan, zero limit, and insert failures are handled', async () => {
  const unlimited = database(Array(8).fill('completed'), null);
  await reserveScan(unlimited.pool, 14, file);
  assert.equal(unlimited.state.rows.length, 9);
  for (const mode of ['missing', 'zero', 'insert']) {
    const { pool, state } = database([], mode === 'zero' ? 0 : 5);
    if (mode === 'missing') state.plan = null;
    if (mode === 'insert') state.failInsert = true;
    await assert.rejects(reserveScan(pool, 14, file));
    assert.equal(state.rows.length, 0);
    assert.equal(state.released, 1);
    assert.ok(state.calls.includes('ROLLBACK'));
  }
});
test('uncertain commit marks the image for preservation', async () => {
  const { pool, state } = database();
  state.failCommit = true;
  await assert.rejects(reserveScan(pool, 14, file), { scanMayBeSaved: true });
  assert.equal(state.released, 1);
});
test('stats separate saved history total from charged/reserved scans', async () => {
  const { pool } = require('../src/config/db');
  const original = pool.execute;
  try {
    pool.execute = async (sql, params) => {
      if (sql === 'SELECT UNIX_TIMESTAMP() AS now_epoch') return [[{ now_epoch: TODAY }]];
      if (sql.includes('COUNT(scans.scan_id)')) {
        assert.ok(sql.includes('scans.status IN ' + COUNTED_STATUSES_SQL));
        const window = dailyWindow(TODAY);
        assert.deepEqual(params, [window.start, window.end, window.start, window.end, 14]);
        return [[{ total_scans: 7, allowance_used: 3, failed_scans: 4, reserved_scans: 1, queued_scans: 1, ai_generated_found: 2 }]];
      }
      return [[{ name: 'Free', scan_limit: 5 }]];
    };
    let body;
    const { getStats } = require('../src/controllers/authController');
    await getStats({ user: { userId: 14 } }, { status() { return this; }, json(value) { body = value; } }, error => { throw error; });
    assert.equal(body.data.total_scans, 7);
    assert.equal(body.data.failed_scans, 4);
    assert.equal(body.data.allowance_used, 3);
    assert.equal(body.data.scans_remaining, 2);
    assert.equal(body.data.allowance_timezone, 'Asia/Manila');
    assert.equal(body.data.allowance_resets_at, '2026-09-20T16:00:00.000Z');
  } finally { pool.execute = original; await pool.end(); }
});
