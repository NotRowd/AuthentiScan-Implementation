# Android APK

The Android build connects to the existing AuthentiScan AWS HTTPS backend. It uses
the same accounts, plan allowances, scans, PDFs and feedback as the website. It
does not need Expo Go or a Metro development server. Internet access is required.

## Build on this Windows PC

From this folder, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1
```

Requirements: installed Node dependencies, Java 17, and Android SDK (the current
SDK 58 / React Native 0.88 toolchain requests SDK 37, build tools 37 and NDK
27.1.12297006). Set `JAVA_HOME` and `ANDROID_HOME` to their installed locations.
The build uses a Gradle initialization script that asks CMake to hash long source
paths into shorter object paths. Native libraries build under `output/android-cxx`;
the app's generated C++ builds under the shorter workspace `.c` directory to fit
Windows path limits.

Windows must have `LongPathsEnabled=1` and Ninja 1.12 or later. This PC already
had long paths enabled; the SDK CMake 3.22.1 package bundled Ninja 1.10.2. It was
updated to official Ninja 1.13.2 after verifying the release asset's SHA-256 digest
against GitHub's release metadata. The original executable and release provenance
are retained under `../../output/mobile-apk-20261118/build-tools/`.
See https://docs.expo.dev/troubleshooting/windows-long-paths/ for Expo's preferred
fresh-machine setup using CMake 3.31.6 and its newer Ninja.
The first build downloads missing build dependencies. Android source is generated
by Expo prebuild when absent; generated native folders are git-ignored.

The script builds a release bundle, then signs the APK with a persistent private
key in `.android-signing/`. This directory is git-ignored. Back it up securely;
the same key is required to update an existing installation. Do not distribute
the key or its credentials with the APK. The output is
`../../output/mobile-apk-20261118/AuthentiScan-1.0.0.apk`.

## Install on an Android phone

1. Transfer only the APK to your phone.
2. Open it in Files. If requested, allow that app to install unknown apps.
3. Install AuthentiScan, then turn the installation permission off again.
4. Sign in with your existing AuthentiScan account, or verify a new email inbox.

An APK is for Android; it cannot be installed on an iPhone. If Android reports a
signature conflict with an older development app, export/check any needed local
offline samples before removing that older installation. Server account data is
separate from app-local data.

## Device acceptance

- Launch without Expo Go or Metro, then sign in and restore the session after restart.
- Check registration code delivery, resend cooldown and password recovery with an inbox you control.
- Verify dashboard totals, plan allowance and existing history against the website.
- Upload one supported image; switch apps during processing, return, and check for the same saved scan rather than a duplicate upload.
- Confirm Authentic and Digitally Edited results show the original only; AI results can show a supplied heatmap when available.
- Check actual confidence, all result explanation cases, protected images and PDF sharing.
- Submit one feedback response on a designated test report, check the saved response, and verify the one-response rule.
- Update profile details and password, then confirm the changed account information on the website.
- Check simulated checkout acknowledgement, cancellation, return and server-confirmed allowance.
- Log out and verify that private screens, protected images and previous reports are unavailable.

Payments remain simulated. Automated source tests do not replace inbox, picker,
PDF chooser, app-switching and checkout checks on a physical phone. Mobile avatar
editing is not yet equivalent to the website's crop/rotate/flip editor.


## Original mobile UI restored — 2026-11-20

The compact Option B redesign was reverted at the user's request. All 80
pre-redesign source/test/package files match the saved baseline exactly. App
configuration differs only in release version 1.0.2 and Android version code 3
so the restored UI can install over 1.0.1. The original welcome page ("A clearer
look at what's in an image"), main screens, forms and controls are restored.
The earlier Light/Dark/System theme remains. No API or account data changed.

Signed replacement APK: https://authentiscan.52-65-43-68.sslip.io/downloads/AuthentiScan-1.0.2.apk
SHA-256: `c3d220d1ec18c9ca8194b2d9344004ee287a28f9b3ccd1ca2672d60e326e95bf`.

Verified TypeScript, existing theme/contrast, navigation/session and scan resume
checks, source backup hashes, release signing, and original welcome screen on
the Android emulator. Expo Go uses the restored source on full reload.
Rollback and validation records: `output/mobile-ui-restore-20261120/`.


## Android 1.0.3 — 2026-11-20

Published the tested targeted mobile refinements as version 1.0.3 (Android code 4),
using the same package and signing certificate as 1.0.2. Install over the existing
app. The original UI is retained. Includes consistent top Back/fallbacks, History
filter/scroll retention, native More/delete confirmation, safe-area/tab label
fixes, small wrapping/target improvements and one profile-edit entry. Expo control
clearance is development-only. History removes the Queued/Processing/Completed
filter choices; the dashboard shows the exact saved Authentic count.

Download: https://authentiscan.52-65-43-68.sslip.io/downloads/AuthentiScan-1.0.3.apk
SHA-256: `d2ced1dbfda3783082a5f5b2a7f1f1947c3b01c6ec20027e883dc058f3ec9b2d`.

The web image was extended only to host this APK; live website HTML and the API
container are unchanged. No GitHub push. Rollback image: `authentiscan-web:before-mobile-download-20261120T115301Z`.
Build, signing, APK version/source/hash checks and publication records:
`output/mobile-apk-1.0.3-20261120/`. Targeted Back/History/delete, native tab label
fit, exact count/filter, TypeScript and existing theme/service checks pass.
The user accepted the targeted UI and tab labels in iPhone Expo Go; physical
Android acceptance should be repeated on the installed APK.
