export type PasswordResetRequestResult =
  | { success: true; delivery: 'not-configured' }
  | { success: false; error: string };

/**
 * Prototype-only reset request boundary.
 *
 * There is no authentication provider or email delivery service configured,
 * so this never sends an email or changes a password. Replace this service
 * with the provider's password-reset API when real authentication is added.
 */
export const passwordResetService = {
  async requestReset(email: string): Promise<PasswordResetRequestResult> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!email.trim() || !email.includes('@')) {
      return { success: false, error: 'Enter a valid email address.' };
    }
    return { success: true, delivery: 'not-configured' };
  },
};
