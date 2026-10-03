// Server-only Firestore prototype. There is deliberately no browser endpoint
// that lets a user mark scans completed, refund credits, or grant Pro access.
export const LIMIT = 5;
const DAY = 86400000, OFFSET = 8 * 3600000;
export function dayWindow(now = Date.now()) {
  if (!Number.isFinite(now) || now <= 0) throw new Error('Invalid server time');
  const start = Math.floor((now + OFFSET) / DAY) * DAY - OFFSET;
  return {key: new Date(start + OFFSET).toISOString().slice(0, 10), start, end: start + DAY};
}
const fail = (message, code) => Object.assign(new Error(message), {code});
function refs(db, uid, scanId) {
  if (![uid, scanId].every(x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x))) throw new Error('Invalid record ID');
  const user = db.collection('users').doc(uid);
  return {user, scan: user.collection('scans').doc(scanId)};
}
export async function reserveScan(db, uid, scanId, now = Date.now(), metadata = {}) {
  const {user, scan} = refs(db, uid, scanId);
  // Fixed once per request: retries cannot move the reservation to another day.
  const window = dayWindow(now);
  const day = user.collection('allowances').doc(window.key);
  return db.runTransaction(async tx => {
    const account = await tx.get(user);
    if (!account.exists || account.data().status !== 'active') throw fail('Account unavailable', 'ACCOUNT_UNAVAILABLE');
    const existing = await tx.get(scan);
    if (existing.exists) return existing.data(); // Same operation never charges twice.
    const snapshot = await tx.get(day);
    const used = snapshot.data()?.used || 0;
    if (used >= LIMIT) throw fail('Daily scan allowance reached', 'DAILY_LIMIT');
    const record = {...metadata, scan_id: scanId, owner_uid: uid, status: 'processing', allowance_day: window.key, created_at: new Date(now).toISOString(), lease_expires_at:now+300000};
    tx.set(day, {used: used + 1, limit: LIMIT, resets_at: new Date(window.end).toISOString()});
    tx.create(scan, record);
    return record;
  });
}
export async function finishScan(db, uid, scanId, status, details = {}) {
  if (!['completed', 'failed'].includes(status)) throw new Error('Invalid terminal scan status');
  const {user, scan} = refs(db, uid, scanId);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(scan);
    if (!snapshot.exists) throw fail('Scan not found', 'NOT_FOUND');
    const record = snapshot.data();
    if (record.status === status) return record;
    if (!['queued', 'processing'].includes(record.status)) throw fail('Scan already finalized', 'ALREADY_FINAL');
    if (status === 'failed') {
      const day = user.collection('allowances').doc(record.allowance_day);
      const quota = await tx.get(day);
      const used = quota.data()?.used;
      if (!Number.isInteger(used) || used < 1) throw new Error('Allowance record inconsistent');
      // Refund the reservation's original day, including after midnight.
      tx.update(day, {used: used - 1});
    }
    tx.update(scan, {...details, status, updated_at:new Date().toISOString()});
    return {...record, ...details, status};
  });
}
export async function readAllowance(db, uid, now = Date.now()) {
  const window = dayWindow(now);
  const snapshot = await db.collection('users').doc(uid).collection('allowances').doc(window.key).get();
  const used = snapshot.data()?.used || 0;
  return {limit: LIMIT, used, remaining: Math.max(0, LIMIT - used), timezone: 'Asia/Manila', resets_at: new Date(window.end).toISOString()};
}
