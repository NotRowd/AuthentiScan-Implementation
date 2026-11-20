# Verification — shared mobile/web baseline, 10 October 2026

Implemented in the active `D:\AuthentiScan-Mobile` app and `firebase-local` backend.
No archived handoff copies, AI weights, inference prompts, thresholds, or saved scans changed.

Passed:

- AI lock: all core source/weight hashes and all scene manifest entries match.
- Read-only live classifier health: `loyd-classifier-v1-research`, manuscript minimum
  score 0.6, `sha256:f56f876dbf8234b6`, `exif-white-rgb-pillow-bilinear-224-v2`.
- Read-only live backend config: cloud-hybrid, `authentiscan-bc704`.
- 27 backend unit checks, including rejection of old/different live AI policies.
- 48 temporary Firebase emulator/HTTP integration tests: owner isolation, credits,
  history, PDF, optional modules, and saved old/new decision-rule compatibility.
- 11 new mocked native transport tests: shared Firebase auth/profile, UUIDs,
  protected images/PDF, policy preservation, readiness, idempotent retries,
  automatic description endpoint, refresh-token concurrency and logout race.
- Five native JSX behavior groups: uncertain localization technical-preview gate,
  independent classification/localization status, no overlays on failed images,
  aligned object boxes/toggle, automatic/cached scene text and manual-only failure retry.
- Existing 21 backend-mode contracts, 16 offline contracts, 10 PDF contracts,
  report feedback and navigation/session checks.
- TypeScript no-emit check.
- Expo iOS and Android production-format JavaScript/Hermes export (1271 and 1395
  modules). Output: `D:\AuthentiScan - backend\mobile-current-ai-export`.

These are build and mocked/emulated checks, not an installed APK/IPA or an iPhone
end-to-end test. No real Firebase accounts, cloud uploads or scan credits were used.
The export is not suitable for public deployment with the development HTTP URL;
release URL validation still requires HTTPS. Use Expo Go for trusted-LAN testing.

Remaining device acceptance: start the mobile backend launcher, restart Expo,
sign in with the web Firebase account, compare the same saved scan on both clients,
check image/box alignment and PDF sharing, submit one image, then log out.
Existing running services were inspected but not stopped/restarted automatically.

Localization's failed-validation status and scene-model limitations are unchanged.
