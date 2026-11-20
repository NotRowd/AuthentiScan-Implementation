# Branded password recovery

The request page is /forgot-password. The new custom action handler is /reset-password.
Firebase still validates and consumes the one-time code; the app never accepts an email supplied by the link as proof of ownership. Continue URLs and API keys supplied by the link are not used for redirects or initialization.

## Connect reset emails

In Firebase Console, project authentiscan-bc704:
1. Open Authentication > Templates > Password reset.
2. Edit the template and choose Customize action URL.
3. For this local PC test, enter http://127.0.0.1:5174/reset-password and save. Keep the local system running. The link works only on this PC.
4. Request a NEW reset email. Previously sent emails still point to the old Firebase page.
5. Confirm matching passwords, completion screen, sign-in with the new password, and rejection of the already-used link.

This is a project-wide template setting. Before public use, change it to the actual publicly hosted HTTPS origin plus /reset-password, and ensure that route and /api/config work without sign-in. Do not leave a localhost URL configured for public users. Restore the default action URL to revert to the existing Firebase page.

The UI resend timer is a convenience; Firebase remains responsible for service-side throttling. Email requests retain a generic account-existence response.

Reference: https://firebase.google.com/docs/auth/custom-email-handler
