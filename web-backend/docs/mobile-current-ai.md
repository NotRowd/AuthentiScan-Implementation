# Shared web/mobile AI baseline — 10 October 2026

The active native app is `D:\AuthentiScan-Mobile`, not the archived GitHub handoff copies.
Both clients now use the Firebase web backend on port **5002**. Models remain on the PC:
classifier/Grad-CAM 5001, object detector 5003, localizer 5004, scene description 5005.
No model runs inside the phone and no uploaded images are sent to an external vision API.
Existing Firebase account/record storage and Cloudinary media storage are unchanged.

## Start the system

Stop the old web/backend launcher normally with Enter first; do not run two backends on port 5002.
Keep these three terminals open:

1. Classifier (if already running the current manuscript policy, keep it running):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\AuthentiScan - backend\ai-runtime\start-loyd-ai.ps1"
```

2. Shared web/mobile backend and optional local AI modules:

```powershell
cd "D:\AuthentiScan - backend\firebase-local"
npm.cmd run start:cloud:mobile
```

This is an explicit **development LAN** mode. Only the authenticated API port 5002
is bound to the network; the AI services and web dev server remain loopback-only.
Use a trusted private Wi-Fi network. Do not forward router ports. HTTP development
traffic is not encrypted; production must use HTTPS. If Windows asks, allow Node
only on the private network, not public networks. No firewall rule is changed by this setup.
The ordinary `start:cloud` and `start:cloud:experimental` remain loopback-only.

3. Mobile:

```powershell
cd "D:\AuthentiScan-Mobile"
npx.cmd expo start --clear
```

Open the Expo QR code in Expo Go. Phone and PC must be on the same Wi-Fi.
`.env.local` is set to `EXPO_PUBLIC_API_MODE=firebase` and
`EXPO_PUBLIC_API_BASE_URL=http://192.168.1.5:5002` (this PC's Wi-Fi address at implementation time).
If `ipconfig` shows another IPv4 address, update that public URL and restart Expo.
Android emulator uses `http://10.0.2.2:5002`. No direct AI-media URL is needed in Firebase mode.

Web: `http://127.0.0.1:5174`. **Sign into mobile using your web Firebase account.**
Old port-5000 mobile accounts/history are not automatically migrated. Their data and
credentials were not deleted. The Firebase token uses a separate secure-storage key.

## What is locked

`ai-runtime/current-ai.lock.json` records SHA-256 hashes of the current inference
sources, classifier weights/policy, object weights, localizer head/backbone/validation
report, and scene model manifest. Startup verifies those plus every scene model file.
`npm.cmd run verify:ai-lock` checks the baseline without starting services.

Release: `authentiscan-2026-10-10-manuscript60`.
Classifier: `loyd-classifier-v1-research`; policy: `sha256:f56f876dbf8234b6`.
At least 60% selects Authentic or AI-generated; both below 60% yields Uncertain.
The backend refuses new inference from a mismatched classifier/policy; saved older
results remain readable under their recorded rule. This is a source/weight identity
lock, not an immutable operating-system lock or an accuracy certification.

Models, thresholds, Grad-CAM algorithm, scene prompts, and old scan results are unchanged.
**Localization still failed validation**; the lock does not make it reliable.

## Mobile parity

- Firebase sign-in/registration and secure token renewal; shared owner-protected history.
- UUID scan IDs, server readiness check, and idempotency IDs retained across retries.
- Saved verdict/scores/policy displayed unchanged; no phone-side reclassification.
- Grad-CAM comes from the protected backend, with its saved target or uncertainty reason.
- Object labels and boxes use the detector's unrotated preview, not an EXIF-rotated image.
- Localization uses the upright protected preview and saved 32x32 scores. Pink opacity
  is 0–65% on a fixed scale, not a probability. Region uncertain shows the original by
  default, with the unverified preview inside Technical details. Failed-validation
  disclosure remains visible when a preview is shown.
- Image description runs automatically for missing/outdated descriptions. A failure
  leaves the classification intact and offers a manual retry. Captions are not claimed
  to be the classifier's reasons. No external vision provider is added.
- PDF export downloads the same saved report as web, using UUIDs and owner authentication.

Use the **same saved scan** to compare clients. Uploading separate copies may change
bytes through device conversion/recompression and need not produce identical scores.

## Verification commands

```powershell
cd "D:\AuthentiScan-Mobile"
npm.cmd run typecheck
npm.cmd run test:current-ai
node tests/backend-contracts.cjs
node tests/offline-contracts.cjs
node tests/report-export.cjs
node tests/report-feedback.cjs
node tests/navigation-session.cjs
```

Contract/UI tests mock network and native APIs. Native bundle export is not an installed
app/device test. On your phone, sign in with the web account, open an existing scan,
compare scores and overlays, export its PDF, then upload one image. Confirm logout
removes protected content. No live user scans/accounts were created for automated tests.
