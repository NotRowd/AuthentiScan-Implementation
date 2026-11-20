import type { User } from '../../types';
import type { AuthCredentials, AuthServiceResult, RegisterPayload, ProfileUpdatePayload } from './authService';
import type { MeResponse } from '../api/contracts';
import { API_ROUTES } from '../api/contracts';
import { mapMe } from '../api/adapters';
import { ApiError, apiRequest } from '../api/client';
import { signIn, completeRegistration } from '../api/firebaseAuth';
import { clearSession, getToken, saveToken, sessionRevision } from '../api/session';
let busy = false;
async function authenticate(credentials: AuthCredentials): Promise<AuthServiceResult<User>> {
  if (busy) return { success: false, error: 'A sign-in request is already running.' };
  busy = true;
  const version = sessionRevision();
  try {
    const data = await signIn(credentials.email.trim(), credentials.password);
    if (!data.refreshToken) throw new Error('Firebase did not return a refresh token.');
    await saveToken(data.idToken, version, data.refreshToken, Number(data.expiresIn));
    try {
      {
        try { return { success: true, data: mapMe(await apiRequest<MeResponse>(API_ROUTES.me)) }; }
        catch (error) { if (!(error instanceof ApiError) || error.status !== 404) throw error; }
        const [first, ...last] = (data.displayName?.trim() || 'New User').split(/\s+/);
        await apiRequest('/api/me', { method: 'POST', json: { firstName: first.slice(0, 100), lastName: (last.join(' ') || 'User').slice(0, 100) } });
      }
      return { success: true, data: mapMe(await apiRequest<MeResponse>(API_ROUTES.me)) };
    } catch (error) {
      if (sessionRevision() === version + 1) await clearSession();
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sign-in failed.';
    return { success: false, error: message };
  }
  finally { busy = false; }
}
export const backendAuthService = {
  getRevision: sessionRevision,
  login(credentials: AuthCredentials) {
    return authenticate(credentials);
  },
  async register(payload: RegisterPayload) {
    const firstName = payload.firstName.trim(), lastName = payload.lastName.trim();
    if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100 || payload.password.length < 8) {
      return Promise.resolve<AuthServiceResult<User>>({ success: false, error: 'Enter names up to 100 characters and a password of at least eight characters.' });
    }
    if(!payload.challenge_id||!/^\d{6}$/.test(payload.code||'')||payload.accept_terms!==true)return {success:false as const,error:'Verify your email code before creating an account.'};
    try{await completeRegistration({...payload,firstName,lastName,challenge_id:payload.challenge_id,code:payload.code!,accept_terms:true});}
    catch(error){return {success:false as const,error:error instanceof Error?error.message:'Could not confirm registration.'};}
    // The account/profile now exist and are verified. Sign in normally so secure
    // storage, refresh tokens and session ownership use the existing flow.
    const result=await authenticate(payload);
    return result.success?result:{success:false as const,error:'Your verified account was created. Please sign in with your password to continue.'};
  },
  async logout() { await clearSession(); },
  async getSession(): Promise<User | null> {
    if (!await getToken()) return null;
    return mapMe(await apiRequest<MeResponse>(API_ROUTES.me));
  },
  async updateProfile(user: User, payload: ProfileUpdatePayload): Promise<AuthServiceResult<User>> {
    const [first, ...last] = 'name' in payload ? payload.name.trim().split(/\s+/) : [];
    const firstName = 'firstName' in payload ? payload.firstName.trim() : first;
    const lastName = 'lastName' in payload ? payload.lastName.trim() : last.join(' ') || user.lastName;
    if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) {
      return { success: false, error: 'Enter a first and last name, up to 100 characters each.' };
    }
    try {
      return { success: true, data: mapMe(await apiRequest<MeResponse>(API_ROUTES.me, {
        method: 'PATCH', json: { firstName, lastName },
      })) };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Could not update your profile.' }; }
  },
  async updatePlan(_user: User, _plan: User['plan']): Promise<User> {
    throw new Error('Backend payment integration is unavailable.');
  },
};
