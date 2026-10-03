import { API_BASE_URL, AI_MEDIA_BASE_URL, OFFLINE_MODE, validateBaseUrl } from './config';
import { clearSession, getToken, sessionRevision } from './session';
export async function mediaSource(uri: string, heatmap = false): Promise<{ uri: string; headers?: Record<string, string> } | null> {
  if (/^(file:\/\/|content:\/\/|data:image\/)/.test(uri)) return { uri };
  if (OFFLINE_MODE || !uri) return null;
  if (!heatmap) {
    if (!/^\/api\/v1\/scans\/[1-9]\d*\/image$/.test(uri)) throw new Error('Invalid protected image path.');
    validateBaseUrl(API_BASE_URL);
    const token = await getToken();
    if (!token) throw new Error('Please sign in again.');
    return { uri: API_BASE_URL + uri, headers: { Authorization: 'Bearer ' + token } };
  }
  const mediaOrigin = validateBaseUrl(AI_MEDIA_BASE_URL).origin;
  const url = new URL(uri, mediaOrigin);
  if (!/^\/heatmaps\/[a-zA-Z0-9_.-]+$/.test(url.pathname) || url.search || url.hash || url.username || url.password)
    throw new Error('Unsupported heatmap URL.');
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && ['5001', '5002'].includes(url.port);
  if (url.origin !== mediaOrigin && !loopback) throw new Error('Heatmap host does not match configured AI media server.');
  // The AI service has no JWT endpoint. Never forward the backend token to it.
  return { uri: mediaOrigin + url.pathname };
}

// Keep protected images in memory, not in a public URL or a persistent shared cache.
// Expo Go's native Image path can omit Authorization even when source headers are set.
export async function loadMediaSource(uri: string, heatmap = false, signal?: AbortSignal) {
  const source = await mediaSource(uri, heatmap);
  if (!source?.headers) return source;
  const version = sessionRevision();
  const response = await fetch(source.uri, { headers: source.headers, signal, redirect: 'error', cache: 'no-store' });
  if (version !== sessionRevision()) throw new Error('Session changed.');
  if (response.status === 401) {
    await clearSession(source.headers.Authorization.slice('Bearer '.length));
    throw new Error('Please sign in again.');
  }
  if (!response.ok) throw new Error(response.status === 404 ? 'Stored image was not found.' : 'Image could not be loaded.');
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new Error('Unsupported image response.');
  const limit = 10 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Image is too large.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > limit) throw new Error('Image is too large.');
  if (signal?.aborted || version !== sessionRevision()) throw new Error('Image request cancelled.');
  // Encode in chunks without spreading a large byte array into a function call.
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    let chunk = '';
    for (let i = offset; i < Math.min(offset + 8192, bytes.length); i++) chunk += String.fromCharCode(bytes[i]);
    chunks.push(chunk);
  }
  return { uri: `data:${type};base64,${btoa(chunks.join(''))}` };
}
