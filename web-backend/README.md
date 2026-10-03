# AuthentiScan - Firebase web version

**Cloud accounts/records:** See [CLOUD-SETUP.md](CLOUD-SETUP.md). Use
`npm.cmd run start:cloud` after credential/rules setup. New images use protected
Cloudinary storage; old images and AI remain local. See [CLOUDINARY-SETUP.md](CLOUDINARY-SETUP.md).
No billing upgrade or Firebase Cloud Storage is used. `npm.cmd start` means emulators.

The web no longer requires MySQL. Cloud mode uses live Firebase Authentication
and Firestore with new private images in Cloudinary; emulator mode uses local Firebase
services. Fresh cloud signup, scan, Grad-CAM, PDF, history and login passed live
testing. This remains **hybrid, not fully cloud-hosted**. Mobile has not migrated.

The instructions below are for optional emulator testing. For normal cloud
accounts, use `npm.cmd run start:cloud` and the separate AI terminal.

## Start it on this computer

### Terminal 1: existing AI service

If the AI service is already running at port 5001, leave it running. Otherwise:

```powershell
cd 'D:\AuthentiScan-AI-Foundation\ai-service'
$env:AUTHENTISCAN_MODEL_PATH='D:\AuthentiScan - backend\ai-models\curated-v1-candidate-v1-dev\authentiscan-efficientnet-b0-v3.keras'
$env:AUTHENTISCAN_POLICY_PATH='D:\AuthentiScan - backend\ai-models\curated-v1-candidate-v1-dev\policy.candidate-dev.json'
& '.\.venv\Scripts\python.exe' -m uvicorn service.app:app --host 127.0.0.1 --port 5001
```

Wait for Application startup complete. The model is unchanged; migrating the
database does not improve classification accuracy.

### Terminal 2: Firebase and website

```powershell
cd 'D:\AuthentiScan - backend\firebase-local'
npm.cmd start
```

Wait for the startup message (first launch can take several minutes), then open
**http://127.0.0.1:5174**. Create a **new test account**. Old MySQL accounts do not
exist in this fresh Firebase environment. Do not use real passwords/private images.
The Firebase data viewer is **http://127.0.0.1:4000**, not the cloud Firebase console.

Do not deploy or enable billing for these tests. Emulator mode must not receive
service-account credentials through its environment.
Firebase services use demo-authentiscan-local, not authentiscan-bc704.
Emulator mode refuses cloud configuration; the separate cloud mode requires it.

## What to test

1. Register/sign in; open Dashboard and click **Check system readiness**.
2. Open Scan Image; choose a JPEG, PNG, or WebP (10 MB / 16 million pixels maximum).
3. Start analysis. Verify the saved prediction, confidence, and available heatmap.
4. Open **View full saved result** and **Export PDF**.
5. Open History; test search/status filters and reopen the saved image.
6. Sign out and back in; verify the same records. Another account cannot see them.
7. Check allowance: five scans per Philippine calendar day. Completed scans consume
   one; processing scans reserve one; failed scans release the reservation. Viewing
   history, images, and exporting PDFs do not charge credits or rerun inference.

The inference service returns the existing EfficientNet-B0 prediction and Grad-CAM
overlay. Originals and available heatmaps are copied to private Firebase Storage,
so viewing saved results does not require the AI service to run. Missing heatmaps
do not prevent report export. Scores are estimates, not proof.

## Stop without losing local test records

In Terminal 2, **press Enter**, then wait for export and shutdown to finish. The
next start imports the latest verified .emulator-snapshots snapshot (accounts, profiles, scans,
allowances, images). Abrupt shutdown can lose changes since the last successful
export. These local snapshots are not encrypted production backups. Each clean
stop saves a new snapshot without replacing earlier ones. Review disk usage over
time; no snapshots are automatically deleted. The legacy .emulator-data snapshot
is used only when no verified new snapshot exists. A Windows rename failure falls
back to copying the completed export, then verifying it before marking it usable.

Stop your AI terminal with Ctrl+C when finished. Do not stop someone else's service.
Startup refuses occupied ports instead of terminating another application.

## What migrated

| Existing web function | Firebase version |
|---|---|
| Registration/login/session | Authentication SDK and verified ID tokens |
| Account profile / Free plan | Private Firestore record; client cannot grant Pro |
| Daily allowance and failed refunds | Atomic Firestore transactions; Asia/Manila reset |
| Scan upload and classification | Authenticated API -> existing local AI service |
| History, filters, result details | Owner-scoped Firestore scan records |
| Original images and Grad-CAM | Owner-scoped Storage via authenticated API |
| Dashboard and readiness | Firebase statistics and live AI health check |
| PDF export | Stored result and heatmap; no new inference |

Retries with the same request ID do not charge twice. Interrupted processing
reservations are released on a subsequent history/statistics refresh after a
five-minute lease expires. Failed records remain in history.

The old storage test page is retained at /foundation.html; it is not the main app
and its separate 20-file test allowance is not a scan allowance.

## Verification

Stop the manual Firebase session first, then run:

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd test
```

Tests start empty, temporary emulators without importing/exporting your manual
snapshot. They cover authentication, isolation, denied direct client access,
uploads, invalid files, five-scan concurrency limits, idempotency, midnight reset,
refunds, private heatmaps, reports, and interrupted leases. API tests use explicitly
labeled synthetic AI fixtures; they do not measure model accuracy.

The separate tests/web-browser.mjs checks the running website with the real AI
service and installed Chrome. Run with node tests/web-browser.mjs. It creates a
fictional account and real scan; it is not a production load test.

## Preserved and remaining

- Original MySQL database, backups, and D:\AuthentiScan-Implementation are untouched.
- Mobile still belongs to the original system; it is not connected to this version.
- No existing accounts/scans were imported, as this is a fresh-start migration.
- Pro payments, object detection, password recovery, and profile editing are not
  silently added by migration; their existing unavailable/preview state remains.
- Cloud launch needs separate hosting/API/AI deployment, credentials/IAM,
  production rules tests, abuse limits, monitoring, storage lifecycle, billing
  decisions, and restore procedures before cutover.
- History currently searches owned records in the API for compatibility. Large-scale
  cloud use needs indexed/cursor-based queries and a deliberate search strategy.
- Emulators do not provide production security. Never expose their ports to a LAN.

## Runtime and ports

Web 5174; API **5002**; existing AI **5001**; Auth 9099; Firestore 8085;
Storage 9199; UI 4000; hub 4400; logging 4500; Firestore websocket 9150.
All bind to 127.0.0.1. Original web 5173/backend 5000 remain separate.

Node 24 and portable Java 21 (.runtime) are used; emulator cache is in .cache
on D. System Java is unchanged. On a new computer install Node 24/Java 21+, run
npm.cmd ci, and supply the separately tested AI service/model paths.

Firestore/Storage rules deny browser-direct access. The API verifies ID tokens
and derives ownership from the token UID. No client endpoint can set scan results,
refund credits, or grant Pro. Passwords never enter Firestore profiles.

Sharp was updated to 0.35.4 to resolve its high-severity advisory. The Firebase CLI
dependency tree still has seven moderate audit warnings. Do not force the suggested
breaking CLI downgrade. Review upstream fixes before cloud deployment; this is not
a zero-vulnerability claim.

Firebase emulator reference: https://firebase.google.com/docs/emulator-suite
