import { API_BASE_URL, OFFLINE_MODE, validateBaseUrl } from './config';
import { clearSession, getToken, sessionRevision } from './session';
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; json?: unknown; body?: FormData; signal?: AbortSignal; timeoutMs?: number; idempotencyKey?: string };
export async function apiRequest<T>(path: string, options: Options = {}): Promise<T> {
  if (OFFLINE_MODE) throw new Error('Backend connection is disabled in offline mode.');
  validateBaseUrl(API_BASE_URL);
  if (path !== '/api/me' && (!path.startsWith('/api/v1/') || path.includes('://'))) throw new Error('Invalid API path.');
  const version = sessionRevision();
  const token = await getToken();
  if (!token || version !== sessionRevision()) throw new ApiError('Please sign in again.', 401);
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel);
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 20000);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (options.json !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  try {
    const response = await fetch(API_BASE_URL + path, {
      method: options.method || 'GET', headers, signal: controller.signal,
      body: options.body ?? (options.json !== undefined ? JSON.stringify(options.json) : undefined),
      redirect: 'error',
    });
    const payload = await response.json().catch(() => null);
    if (version !== sessionRevision()) throw new Error('Session changed. Please sign in again.');
    if (response.status === 401 && token) {
      await clearSession(token);
      throw new ApiError('Your session expired. Please sign in again.', 401);
    }
    if (!response.ok || (path !== '/api/me' && !payload?.success)) throw new ApiError(payload?.message || 'The server could not complete this request.', response.status);
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted) {
      const action = timedOut ? 'Request timed out.' : 'Request cancelled.';
      const upload = path === '/api/v1/scans' && options.method === 'POST';
      throw new Error(action + (upload ? ' An upload may already be saved; check History before retrying.' : ''));
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/network request failed|fetch failed|failed to fetch|connection reset|socketexception|econnrefused|unable to resolve host/i.test(message)) {
      const hint = path === '/api/v1/scans' && options.method === 'POST'
          ? ' The image may already be saved; refresh History before uploading again.' : '';
      throw new Error('Connection interrupted. Check that the backend is running, then try again.' + hint);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
