import type { User } from '../../types';
import type { AuthCredentials, AuthServiceResult, RegisterPayload, ProfileUpdatePayload } from './authService';
import type { AuthResponse, MeResponse } from '../api/contracts';
import { API_ROUTES } from '../api/contracts';
import { mapUser, mapMe, unwrap } from '../api/adapters';
import { apiRequest } from '../api/client';
import { clearSession, getToken, saveToken, sessionRevision } from '../api/session';
let busy = false;
async function authenticate(path: string, payload: unknown): Promise<AuthServiceResult<User>> {
  if (busy) return { success: false, error: 'A sign-in request is already running.' };
  busy = true;
  const version = sessionRevision();
  try {
    const response = await apiRequest<AuthResponse>(path, { method: 'POST', json: payload, auth: false });
    const data = unwrap(response);
    const user = mapUser(data.user);
    await saveToken(data.token, version);
    return { success: true, data: user };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Sign-in failed.' }; }
  finally { busy = false; }
}
export const backendAuthService = {
  getRevision: sessionRevision,
  login(credentials: AuthCredentials) {
    return authenticate(API_ROUTES.login, { email: credentials.email.trim().toLowerCase(), password: credentials.password });
  },
  register(payload: RegisterPayload) {
    return authenticate(API_ROUTES.register, { ...payload, firstName: payload.firstName.trim(), lastName: payload.lastName.trim(), email: payload.email.trim().toLowerCase() });
  },
  async logout() { await clearSession(); },
  async getSession(): Promise<User | null> {
    if (!await getToken()) return null;
    return mapMe(await apiRequest<MeResponse>(API_ROUTES.me));
  },
  async updateProfile(_user: User, _payload: ProfileUpdatePayload): Promise<AuthServiceResult<User>> {
    return { success: false, error: 'Profile editing is unavailable: the current backend has no profile-update endpoint.' };
  },
  async updatePlan(_user: User, _plan: User['plan']): Promise<User> {
    throw new Error('Backend payment integration is unavailable.');
  },
};
