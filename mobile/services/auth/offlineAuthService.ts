import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../../types';
import type { RegisterRequest, AuthResponse, ApiUser } from '../api/contracts';
import { FREE_SCAN_LIMIT } from '../api/contracts';
import { mapUser, unwrap } from '../api/adapters';
import { clearLatestScanResult } from '../scan/scanSession';
export type AuthCredentials = { email: string; password: string };
export type RegisterPayload = RegisterRequest;
export type ProfileUpdatePayload = { name: string };
export type AuthServiceResult<T> = { success: true; data: T } | { success: false; error: string };
const SESSION_KEY = '@authentiscan/offline-v2/session';
const profilesKey = (email: string) => '@authentiscan/offline-v2/profile/' + encodeURIComponent(email.trim().toLowerCase());
let revision = 0;
// Test identities only. Passwords are not stored, transmitted, or verified.
// Future real integration requires secure token storage. Mock token is never persisted.
async function saveResponse(response: AuthResponse): Promise<AuthServiceResult<User>> {
  const data = unwrap(response);
  const user = mapUser(data.user);
  revision++;
  clearLatestScanResult();
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return { success: true, data: user };
}
const authService = {
  getRevision: () => revision,
  async login(credentials: AuthCredentials): Promise<AuthServiceResult<User>> {
    const email = credentials.email.trim().toLowerCase();
    if (!email.includes('@') || !credentials.password) return { success: false, error: 'Email and password are required.' };
    const saved = await AsyncStorage.getItem(profilesKey(email));
    if (!saved) return { success: false, error: 'Register an offline test account first. Web accounts are not connected.' };
    return saveResponse({ success: true, data: { user: JSON.parse(saved) as ApiUser, token: 'OFFLINE-TEST-NOT-A-JWT' } });
  },
  async register(payload: RegisterPayload): Promise<AuthServiceResult<User>> {
    if (![payload.firstName, payload.lastName, payload.email, payload.password].every(v => typeof v === 'string' && v.trim()))
      return { success: false, error: 'First name, last name, email, and password are required.' };
    if (!payload.email.includes('@')) return { success: false, error: 'Enter a valid email address.' };
    if (payload.password.length < 8) return { success: false, error: 'Password must contain at least 8 characters.' };
    const email = payload.email.trim().toLowerCase();
    if (await AsyncStorage.getItem(profilesKey(email))) return { success: false, error: 'This offline test account already exists.' };
    const user: ApiUser = { user_id: Date.now(), first_name: payload.firstName.trim(), last_name: payload.lastName.trim(), email,
      plan: { name: 'Free', scan_limit: FREE_SCAN_LIMIT, billing_cycle: 'free' } };
    await AsyncStorage.setItem(profilesKey(email), JSON.stringify(user));
    return saveResponse({ success: true, message: 'Offline test registration only.', data: { user, token: 'OFFLINE-TEST-NOT-A-JWT' } });
  },
  async logout(): Promise<void> {
    revision++;
    clearLatestScanResult();
    await AsyncStorage.removeItem(SESSION_KEY);
  },
  async getSession(): Promise<User | null> {
    const stored = await AsyncStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    try {
      const user = JSON.parse(stored) as User;
      return typeof user.email === 'string' && typeof user.firstName === 'string' && typeof user.id === 'string' ? user : null;
    } catch { return null; }
  },
  async updateProfile(_user: User, _payload: ProfileUpdatePayload): Promise<AuthServiceResult<User>> {
    return { success: false, error: 'Profile editing is unavailable: the current backend has no profile-update endpoint.' };
  },
  async updatePlan(_user: User, _plan: User['plan']): Promise<User> {
    throw new Error('Subscriptions cannot be activated locally. Backend payment integration is unavailable.');
  },
};
export default authService;
