# Scan numbers and permanent deletion

The web History page displays a stable, account-specific scan number starting at 1. UUIDs remain the internal API keys; knowing another account's number or UUID grants no access.

Existing scans receive numbers oldest-first when the account's history is first read after the backend restarts. New numbers are reserved transactionally with the daily allowance. Failed scans have numbers too. Numbers are not reused or renumbered after deletion. Search accepts a filename, a number, or #number. Details and PDF reports use the same number.

## Deletion

Only the signed-in owner can delete a completed or failed scan. The confirmation explains that the operation cannot be undone and does not restore used scan credits. Processing scans must finish first.

The server marks cleanup as pending, deletes the original and stored heatmap through the record's media provider (Cloudinary, legacy local storage, or the test emulator), then deletes the Firestore scan document. Cloudinary destruction requests include cache invalidation. Missing files are safe to retry. If storage cleanup fails, the record remains marked as incomplete and the UI offers Retry Delete; it does not report a successful deletion. Details, media, and PDF access are blocked during incomplete cleanup.

The daily aggregate allowance and last-number counter are retained. They contain no image or scan result. Deleting history does not bypass the daily limit.

## Boundaries

This is permanent deletion from the application's active scan database and its managed media storage, not a guarantee of erasure from all historical copies. Previously downloaded/shared images and PDFs, independent backups, provider retention, and requests already in flight are outside this operation. The existing AI service also writes temporary generated heatmaps; older temporary files have no persisted scan-to-file mapping and are not removed by this endpoint. Do not clear that shared directory blindly.

## Verification and activation

Run `npm test`, `npm run test:ui`, `npm run build`, and `npm run check` from this folder. Tests use disposable demo Firebase emulators or mocked browser data, never production scan deletion.

Restart the existing cloud-mode web/backend launcher after updating server files: press Enter in its terminal to stop, then run `npm.cmd run start:cloud` from the project folder. Refresh History. The AI service does not need restarting for this change. No billing or mobile configuration changes are needed.
