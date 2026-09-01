const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../config/db');
const { detectImageType } = require('../middlewares/uploadMiddleware');
const { heatmapUrl, requestAnalysis } = require('../services/aiService');

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

function parsePositiveInteger(value, fallback, maximum) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    return null;
  }

  return parsed;
}

function formatAnalysis(row) {
  if (!row.result_id) {
    return {
      status: row.status === 'failed' ? 'failed' : row.status === 'processing' ? 'processing' : 'pending_ai_service',
      result: null
    };
  }

  return {
    status: 'completed',
    result: {
      verdict: row.verdict,
      confidence_score: Number(row.confidence_score),
      authentic_score: Number(row.authentic_score),
      ai_generated_score: Number(row.ai_generated_score),
      readable_explanation: row.readable_explanation,
      heatmap_url: heatmapUrl(row.heatmap_path),
      model_version: row.model_version,
      analyzed_at: row.analyzed_at
    }
  };
}

async function saveAnalysis(scanId, analysis, processingTimeMs) {
  await pool.execute(
    `INSERT INTO analysis_results
      (scan_id, verdict, confidence_score, authentic_score, ai_generated_score,
       heatmap_path, readable_explanation, raw_model_output, processing_time_ms, model_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       verdict = VALUES(verdict),
       confidence_score = VALUES(confidence_score),
       authentic_score = VALUES(authentic_score),
       ai_generated_score = VALUES(ai_generated_score),
       heatmap_path = VALUES(heatmap_path),
       readable_explanation = VALUES(readable_explanation),
       raw_model_output = VALUES(raw_model_output),
       processing_time_ms = VALUES(processing_time_ms),
       model_version = VALUES(model_version),
       analyzed_at = CURRENT_TIMESTAMP`,
    [
      scanId,
      analysis.verdict,
      analysis.confidence_score,
      analysis.authentic_score,
      analysis.ai_generated_score,
      analysis.heatmap_path,
      analysis.readable_explanation,
      JSON.stringify(analysis.raw_model_output),
      processingTimeMs,
      analysis.model_version
    ]
  );
}

async function analyseUploadedScan(scanId, file) {
  if (!process.env.AI_SERVICE_URL?.trim()) {
    return { attempted: false };
  }

  await pool.execute("UPDATE scans SET status = 'processing' WHERE scan_id = ?", [scanId]);
  const startedAt = Date.now();

  try {
    const analysis = await requestAnalysis({
      filePath: file.path,
      mimeType: file.mimetype,
      originalFileName: file.originalname
    });

    if (!analysis) {
      await pool.execute("UPDATE scans SET status = 'queued' WHERE scan_id = ?", [scanId]);
      return { attempted: false };
    }

    await saveAnalysis(scanId, analysis, Date.now() - startedAt);
    await pool.execute("UPDATE scans SET status = 'completed' WHERE scan_id = ?", [scanId]);
    return { attempted: true, completed: true };
  } catch (error) {
    await pool.execute("UPDATE scans SET status = 'failed' WHERE scan_id = ?", [scanId]);
    return { attempted: true, completed: false, error };
  }
}

function formatScan(row) {
  const analysis = formatAnalysis(row);

  return {
    scan_id: row.scan_id,
    original_file_name: row.original_file_name,
    mime_type: row.mime_type,
    file_size_bytes: Number(row.file_size_bytes),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    image_url: `/api/v1/scans/${row.scan_id}/image`,
    analysis_status: analysis.status,
    analysis: analysis.result
  };
}

async function findOwnedScan(scanId, userId) {
  const [scans] = await pool.execute(
    `SELECT s.scan_id, s.user_id, s.original_file_name, s.stored_file_name,
            s.mime_type, s.file_size_bytes, s.status, s.created_at, s.updated_at,
            ar.result_id, ar.verdict, ar.confidence_score, ar.authentic_score,
            ar.ai_generated_score, ar.readable_explanation, ar.heatmap_path,
            ar.model_version, ar.analyzed_at
     FROM scans AS s
     LEFT JOIN analysis_results AS ar ON ar.scan_id = s.scan_id
     WHERE s.scan_id = ? AND s.user_id = ? AND s.is_deleted = FALSE
     LIMIT 1`,
    [scanId, userId]
  );

  return scans[0] || null;
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

    const analysisAttempt = await analyseUploadedScan(result.insertId, req.file);
    const scan = await findOwnedScan(result.insertId, req.user.userId);
    const formattedScan = formatScan(scan);

    return res.status(201).json({
      success: true,
      message: analysisAttempt.completed
        ? 'Image uploaded and analysed successfully.'
        : analysisAttempt.attempted
          ? 'Image uploaded, but AI analysis did not complete.'
          : 'Image uploaded and queued for analysis.',
      data: formattedScan
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

async function listScans(req, res, next) {
  try {
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);

    if (limit === null || !Number.isInteger(offset) || offset < 0) {
      return res.status(400).json({
        success: false,
        message: 'limit must be between 1 and 100, and offset must be zero or greater.'
      });
    }

    const [scans] = await pool.execute(
      `SELECT s.scan_id, s.original_file_name, s.mime_type, s.file_size_bytes,
              s.status, s.created_at, s.updated_at,
              ar.result_id, ar.verdict, ar.confidence_score, ar.authentic_score,
              ar.ai_generated_score, ar.readable_explanation, ar.heatmap_path,
              ar.model_version, ar.analyzed_at
       FROM scans AS s
       LEFT JOIN analysis_results AS ar ON ar.scan_id = s.scan_id
       WHERE s.user_id = ? AND s.is_deleted = FALSE
       ORDER BY s.created_at DESC, s.scan_id DESC
       LIMIT ? OFFSET ?`,
      [req.user.userId, limit, offset]
    );

    const [counts] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM scans
       WHERE user_id = ? AND is_deleted = FALSE`,
      [req.user.userId]
    );

    return res.status(200).json({
      success: true,
      data: {
        scans: scans.map(formatScan),
        pagination: {
          total: Number(counts[0].total),
          limit,
          offset
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function getScan(req, res, next) {
  try {
    const scanId = parsePositiveInteger(req.params.scanId, null, Number.MAX_SAFE_INTEGER);
    if (scanId === null) {
      return res.status(400).json({
        success: false,
        message: 'scanId must be a positive whole number.'
      });
    }

    const scan = await findOwnedScan(scanId, req.user.userId);
    if (!scan) {
      return res.status(404).json({
        success: false,
        message: 'Scan not found.'
      });
    }

    return res.status(200).json({
      success: true,
      data: formatScan(scan)
    });
  } catch (error) {
    return next(error);
  }
}

async function getScanImage(req, res, next) {
  try {
    const scanId = parsePositiveInteger(req.params.scanId, null, Number.MAX_SAFE_INTEGER);
    if (scanId === null) {
      return res.status(400).json({
        success: false,
        message: 'scanId must be a positive whole number.'
      });
    }

    const scan = await findOwnedScan(scanId, req.user.userId);
    if (!scan) {
      return res.status(404).json({
        success: false,
        message: 'Scan not found.'
      });
    }

    const imageDirectory = path.resolve(__dirname, '../../uploads/images');
    const imagePath = path.resolve(imageDirectory, path.basename(scan.stored_file_name));

    if (!imagePath.startsWith(`${imageDirectory}${path.sep}`)) {
      const error = new Error('Stored image path is invalid.');
      error.statusCode = 500;
      throw error;
    }

    try {
      await fs.access(imagePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'Stored image file was not found.'
      });
    }

    res.type(scan.mime_type);
    return res.sendFile(imagePath);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadScan,
  listScans,
  getScan,
  getScanImage
};
