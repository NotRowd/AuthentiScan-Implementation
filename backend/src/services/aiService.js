const fs = require('fs/promises');

const ALLOWED_VERDICTS = new Set(['authentic', 'ai_generated', 'uncertain']);
const ANALYSIS_TIMEOUT_MS = 120000;

function aiServiceBaseUrl() {
  const value = process.env.AI_SERVICE_URL?.trim();
  return value ? value.replace(/\/$/, '') : null;
}

function validateScore(value, fieldName) {
  const score = Number(value);
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

async function requestAnalysis({ filePath, mimeType, originalFileName }) {
  const baseUrl = aiServiceBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const image = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append('image', new Blob([image], { type: mimeType }), originalFileName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/predict`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.detail || payload?.message || 'AI service could not analyse the image.');
    }

    return validateAnalysis(payload.data);
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
