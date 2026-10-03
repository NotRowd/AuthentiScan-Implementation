# Protected cloud media — Cloudinary Free

Cloud: fyicw41z. Firebase project: authentiscan-bc704. No paid feature, billing
upgrade, payment method, public upload preset or media migration was configured.

## Activate the tested change

1. In the terminal running `npm run start:cloud`, press Enter and wait for shutdown.
2. Start again with `npm.cmd run start:cloud` from this folder. Leave AI running.
3. Open http://127.0.0.1:5174 and reload. The banner should say FIREBASE + CLOUDINARY.
4. Create a new scan. View its original, heatmap and exported PDF in the app.
5. In Cloudinary Assets, inspect the new assets. They use resource type `raw` and
   delivery type `authenticated`, so an image-only filter/unsigned preview may
   not display them. View through the authenticated AuthentiScan result page.

The existing process keeps its original configuration until restarted. Merely
refreshing the browser does not switch a running backend's storage provider.

## Data and privacy

- `media-config.json` selects `cloudinary` for NEW cloud-mode scan media.
- Credentials live only in `.secrets/cloudinary.json`, excluded from Git and Vite.
- Each new scan records `media_provider: cloudinary` in Firestore before upload.
- Older scans without that field still read their original `.local-media` files.
  No existing images were moved or deleted. Do not delete the local media folder.
- Cloudinary assets use `authentiscan-bc704/users/<UID>/scans/<scan-id>/...`.
- Raw storage preserves exact bytes; no automatic resizing, compression, image
  transformation, add-on or Cloudinary AI processing is requested.
- Original and heatmap assets are authenticated, not public. The backend checks
  the Firebase user's ownership, downloads with a short-lived server-side signed
  URL, then returns bytes. Signed provider URLs and API secrets are not sent to
  the browser. No automatic local fallback hides a Cloudinary outage.
- Code does not enable billing or prevent an account from being upgraded manually.
  Keep its Free plan and monitor usage. Quota exhaustion can interrupt service.
- AI still runs locally and may retain generated working heatmaps on disk. The
  web/backend also remain local. This change is NOT full cloud deployment.

## Verification, 2026-09-23

Live synthetic object test passed: credential check, protected upload, exact-byte
download, unsigned URL denial, and no overwrite. Only that random test object
was deleted after verification; it cannot be recovered through this project.

Live app API test on a separate random local port passed: real AI scan with cloud
media metadata, original byte equality, PNG heatmap, no local original copy,
anonymous/other-account access denied for result/image/heatmap/PDF, PDF download,
history, exactly one credit used, and legacy local-file readability.
Two labelled synthetic Firebase accounts and one test scan remain as evidence.
No existing user records were changed. See VERIFICATION.md for overall results.

## Deliberate rollback (new uploads only)

Stop the cloud app and set `provider` to `local-disk` in media-config.json, then
restart. This selects local storage for subsequent uploads only. Existing
Cloudinary scans still use Cloudinary and require its credentials. It does not
copy cloud images back to disk or change existing scan metadata. Emulator mode
always uses its separate Storage emulator, regardless of this setting.

References:
- https://cloudinary.com/documentation/control_access_to_media
- https://cloudinary.com/documentation/image_upload_api_reference
- https://cloudinary.com/documentation/developer_onboarding_faq_free_plan
