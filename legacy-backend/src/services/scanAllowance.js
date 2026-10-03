// A saved failure is history, not a charged scan. Pending work reserves a slot.
const COUNTED_STATUSES_SQL = "('queued', 'processing', 'completed')";
const ALLOWANCE_TIMEZONE = 'Asia/Manila';
const DAY_SECONDS = 86400;
const MANILA_OFFSET_SECONDS = 8 * 3600;

function dailyWindow(nowEpoch) {
  const now = Number(nowEpoch);
  if (!Number.isFinite(now) || now <= 0) throw new Error('Cannot determine allowance date.');
  const start = Math.floor((now + MANILA_OFFSET_SECONDS) / DAY_SECONDS) * DAY_SECONDS - MANILA_OFFSET_SECONDS;
  return { start, end: start + DAY_SECONDS, now };
}

async function readDailyWindow(database) {
  const [rows] = await database.execute('SELECT UNIX_TIMESTAMP() AS now_epoch');
  return dailyWindow(rows[0].now_epoch);
}

function creditStatus(status) {
  return status === 'failed' ? 'not_charged' : status === 'completed' ? 'used' : 'reserved';
}

function quotaError(message) {
  return Object.assign(new Error(message), { statusCode: 403 });
}

async function reserveScan(pool, userId, file) {
  const connection = await pool.getConnection();
  let committing = false;
  try {
    await connection.beginTransaction();
    // Serialize quota check + insertion across web/mobile and backend processes.
    const [users] = await connection.execute('SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [userId]);
    if (!users.length) throw quotaError('The account is unavailable. Please sign in again.');
    const [subscriptions] = await connection.execute(
      `SELECT p.name, p.scan_limit FROM user_subscriptions AS us
       INNER JOIN subscription_plans AS p ON p.plan_id = us.plan_id
       WHERE us.user_id = ? AND us.status = 'active'
       ORDER BY us.starts_at DESC LIMIT 1`, [userId]);
    const plan = subscriptions[0];
    if (!plan) throw quotaError('An active subscription is required to upload an image.');
    // Read database time AFTER the account lock. Bind insertion to this same day,
    // even if midnight passes between the allowance check and the INSERT.
    const window = await readDailyWindow(connection);
    if (plan.scan_limit !== null) {
      const [counts] = await connection.execute(
        `SELECT COUNT(*) AS allowance_used FROM scans
         WHERE user_id = ? AND is_deleted = FALSE AND status IN ${COUNTED_STATUSES_SQL}
           AND created_at >= FROM_UNIXTIME(?) AND created_at < FROM_UNIXTIME(?)`, [userId, window.start, window.end]);
      if (Number(counts[0].allowance_used) >= Number(plan.scan_limit)) {
        throw quotaError('Your daily scan allowance is fully used or reserved by pending scans. It resets at 12:00 AM Philippine time (Asia/Manila). Failed scans do not count.');
      }
    }
    const [result] = await connection.execute(
      `INSERT INTO scans (user_id, original_file_name, stored_file_name, file_path,
        file_size_bytes, mime_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', FROM_UNIXTIME(?))`,
      [userId, file.originalname, file.filename, file.path, file.size, file.mimetype, window.now]);
    committing = true;
    await connection.commit();
    return result.insertId;
  } catch (error) {
    // A lost commit acknowledgement must not cause deletion of a possibly saved image.
    if (committing) error.scanMayBeSaved = true;
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { COUNTED_STATUSES_SQL, ALLOWANCE_TIMEZONE, dailyWindow, readDailyWindow, creditStatus, reserveScan };
