# Full web migration verification — 2026-09-22

## AI correctness contract — 2026-09-27

- Added versioned AI metadata validation, selected-class score labels, explicit
  heatmap targets/unavailable states, and legacy-safe web/PDF explanations.
- Final isolated emulator regression: 25 passed, zero failed, clean shutdown.
  Node unit subset: 12 passed. Production build, syntax and scoped lint passed.
- AI checks: 14 focused regressions and 5 existing tests passed; a real-model
  offline sample preserved its classification score and produced a targeted map.
- Available, uncertain, and legacy PDF fixtures: all five pages rendered and
  visually inspected. No browser visual pass performed for this update.
- Model weights/threshold unchanged; no retraining or accuracy improvement claim.
  No live cloud records, user credits, or mobile code changed by verification.
- One HTTP-adapter fixture initially failed, then passed in isolation and the
  final full rerun; its intermittent cause was not established.
- Detailed scope, evidence, caveats and restart instructions:
  `../ai-work/2026-09-27/IMPLEMENTATION.md`.

## Protected Cloudinary storage — 2026-09-23

- Cloudinary SDK 2.11.0 installed and pinned. Credential values were not logged.
- Live synthetic asset check passed: credential ping, authenticated raw upload,
  exact-byte download, unsigned delivery blocked, overwrite rejected. Only the
  test's random synthetic object was removed afterward.
- Live API workflow passed on a separate temporary localhost port: real AI scan,
  Cloudinary provider persisted in Firestore, original bytes preserved, valid PNG
  heatmap, no local original copy, and denied anonymous/other-account access to
  result, original, heatmap and report. PDF/history worked; one credit used and
  four remaining. An older labelled test scan still reads its local media.
- Two labelled synthetic Firebase accounts and one cloud scan remain as evidence:
  .test-results/cloudinary-workflow-b2767f63-ed7f-4beb-8474-9c78aec38a09.json
  and matching PDF. No existing user records were changed.
- Production build, eight unit tests, syntax and private-file protection passed.
- Full isolated emulator regression: 20 passed, zero failed; test emulators shut
  down cleanly. The user's running cloud backend was not stopped or replaced.
- media-config.json now selects Cloudinary for new cloud-mode scans after restart.
  Existing untagged records keep local storage; no historical files were moved.
- Backend/AI remain local. Restart the user's cloud session and reload the web
  before checking the new banner. The updated API was tested independently;
  the user's still-running old process has not adopted the new configuration.
- Billing and plan settings were not changed. Cloudinary usage quotas still apply.

## Cloud-hybrid activation — live workflow verified

An explicit `npm run start:cloud` mode has been added for live Firebase Auth and
Firestore with private images on local disk. `npm start` keeps the separate local
emulator workflow. MySQL and mobile have not been changed.

- Five unit checks passed: environment isolation, project pinning, private media
  persistence, exclusive writes, invalid paths, size limits and junction rejection.
- Vite private-path probes passed: ordinary, raw and absolute filesystem requests
  cannot serve credential/media probe files.
- Production build passed after the cloud mode changes.
- Read-only live preflight passed on 2026-09-22 using the supplied credential:
  Authentication access, Firestore access, deployed deny-direct-access rules,
  and writable private local media. No cloud records were created by this check.
- The running application was subsequently verified as cloud-hybrid against
  authentiscan-bc704, with a healthy local AI service.
- Explicit live browser smoke test passed: fresh synthetic account/profile,
  real-model scan, original image, Grad-CAM, PDF download, history after reload,
  and logout/login restoring history; no uncaught browser errors.
- Independent Admin read-back verified the test account's owner-scoped completed
  Firestore scan and exactly one allowance credit used. Download has a PDF header.
- Evidence: .test-results/cloud-smoke-2da1dc57-150d-4922-bab1-645893e7183b.json
  and matching PDF. The labelled synthetic account and single artwork scan remain
  in the live project; existing user records were not changed. No password or
  private key was written to this test's evidence.
- This closes the core web Auth/Firestore migration acceptance check, not the
  full deployment gate. Backend, AI and private media still depend on this PC.
  Mobile remains unmigrated; public hosting, restart durability on a host,
  production load/security checks and provider selection are still pending.

The full-web results below describe the earlier emulator verification. The live
cloud workflow above was tested separately. Follow CLOUD-SETUP.md for cloud mode.

Current scope: the implemented web workflow is ported to local Firebase Auth,
Firestore and Storage. The original MySQL application and mobile are untouched.
This is NOT a cloud deployment or a claim of complete product/AI accuracy.

## Full web results

- 14 Node tests passed, including the existing 10 foundation checks and 4 web
  integration scenarios covering real emulator storage, private results/media,
  PDF export, replay-safe submissions, failed-scan refunds, invalid uploads,
  interrupted reservations, and seven concurrent upload requests limited to five.
- Real-model browser test passed using the existing curated-v1-candidate-v1-dev
  service: signup, readiness, upload, classification, Grad-CAM, original image,
  saved details, PDF download, history, refresh, logout and login.
- No uncaught browser exceptions or non-loopback browser requests in that run.
- 390px scan-details view passed the horizontal-overflow check; screenshots reviewed.
- Two-page A4 PDF rendered with Poppler and both pages visually reviewed: record,
  scores, model version, disclaimer, heatmap and page numbering are present.
- Restarted Firebase from a verified snapshot with AI STOPPED: the same account,
  scan, original, heatmap, allowance (4 remaining) and PDF remained available.
- Vite production build and JavaScript checks passed; frontend oxlint passed.
- Final regression rerun after Sharp 0.35.4: 14 passed, 0 failed. Enter-triggered
  snapshot save, verification and emulator shutdown also completed successfully.
- Sharp updated to 0.35.4; seven moderate Firebase CLI transitive audit findings
  remain. Do not use this as a production security certification.
- Vite's development proxy emitted a PassThrough MaxListeners warning during
  repeated browser requests. No failed workflow or browser exception accompanied
  it; this remains a development-tool warning to review before production hosting.

Browser evidence: ignored .test-results/firebase-web-*.png, firebase-web-report.pdf,
and full-web-result.json. The latter contains only a fictional local test login.
Local API tests use labeled synthetic predictions; the browser test uses the
real model, but neither establishes model accuracy or production readiness.

Windows snapshot rename failures were reproduced. Clean shutdown now saves a
separate verified snapshot, recovering completed exports by copy if rename fails.
Previous snapshots are retained. Startup imports only verified complete snapshots.
Use Enter and wait for shutdown; force-closing can still lose unsaved local work.

Remaining: cloud configuration/deployment, production operations/security review,
mobile migration, and unfinished product features (payments/object detection,
password recovery/profile editing). No historical MySQL data was imported.

## Historical foundation verification — 2026-09-21

The notes below describe the earlier stage, not the current feature scope.

Scope: `D:\AuthentiScan - backend\firebase-local` only. No cloud deployment,
Blaze upgrade, MySQL migration, or mobile changes were performed.

## Passed

- JavaScript syntax checks (`npm run check`).
- Vite build (`npm run build`).
- Ten Node tests against real local Auth, Firestore, and Storage emulators
  (`npm test`): 10 passed, 0 failed.
- Headless Chrome browser tests (`node tests/browser.mjs`) covering account
  creation, profile creation, image upload/download, login/logout, session reload,
  and isolation between two fictional accounts.
- Browser testing at 390px wide: no horizontal overflow.
- No uncaught browser page errors or non-loopback browser requests in that run.
- Clean shutdown using Enter: emulator export completed successfully.
- Restart/import verification (`node tests/restart-browser.mjs`): the same Auth
  account, Firestore profile/allowance, and byte-identical Storage image survived.
- Build repeated after final emulator-warning presentation change.

Automated fixtures are synthetic and contain no real scan results. Browser test
accounts and a one-pixel PNG remain in the ignored `.emulator-data/` snapshot.
The screenshot files and browser result summary are in ignored `.test-results/`.

## Known limitations

- This is the migration foundation test bench, not the migrated full web app.
- No AI classification, Grad-CAM, or PDF export is connected in this test version.
- Seven moderate transitive dependency findings remain in Firebase CLI tooling;
  see README. They are not claimed fixed or production-safe.
- Cloud IAM/rules deployment, production behavior, quotas, and billing were not tested.
- Emulator tests do not prove parity with all production Firestore/Storage behavior.
- Force-closing the terminal may lose data since the last successful export.

Follow README.md for startup, manual testing, and the next migration stage.
