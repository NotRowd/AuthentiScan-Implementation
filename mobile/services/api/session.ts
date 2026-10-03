import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './config';
import { clearLatestScanResult } from '../scan/scanSession';
const KEY = 'authentiscan.backend.session.v1';
let token: string | null = null;
let revision = 0;
let loaded = false;
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
  if (loaded) return token;
  const version = revision;
  await writes;
  const stored = await SecureStore.getItemAsync(KEY);
  if (version !== revision) return token;
  if (stored) {
    try {
      const session = JSON.parse(stored);
      token = session.origin === API_BASE_URL && typeof session.token === 'string' ? session.token : null;
    } catch { token = null; }
  }
  loaded = true;
  return token;
}
export async function saveToken(value: string, expectedRevision: number): Promise<void> {
  if (typeof value !== 'string' || !value || expectedRevision !== revision) throw new Error('Session changed. Please sign in again.');
  await write(async () => {
    if (expectedRevision !== revision) throw new Error('Session changed. Please sign in again.');
    await SecureStore.setItemAsync(KEY, JSON.stringify({ origin: API_BASE_URL, token: value }));
  });
  if (expectedRevision !== revision) throw new Error('Session changed. Please sign in again.');
  token = value; loaded = true; revision++;
  clearLatestScanResult();
}
export async function clearSession(expectedToken?: string): Promise<void> {
  if (expectedToken !== undefined && token !== expectedToken) return;
  token = null; loaded = true; revision++;
  clearLatestScanResult();
  listeners.forEach(listener => listener());
  await write(() => SecureStore.deleteItemAsync(KEY));
}
