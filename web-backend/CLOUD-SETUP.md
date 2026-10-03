# Cloud accounts and records without enabling billing

## Deployment constraint: strict no billing

The user confirmed that deployment must not require a payment method, paid plan,
Blaze upgrade, or chargeable trial. Do not enable billing to complete deployment.
Use fresh Firebase accounts; do not import MySQL accounts. Preserve MySQL and
emulator data as separate fallbacks, never automatic alternatives for failed
cloud requests.

The current implementation remains hybrid, not fully hosted. Firebase Spark
Authentication, Firestore and static Firebase Hosting are the intended foundation.
Backend/AI compute hosting is still unselected. New private scan media now uses
Cloudinary Free; see CLOUDINARY-SETUP.md for activation and legacy-file handling.
Before selecting providers, verify no-payment eligibility, private access,
TensorFlow/Grad-CAM memory requirements, model licensing, sleep/cold-start
behavior, storage persistence, and quota exhaustion behavior. Do not upload
private user images or publish model files merely to test a hosting candidate.

Release gate: the public HTTPS website must complete login, scan, heatmap,
history, credit/refund and PDF workflows with this PC switched off. Also verify
cross-account isolation and persistence across host restarts. Until then, do not
label the system fully cloud-hosted or deployment-ready.

Provider references checked for planning (recheck before provisioning):
- https://firebase.google.com/pricing
- https://cloudinary.com/documentation/billing_and_plans
- https://huggingface.co/docs/hub/spaces-overview
- https://render.com/docs/free

Status: the supplied Admin credential, live read-only preflight and live web
signup/scan/heatmap/PDF/history workflow were verified on 2026-09-22. The test's
completed scan and single credit use were independently read back from Firestore.
Full public hosting is still pending. No billing upgrade,
Cloud Storage provisioning, historical account import, or mobile migration occurs.

## Where data goes

| Data | Location in cloud mode |
|---|---|
| Email/password accounts | Firebase Authentication, authentiscan-bc704 |
| Profiles, scans, AI scores, daily allowances | Cloud Firestore, same project |
| New original images and Grad-CAM files | Protected Cloudinary storage, fyicw41z |
| Older images without media_provider metadata | This PC: .local-media/authentiscan-bc704 |
| AI inference | Existing service on this PC, port 5001 |
| PDF | Generated from saved records and the scan's selected media store |

No Firebase Cloud Storage SDK requests are made in cloud mode. Spark quotas still
apply to Authentication/Firestore. Internet is required for cloud login and data.
Keeping the website on localhost does not prevent using cloud Firebase services.
Existing local image files are NOT uploaded/synchronized. Back up .local-media separately;
moving to another PC without those files makes images unavailable. PDFs still
export saved scores when their heatmap is missing. This is not full cloud hosting.

## 1. Private backend credential

In Firebase Console select AuthentiScan, then:

1. Gear beside Project Overview -> Project settings -> Service accounts.
2. Under Firebase Admin SDK choose Generate new private key and confirm.
3. Rename the downloaded file to firebase-admin.json.
4. Create the folder D:\AuthentiScan - backend\firebase-local\.secrets.
5. Move the file to D:\AuthentiScan - backend\firebase-local\.secrets\firebase-admin.json.

Do not paste, screenshot, upload, email, or commit the key. It can authorize
administrative access. The .secrets folder is git-ignored and denied by Vite.
Never place the key in src, public, or frontend environment variables. If exposed,
revoke it in Google Cloud IAM -> Service accounts -> Keys and generate a replacement.
The public Firebase web config alone cannot authorize the trusted backend.

## 2. Authentication

Firebase Authentication -> Sign-in method -> enable Email/Password. This does not
enable phone authentication. Do not enable billing or upgrade to Blaze for this setup.
Create a new account through the website after cloud startup succeeds. Emulator
and MySQL accounts are not copied automatically.

## 3. Firestore rules

In Firestore -> Rules, publish the contents of firestore.rules from this folder:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

This intentionally denies browser-direct access. The backend Admin SDK uses IAM;
its API verifies the user's ID token and scopes records to that UID. Do NOT switch
to test-mode/public rules to resolve a permissions error. Backend access does not
depend on allowing browser writes.

Startup reads the deployed rules and refuses to open the app if they do not match
the deny-direct-access policy. The service account needs Firestore data access,
Firebase Authentication administration access, and Firebase Rules Viewer access
for this read-only verification. If an IAM error appears, ask for help reviewing
the exact missing role; do not grant broad Owner access as a workaround.

## 4. Start the app

First stop emulator mode with Enter. Leave the original MySQL app unchanged.
Start the existing AI service using README.md, then in a separate PowerShell:

```powershell
cd 'D:\AuthentiScan - backend\firebase-local'
npm.cmd run start:cloud
```

Wait for the live Firebase startup message, then open http://127.0.0.1:5174.
With the current Cloudinary configuration, the banner must say FIREBASE + CLOUDINARY.
Registration should appear in the cloud
Authentication Users tab. Profiles appear under Firestore users; scans are under
users -> user UID -> scans, and daily allowance records under allowances.

The local emulator viewer at port 4000 is not used in this mode. Cloud records
save immediately; press Enter to stop the website/backend. New images persist
in protected Cloudinary storage. Older images remain on disk and do not depend
on emulator exports. Neither kind has been automatically migrated to the other.

## Return to emulator mode

Stop cloud mode with Enter and use a fresh PowerShell terminal:

```powershell
cd 'D:\AuthentiScan - backend\firebase-local'
npm.cmd start
```

It uses the separate demo project and saved emulator snapshots. Modes cannot run
simultaneously on the same web/API ports. Browser sessions are isolated by mode.

## Verification boundary

Local tests cover mode guards and the private disk media adapter. The existing
emulator regression suite covers auth, ownership, daily credits, refunds, results
and PDFs. These do not substitute for a real cloud signup/scan test after the
credential and rules are configured. Never report cloud migration as connected
until that live test has passed.

References:
- https://firebase.google.com/pricing
- https://firebase.google.com/docs/admin/setup
- https://firebase.google.com/docs/firestore/security/rules-conditions
