const fs = require('fs/promises');

const ALLOWED_VERDICTS = new Set(['authentic', 'ai_generated', 'uncertain']);
const ANALYSIS_TIMEOUT_MS = 120000;

function aiServiceBaseUrl() {
  const value = process.env.AI_SERVICE_URL?.trim();
  return value ? value.replace(/\/$/, '') : null;
}

function validateScore(value, fieldName) {
  const score = typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error(`AI service returned an invalid ${fieldName}.`);
  }

  return score;
}

function validateAnalysis(data) {
  if (!data || !ALLOWED_VERDICTS.has(data.verdict)) {
    throw new Error('AI service returned an invalid verdict.');
  }

  if (typeof data.readable_explanation !== 'string' || !data.readable_explanation.trim()) {
    throw new Error('AI service returned no explanation.');
  }

  if (typeof data.model_version !== 'string' || !data.model_version.trim()) {
    throw new Error('AI service returned no model version.');
  }

  return {
    verdict: data.verdict,
    confidence_score: validateScore(data.confidence_score, 'confidence score'),
    authentic_score: validateScore(data.authentic_score, 'authentic score'),
    ai_generated_score: validateScore(data.ai_generated_score, 'AI-generated score'),
    readable_explanation: data.readable_explanation.trim(),
    heatmap_path: typeof data.heatmap_path === 'string' ? data.heatmap_path : null,
    model_version: data.model_version.trim(),
    raw_model_output: data
  };
}

async function requestAnalysis({ filePath, mimeType, originalFileName }, { fetchImpl = fetch, timeoutMs = ANALYSIS_TIMEOUT_MS } = {}) {
  const baseUrl = aiServiceBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const image = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append('image', new Blob([image], { type: mimeType }), originalFileName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/predict`, {
      method: 'POST',
      redirect: 'error',
      body: formData,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw Object.assign(new Error(response.status >= 500
        ? 'The AI service failed while analysing the image. Check its terminal before trying again.'
        : 'The AI service rejected this image. Try a valid JPEG, PNG, or WebP image.'), { code: 'AI_RESPONSE_ERROR' });
    }

    try {
      if (payload?.success !== true) throw new Error('Missing successful response.');
      return validateAnalysis(payload.data);
    } catch {
      throw Object.assign(new Error('The AI service returned an incomplete or invalid result. Check the AI service logs.'), { code: 'AI_INVALID_RESPONSE' });
    }
  } catch (error) {
    if (controller.signal.aborted) throw Object.assign(new Error('AI analysis timed out. Check the AI service before trying again.'), { code: 'AI_TIMEOUT' });
    if (error.code?.startsWith('AI_')) throw error;
    throw Object.assign(new Error('Cannot reach the AI service. Start it on its configured port and wait for the model to finish loading.'), { code: 'AI_UNAVAILABLE' });
  } finally {
    clearTimeout(timeout);
  }
}

function heatmapUrl(heatmapPath) {
  const baseUrl = aiServiceBaseUrl();
  if (!baseUrl || !heatmapPath || !heatmapPath.startsWith('/heatmaps/')) {
    return null;
  }

  return `${baseUrl}${heatmapPath}`;
}

module.exports = {
  heatmapUrl,
  requestAnalysis
};
