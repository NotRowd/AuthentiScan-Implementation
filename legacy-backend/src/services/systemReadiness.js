// A health check never starts inference, retries uploads, or changes records.
async function checkAiReadiness(fetchImpl = fetch, baseUrl = process.env.AI_SERVICE_URL, timeoutMs = 5000) {
  if (!baseUrl?.trim()) return 'not_ready';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(baseUrl.trim().replace(/\/+$/, '') + '/health', {
      signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' }
    });
    if (!response.ok) return 'unavailable';
    const data = await response.json();
    return data.success === true && data.model_loaded === true ? 'ready' : 'not_ready';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timeout);
  }
}
module.exports = { checkAiReadiness };
