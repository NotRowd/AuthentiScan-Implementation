import { OFFLINE_MODE } from '../api/config';
import { sendPasswordReset } from '../api/firebaseAuth';

export type PasswordResetRequestResult =
  | { success: true; delivery: 'not-configured' | 'requested' }
  | { success: false; error: string };

export const passwordResetService = {
  async requestReset(email: string): Promise<PasswordResetRequestResult> {
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return { success: false, error: 'Enter a valid email address.' };
    }
    if (OFFLINE_MODE) return { success: true, delivery: 'not-configured' };
    await sendPasswordReset(email.trim());
    return { success: true, delivery: 'requested' };
  },
};
