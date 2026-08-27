const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../config/db');
const { detectImageType } = require('../middlewares/uploadMiddleware');

async function removeUploadedFile(file) {
  if (!file?.path) {
    return;
  }

  try {
    await fs.unlink(file.path);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function uploadScan(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'An image file is required in the image field.'
      });
    }

    const imageType = await detectImageType(req.file.path);
    if (!imageType) {
      await removeUploadedFile(req.file);
      return res.status(400).json({
        success: false,
        message: 'Only JPEG, PNG, and WebP images are allowed.'
      });
    }

    const storedFileName = `${path.basename(req.file.filename, '.upload')}${imageType.extension}`;
    const storedFilePath = path.join(path.dirname(req.file.path), storedFileName);

    await fs.rename(req.file.path, storedFilePath);
    req.file.filename = storedFileName;
    req.file.path = storedFilePath;
    req.file.mimetype = imageType.mimeType;

    const [subscriptions] = await pool.execute(
      `SELECT p.name, p.scan_limit
       FROM user_subscriptions AS us
       INNER JOIN subscription_plans AS p ON p.plan_id = us.plan_id
       WHERE us.user_id = ? AND us.status = 'active'
       ORDER BY us.starts_at DESC
       LIMIT 1`,
      [req.user.userId]
    );

    const plan = subscriptions[0];

    if (!plan) {
      await removeUploadedFile(req.file);
      return res.status(403).json({
        success: false,
        message: 'An active subscription is required to upload an image.'
      });
    }

    if (plan.scan_limit !== null) {
      const [scanCounts] = await pool.execute(
        `SELECT COUNT(*) AS total_scans
         FROM scans
         WHERE user_id = ? AND is_deleted = FALSE`,
        [req.user.userId]
      );

      if (Number(scanCounts[0].total_scans) >= Number(plan.scan_limit)) {
        await removeUploadedFile(req.file);
        return res.status(403).json({
          success: false,
          message: 'Your plan scan limit has been reached.'
        });
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO scans
        (user_id, original_file_name, stored_file_name, file_path,
         file_size_bytes, mime_type, status)
       VALUES (?, ?, ?, ?, ?, ?, 'queued')`,
      [
        req.user.userId,
        req.file.originalname,
        req.file.filename,
        req.file.path,
        req.file.size,
        req.file.mimetype
      ]
    );

    const [scans] = await pool.execute(
      `SELECT scan_id, original_file_name, mime_type, file_size_bytes, status, created_at
       FROM scans
       WHERE scan_id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Image uploaded and queued for analysis.',
      data: scans[0]
    });
  } catch (error) {
    try {
      await removeUploadedFile(req.file);
    } catch (cleanupError) {
      return next(cleanupError);
    }

    return next(error);
  }
}

module.exports = {
  uploadScan
};
