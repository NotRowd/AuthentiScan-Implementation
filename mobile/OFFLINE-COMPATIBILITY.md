# Offline backend-compatibility preparation

This document describes OFFLINE MODE only. Backend integration is now implemented;
see BACKEND-INTEGRATION.md. Set EXPO_PUBLIC_API_MODE=offline in .env.local and
restart Expo to run the tests described here. This PC's .env.local currently selects
backend mode. Offline samples are never imported into backend accounts.

## Run and test

Open this folder in VS Code, run `npm.cmd install`, then `npx.cmd expo start`.
With the emulator running, press A. Reload once after this update.

Register a NEW offline test account with separate first and last names and an
8-character password. Passwords are neither stored nor verified in mock mode;
use made-up details, never real credentials. Web accounts are not available.
The old shared prototype session/history is not imported or deleted.

Choose a local JPEG, PNG, or WebP up to 10 MB and select a mock response:
AI-generated, authentic, uncertain, queued, processing, or failed. Scenarios
are selected by you, not predicted from the image. Pending/failed samples
have no verdict or score. Pending samples do not process in the background.

The five-scan Free limit counts all saved samples, including failed/pending,
matching the current backend. There is no automatic monthly reset. To test
more cases, register a second test account. History and dashboard are scoped
to that account. Signing out clears the session and current report.

Premium's PHP 249/month label mirrors the database seed; payment activation,
profile changes, deletion, feedback submission, export, object detection,
and detailed manipulation indicators remain unavailable. Grad-CAM accepts
an optional local/data image fixture; no remote image is fetched in this build.

## Verification

- `node tests/offline-contracts.cjs`
- `npx.cmd tsc --noEmit`

Tests substitute in-memory storage and forbid fetch. They cover wire-to-UI
mapping, scores, registration validation, account isolation, cancellation,
pending/failed results, quota, and disabled backend transport.

## Backend contract reference

Contracts mirror AuthentiScan-Implementation commit 0f46068 on
ai-model-foundation: /api/v1/auth/register, /login, /me, /scans, /users/stats.
Login/register return data.user + data.token. /me returns data.user + data.plan.
The scan upload field is image (multipart), with Bearer authorization.
Backend mode now stores tokens in SecureStore, uses authenticated transport,
handles expired sessions, loads paginated history/stats, and resolves images.
The UI adapter uses camelCase and percentage display values; API scores remain
0..1 and API verdicts are unchanged.

Before connecting, agree on an Android-reachable server/media URL. Never
assume a PC's loopback URL points to the PC from Android. Do not connect the
mobile application directly to MySQL or expose the AI service unnecessarily.

No code has been pushed or merged by this preparation step.
