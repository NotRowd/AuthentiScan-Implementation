# Account and feedback implementation — 12 October 2026

## Feedback final-submission update — 17 October 2026

- Replaced editable saved feedback with a read-only thank-you summary on web and Android, including existing records.
- Added labeled usefulness ratings, a one-submission notice, duplicate-click protection, and recovery after an interrupted response or submission from another client.
- Verified: 80 isolated backend/emulator tests, browser regressions (including reload, double submission, lost responses and narrow-screen screenshots), production web build, Android TypeScript, existing mobile contract/panel/wording checks, and the new `tests/feedback-submission.cjs` screen tests. The latter are also included in the mobile `test:current-ai` command.
- Model lock verification passed. No real accounts, emails, payments, or feedback were used in these checks. Physical Android device testing remains a manual check.
- Restart the running backend to activate the transaction rule, then reload the web page/mobile app. Previously saved feedback is preserved; no migration or deletion is needed.

## Delivered

- Web and Firebase-mode mobile: edit first/last name; email is read-only. Shared protected `PATCH /v1/auth/me` changes names only, not roles, plans, credits or authentication identity.
- Web and mobile: request a Firebase password-reset email. Messages do not disclose whether the address is registered. Firebase hosts the reset-link handler; no Gmail integration is needed. The local Auth emulator supplies a test link instead of sending mail.
- Completed scans: one private 1–5-star rating and optional comment (500 characters). As of 17 October 2026, submission is final: both clients show saved feedback read-only. Shared `GET/PUT /v1/scans/:scanId/feedback` requires scan ownership. The transaction rejects changes with HTTP 409; an identical retry returns the existing response without updating its timestamps. Feedback rates report usefulness, does not train the model, and cannot change analysis or credits. Deleting a scan also removes its feedback.
- Firebase-mode mobile: scan deletion with explicit confirmation uses the same protected endpoint as web. Pending/processing scans cannot be deleted from the result screen. Deletion does not refund credits.
- Models, prompts, thresholds and AI artifact files are unchanged.

## Verification performed

- 55 backend/emulator tests passed, including name-field restrictions, ownership, editable feedback, delete cleanup, unchanged credits/inference counts and reset-link completion/reuse rejection.
- Web UI regression suite passed, including profile save failure/retry/cancel, password-reset failure/retry, feedback validation/save failure/retry and narrow-screen layout. Screenshots reviewed for all three new flows.
- Web production build and AI lock verification passed.
- Mobile TypeScript and current-AI contract/panel tests passed. Tests cover the new profile, reset, feedback and delete transports with mocked network/storage.
- Expo production JavaScript bundle exports passed for Android (1,395 modules) and iOS (1,271 modules). These are bundle checks, not installed-device tests or signed app builds.
- Additional mocked native navigation/session and PDF export/share tests passed. These do not replace real-device testing.
- All 16 offline compatibility tests and 21 legacy-backend contract tests passed; new cloud-only actions remain disabled outside Firebase mode.

## Start the updated version

Restart the existing backend session (do not launch a duplicate on port 5002):

```powershell
cd "D:\AuthentiScan - backend\firebase-local"
npm.cmd run start:cloud:mobile
```

Keep the existing classifier service running unchanged. Reload the web page. Reload the Expo app; if it still shows the previous screens, restart Metro:

```powershell
cd "D:\AuthentiScan-Mobile"
npm.cmd start -- --clear
```

## Physical-device and cloud acceptance checks still required

Use a test account you control, on both web and phone, with both clients connected to the same backend.

1. Edit the name on web, then sign in again on the phone and verify it; repeat in reverse. This is shared persistence, not live profile synchronization.
2. Request a reset email, complete its link, and verify the new password on both clients. Real inbox delivery/spam placement was not exercised by emulator tests.
3. Upload from the phone camera/library, refresh history on web and open the same saved scan ID. Compare saved scores/model version; do not compare separately recompressed uploads as if their bytes were identical.
4. Rate a disposable completed report on web; reopen it on phone and web. Confirm the rating and comment are read-only, there is no submission/edit control, and the scan allowance has not changed. Another report can receive its own feedback. Existing feedback is preserved and also becomes read-only.
5. Export PDF on both clients; on the phone test both sharing and cancelling. A prepared PDF does not mean the user saved it.
6. Delete a disposable scan on phone; refresh web history and confirm disappearance. This is permanent and includes feedback; use a test scan only.
7. Log out, use Back, and confirm private screens/report content are inaccessible. Check the native edge-swipe gesture too.

Do not mark device acceptance complete until these checks have been performed.
