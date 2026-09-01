const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

function createToken(user) {
  return jwt.sign(
    {
      userId: user.user_id,
      email: user.email
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '7d'
    }
  );
}

async function register(req, res, next) {
  let connection;

  try {
    const { firstName, lastName, email, password } = req.body;

    const validInput = [firstName, lastName, email, password].every(
      (value) => typeof value === 'string' && value.trim()
    );

    if (!validInput) {
      return res.status(400).json({
        success: false,
        message: 'firstName, lastName, email, and password are required.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least 8 characters.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existingUsers] = await connection.execute(
      'SELECT user_id FROM users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [userResult] = await connection.execute(
      `INSERT INTO users
        (first_name, last_name, email, password_hash)
       VALUES (?, ?, ?, ?)`,
      [
        firstName.trim(),
        lastName.trim(),
        normalizedEmail,
        passwordHash
      ]
    );

    const userId = userResult.insertId;

    const [freePlans] = await connection.execute(
      `SELECT plan_id, name, scan_limit
       FROM subscription_plans
       WHERE name = 'Free' AND is_active = TRUE
       LIMIT 1`
    );

    if (freePlans.length === 0) {
      const error = new Error('Free subscription plan is not configured.');
      error.statusCode = 500;
      throw error;
    }

    const freePlan = freePlans[0];

    await connection.execute(
      `INSERT INTO user_subscriptions (user_id, plan_id)
       VALUES (?, ?)`,
      [userId, freePlan.plan_id]
    );

    await connection.commit();

    const user = {
      user_id: userId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: normalizedEmail,
      plan: {
        name: freePlan.name,
        scan_limit: freePlan.scan_limit
      }
    };

    return res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: {
        user,
        token: createToken(user)
      }
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    return next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      !email.trim() ||
      typeof password !== 'string' ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const [users] = await pool.execute(
      `SELECT user_id, first_name, last_name, email, password_hash, status
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [normalizedEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const user = users[0];

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'This account is not active.'
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    await pool.execute(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [user.user_id]
    );

    const [subscriptions] = await pool.execute(
      `SELECT p.name, p.scan_limit, p.billing_cycle
       FROM user_subscriptions AS us
       INNER JOIN subscription_plans AS p ON p.plan_id = us.plan_id
       WHERE us.user_id = ? AND us.status = 'active'
       ORDER BY us.starts_at DESC
       LIMIT 1`,
      [user.user_id]
    );

    const plan = subscriptions[0] || null;

    const safeUser = {
      user_id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      plan
    };

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: safeUser,
        token: createToken(user)
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function getMe(req, res, next) {
  try {
    const [users] = await pool.execute(
      `SELECT user_id, first_name, last_name, email, status,
              created_at, last_login_at
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    const [subscriptions] = await pool.execute(
      `SELECT p.name, p.scan_limit, p.billing_cycle
       FROM user_subscriptions AS us
       INNER JOIN subscription_plans AS p ON p.plan_id = us.plan_id
       WHERE us.user_id = ? AND us.status = 'active'
       ORDER BY us.starts_at DESC
       LIMIT 1`,
      [req.user.userId]
    );

    return res.status(200).json({
      success: true,
      data: {
        user: users[0],
        plan: subscriptions[0] || null
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function getStats(req, res, next) {
  try {
    const [scanStats] = await pool.execute(
      `SELECT
        COUNT(scans.scan_id) AS total_scans,
        COALESCE(SUM(scans.status = 'queued'), 0) AS queued_scans,
        COALESCE(
          SUM(analysis_results.verdict = 'ai_generated'),
          0
        ) AS ai_generated_found
       FROM scans
       LEFT JOIN analysis_results
         ON analysis_results.scan_id = scans.scan_id
       WHERE scans.user_id = ?
         AND scans.is_deleted = FALSE`,
      [req.user.userId]
    );

    const [subscriptions] = await pool.execute(
      `SELECT p.name, p.scan_limit, p.billing_cycle
       FROM user_subscriptions AS us
       INNER JOIN subscription_plans AS p ON p.plan_id = us.plan_id
       WHERE us.user_id = ? AND us.status = 'active'
       ORDER BY us.starts_at DESC
       LIMIT 1`,
      [req.user.userId]
    );

    const totalScans = Number(scanStats[0].total_scans);
    const queuedScans = Number(scanStats[0].queued_scans);
    const aiGeneratedFound = Number(scanStats[0].ai_generated_found);
    const plan = subscriptions[0] || null;

    const scansRemaining =
      plan?.scan_limit === null || plan?.scan_limit === undefined
        ? null
        : Math.max(Number(plan.scan_limit) - totalScans, 0);

    return res.status(200).json({
      success: true,
      data: {
        total_scans: totalScans,
        queued_scans: queuedScans,
        ai_generated_found: aiGeneratedFound,
        scans_remaining: scansRemaining,
        plan
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  getMe,
  getStats
};
