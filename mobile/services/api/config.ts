// A failed backend request must never fall back to mock results.
export const OFFLINE_MODE = process.env.EXPO_PUBLIC_API_MODE !== 'backend';
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:5000').replace(/\/+$/, '');
export const AI_MEDIA_BASE_URL = (process.env.EXPO_PUBLIC_AI_MEDIA_BASE_URL || 'http://10.0.2.2:5001').replace(/\/+$/, '');
export function validateBaseUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== ''))
    throw new Error('Configure a plain HTTP(S) server origin without credentials or a path.');
  if (typeof __DEV__ !== 'undefined' && !__DEV__ && url.protocol !== 'https:')
    throw new Error('Release builds require HTTPS server URLs.');
  return url;
}
