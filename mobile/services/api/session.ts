import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './config';
import { clearLatestScanResult } from '../scan/scanSession';
import { refreshCredentials } from './firebaseAuth';
const KEY = 'authentiscan.backend.session.v1';
let token: string | null = null;
let revision = 0;
let loaded = false;
let refreshToken: string | undefined;
let expiresAt = 0;
let refreshing: Promise<string | null> | undefined;
let writes: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
export const sessionRevision = () => revision;
export const onSessionCleared = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function write(action: () => Promise<void>): Promise<void> {
  const result = writes.then(action, action);
  writes = result.catch(() => {});
  return result;
}
export async function getToken(): Promise<string | null> {
  if (loaded) return currentToken();
  const version = revision;
  await writes;
  const stored = await SecureStore.getItemAsync(KEY);
  if (version !== revision) return token;
  if (stored) {
    try {
      const session = JSON.parse(stored);
      token = session.origin === API_BASE_URL && typeof session.token === 'string' ? session.token : null;
      if (token && typeof session.refreshToken === 'string') {
        refreshToken = session.refreshToken;
        expiresAt = Number(session.expiresAt) || 0;
      }
    } catch { token = null; }
  }
  loaded = true;
  return currentToken();
}
function currentToken(): Promise<string | null> {
  if (!token || !refreshToken || Date.now() + 60000 < expiresAt) return Promise.resolve(token);
  if (refreshing) return refreshing;
  const previous = token;
  const version = revision;
  const task = refreshCredentials(refreshToken).then(async data => {
    await saveToken(data.idToken, version, data.refreshToken, Number(data.expiresIn), false);
    return revision === version ? token : null;
  }).catch(async error => {
    if (revision === version && ['TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND', 'INVALID_REFRESH_TOKEN'].includes(error.code)) {
      await clearSession(previous);
    }
    throw error;
  }).finally(() => { if (refreshing === task) refreshing = undefined; });
  refreshing = task;
  return task;
}
export async function saveToken(value: string, expectedRevision: number, nextRefresh?: string, lifetime = 0, newSession = true): Promise<void> {
  if (typeof value !== 'string' || !value || expectedRevision !== revision) throw new Error('Session changed. Please sign in again.');
  if (nextRefresh && (!Number.isFinite(lifetime) || lifetime <= 0)) throw new Error('Invalid session expiry.');
  const expiry = Date.now() + lifetime * 1000;
  await write(async () => {
    if (expectedRevision !== revision) throw new Error('Session changed. Please sign in again.');
    await SecureStore.setItemAsync(KEY, JSON.stringify({ origin: API_BASE_URL, token: value, refreshToken: nextRefresh, expiresAt: expiry }));
  });
  if (expectedRevision !== revision) throw new Error('Session changed. Please sign in again.');
  token = value; loaded = true; refreshToken = nextRefresh; expiresAt = expiry;
  if (newSession) { revision++; refreshing = undefined; clearLatestScanResult(); }
}
export async function clearSession(expectedToken?: string): Promise<void> {
  if (expectedToken !== undefined && token !== expectedToken) return;
  token = null; loaded = true; revision++; refreshToken = undefined; refreshing = undefined; expiresAt = 0;
  clearLatestScanResult();
  listeners.forEach(listener => listener());
  await write(() => SecureStore.deleteItemAsync(KEY));
}
