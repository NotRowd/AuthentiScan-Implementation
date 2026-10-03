# Mobile backend integration

## Modes and account safety

The app defaults to offline unless EXPO_PUBLIC_API_MODE=backend is explicitly set.
This PC has a git-ignored .env.local configured for backend mode. Restart Expo after
changing it. Real requests never fall back to simulated predictions.
Offline accounts/history stay in their separate local storage and are NOT uploaded.
Use an existing web account's email/password or register a new real account in backend mode.

Only the backend token is persisted with Expo SecureStore, scoped to the configured
backend origin. Passwords are not saved. Restoring a session validates /auth/me;
401 clears the session and current report. Backend scans are not cached in the
offline history. Payments, profile editing, deletion, feedback, and object detection
remain unavailable because the current backend does not implement them.

## Local Android emulator settings

.env.local:

    EXPO_PUBLIC_API_MODE=backend
    EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:5000
    EXPO_PUBLIC_AI_MEDIA_BASE_URL=http://10.0.2.2:5001

10.0.2.2 addresses this PC from the Android Studio emulator; it is not for physical
phones. The backend's existing AI_SERVICE_URL is http://127.0.0.1:5001.
Do not change it to 10.0.2.2: the backend itself runs on the PC.
Historical loopback heatmap links on ports 5001/5002 are resolved to the configured
AI media origin. Other unconfigured media hosts are rejected; the backend JWT is
never sent to the AI media server. Protected original images use backend auth.

These HTTP addresses are for local development. Release builds require HTTPS.
This is not cloud deployment; teammates in other locations cannot reach this PC
using these addresses. No firewall ports or public services were opened.

## Start after a PC restart

Ensure your local MySQL service is running.

Terminal 1 (AI, candidate model used by the existing web tests):

    cd "D:\AuthentiScan-AI-Foundation\ai-service"
    $env:AUTHENTISCAN_MODEL_PATH = "D:\AuthentiScan - backend\ai-models\curated-v1-candidate-v1-dev\authentiscan-efficientnet-b0-v3.keras"
    $env:AUTHENTISCAN_POLICY_PATH = "D:\AuthentiScan - backend\ai-models\curated-v1-candidate-v1-dev\policy.candidate-dev.json"
    .\.venv\Scripts\python.exe -m uvicorn service.app:app --host 127.0.0.1 --port 5001

Terminal 2 (backend):

    cd "D:\AuthentiScan-Implementation\backend"
    npm.cmd run dev

Health checks:

    Invoke-RestMethod "http://127.0.0.1:5000/api/v1/database/health"
    Invoke-RestMethod "http://127.0.0.1:5001/health"

Terminal 3 (mobile):

    cd "D:\AuthentiScan-Mobile"
    npx.cmd expo start --clear

Start Pixel 5 from Android Studio Device Manager and press A in the Expo terminal.
Dependencies have been installed on this PC. Other checkouts should run npm.cmd ci.
If a port is already occupied, use the existing service or stop its own terminal;
do not start duplicate instances or kill unrelated processes.

## Manual Android acceptance checklist

1. Confirm BACKEND MODE banner and no mock-response selector.
2. Sign in with a web account; wrong passwords must fail.
3. Upload a supported test image (<10 MB) and confirm the saved scan ID appears
   through the same account on the web.
4. Open History, refresh, open a saved result, and check original image + heatmap.
5. Check server totals/quota, including saved failed/pending scans.
6. Restart the app; verify session restoration. Log out and use a second account:
   the first account's scans must not be visible.
7. Stop AI and test failure handling. A 201 upload does not guarantee completed AI.
   Queued/failed scans are not automatically retried by the existing backend.
8. Cancel/timeout: refresh History before uploading again. Cancellation only stops
   the client waiting; the server may already have saved the upload.

History loads pages rather than treating the first page as all scans. Dashboard
totals come from /users/stats. Results provide a manual refresh; no fictitious
background worker or progress stage is presented.

## Automated checks

    node tests/offline-contracts.cjs
    node tests/backend-contracts.cjs
    npx.cmd tsc --noEmit

Optional real local smoke test (CREATES two test accounts and one synthetic scan):

    $env:AUTHENTISCAN_LIVE_TEST = "1"
    node tests/live-local-smoke.cjs

The live smoke test uses the actual backend/database/AI. Its Native FormData and
SecureStore are bridged in Node, so it does not replace Android UI testing.
It retains its clearly named local test records; there is no delete-scan API.
No credentials or tokens are printed.

## Initial verification on this PC (before native Android follow-up)

- 14 offline contract tests passed; no network calls.
- 15 backend contract tests passed with mocked native storage/transport.
- TypeScript and git diff whitespace checks passed.
- Android production-format bundle exported successfully (local HTTP settings are
  intentionally refused at runtime in a release; use Expo Go for local testing).
- Real local API + MySQL + candidate AI smoke test passed: completed scan #17,
  model curated-v1-candidate-v1-dev, history/stats, original image, heatmap,
  login/invalid password, logout, and cross-account isolation.
- Across the initial port-mismatch test and successful rerun, three named test
  accounts and two synthetic scans were created and retained. The initial scan
  failed before AI because of the port mismatch; scan #17 completed.
- Updated Android UI/native SecureStore still needs the manual checklist above.
- npm reported 13 moderate dependency vulnerabilities during installation.
  No automatic potentially-breaking audit upgrades were applied.

No Git commit, push, merge, or backend source changes are part of this integration.

## Native Android follow-up — September 13–14, 2026

Scope: mobile upload, image rendering, history layout, and authentication error
handling. No object-detection model, database migration, or deployment was added.

Changes:

- Uploads use a Blob-compatible native file reader instead of the unsupported
  legacy `{ uri, name, type }` FormData value. Fetch sets the multipart boundary.
- The multipart part explicitly preserves the image picker's original filename.
  Expo's FormData patch ignores the third filename argument for filesystem Files.
  The regression fixture now uses different cache and original filenames.
- Protected images are fetched with backend authentication, checked for image
  type/size, and rendered from an in-memory data URI. Tokens are not placed in
  image URLs or sent to the AI heatmap server.
- ScanImage has an explicit full-size Image inside its fixed-size frame. History
  thumbnails display, and verdict text no longer wraps into a narrow column.
- The splash animation uses a supported transform instead of native-driven width.
- Connection-reset errors give recovery guidance without automatically repeating
  registration or uploads. The original intermittent reset was not reproduced
  during the successful native registration; its root cause is not established.

Verified in Expo Go on Pixel 5 API 30:

- Logout from the existing account and registration of a separate Native QA
  account succeeded. Registration returned HTTP 201.
- Restart restored that test account through SecureStore and `/auth/me`.
- The Android system image picker selected `authentiscan-native-qa.png`.
- Native upload created scan #19: completed AI analysis, original image displayed,
  and Grad-CAM heatmap displayed. The test icon received 70.2% authentic and
  29.8% AI-generated scores. This verifies integration, not model accuracy.
- A separate headless Chrome session logged into the same account and displayed
  scan #19 with the matching scores in the web History page. No page errors.
- The existing account's history thumbnail and single-line verdict were visually
  verified before switching to the test account. Recent ReactNativeJS error logs
  showed no native-width or FormData errors in the successful workflow.

Test records and environment:

- One Native QA account and one completed native scan (#19) were retained by this
  follow-up. Existing users and scans were not changed or deleted.
- An initial upload attempt failed because the agent-launched backend lacked
  write access to its upload folder. History confirmed zero test scans before
  retrying with the required local folder access. That attempt saved no scan.
- Scan #19 predates the filename fix and retains its picker-generated UUID name.
  No historical records were renamed.

Final check status:

- 20 backend contract tests pass, including the installed Expo multipart converter
  and preservation of the original filename; native storage/transport are mocked.
- 14 offline contract tests pass with no backend calls.
- TypeScript and whitespace checks pass.
- **Remaining native check:** upload one image after the filename fix; confirm its
  original name appears in both mobile and web History, and reopen the saved
  result. The emulator stopped during the usage-limit interruption before this
  final check. Do not mark this particular check as passed based on unit tests.
- The broader manual checklist above (all formats, limits, failure scenarios,
  cross-account isolation on-device) is not claimed complete by this smoke test.

No GitHub publish or progress-percentage change was performed in this follow-up.

## History filtering milestone — September 14, 2026

Web, backend, and mobile now support filename/scan-ID search and status filters.
Search text and the selected status are applied together using **Apply filters**;
**Clear filters** returns to all scans. Changing filters resets pagination.
Backend filtering runs before pagination across the signed-in account's saved
scans, and Load more preserves the applied filters. Offline mode applies the same
basic filters to account-local samples without contacting the backend.

The shared endpoint is `GET /api/v1/scans?limit=20&offset=0&q=example&status=failed`.
Search text is URL-encoded and limited to 120 characters. Supported status values:
`all`, `queued`, `processing`, `failed`, `completed`, `authentic`, `ai_generated`,
`uncertain`. Failed and processing entries are no longer grouped with queued.
The response envelope is unchanged. See the integration repository's
`API_CONTRACT.md` for the full parameter contract.

Verification:

- Backend: 9 passing tests, including HTTP authentication/validation and matching
  owner-scoped list/count SQL. Database access is mocked in that suite.
- Mobile: 21 passing backend contract tests and 16 passing offline tests;
  TypeScript passes. Native transport/storage are mocked in these suites.
- Read-only real MySQL/API checks passed for existing scan #19: search, verdict,
  filtered total, pagination and a different owner's exclusion. No records added.
- Web production build passed. Headless Chrome with a 45-record fixture checked
  pagination, older-scan search, combined filters, empty results, reset, server
  error recovery and stale-response protection. Desktop/narrow layouts reviewed.

Remaining on-device checks: restart Expo, open History, search a known filename
and scan ID, Apply a status, Clear, and refresh. Verify a saved result still opens.
The emulator was off during this milestone, so these new controls have not yet
been verified on Android. The native filename retest above also remains pending.
Deletion, export, date-range filters and object detection were not added. No
database migration, GitHub push, or progress-percentage change was performed.

## iPhone back-swipe/session navigation fix (14 September 2026)

The root navigator previously kept the guest/auth screens in its back history
after sign-in. Returning to the guest Home could therefore look like logout,
even though back navigation itself does not clear the secure token.

- Session restoration now completes before the navigation stack is built.
- Splash/login/register routes are guest-only and removed from the allowed
  history when signed in, using Expo Router's protected-route mechanism.
- The root tab shell disables the iOS back gesture. Result and profile screens
  keep their normal back behavior; gestures were not disabled app-wide.
- A signed-in visit to guest Home redirects to Dashboard. Shared pricing/info
  pages remain available from Settings.
- Explicit Log Out and genuine backend 401 session expiration remain unchanged.
- No credential, token, API address, dependency, backend or database changes.

Verification: `node tests/navigation-session.cjs` checks the real layout JSX
with UI stubs and Expo's stack-state reducer. The 21 backend contract and 16
offline contract tests pass, as does `npx.cmd tsc --noEmit`.
These checks do not simulate a real native iPhone gesture.

On-device acceptance (pending): reload Expo, sign in, and swipe from the left
edge toward the right on Dashboard, Scan, History and Settings. The app should
remain signed in. Open a saved result or Edit Profile and swipe back: it should
return to the signed-in app. Confirm Settings > Subscription Plan still opens,
and explicitly Log Out: private pages must no longer be accessible with Back.

Reference: https://docs.expo.dev/router/advanced/protected/ (protected routes
remove their history entries when their guard becomes false).

## Mobile PDF export (14 September 2026)

Implemented **Export PDF** on the saved result screen, including results opened
from History. Uses `GET /api/v1/scans/:id/report` with the current Bearer token;
the backend must include the web PDF-export endpoint. No uploads, new inference,
database changes, or scan credits are involved. Offline samples cannot export.

The downloaded PDF opens the native iOS/Android share sheet using the
SDK-compatible `expo-sharing` package. On iPhone select **Save to Files** or an
appropriate sharing app. Android destinations depend on installed apps. Reports
include the same saved fields, disclaimer and optional heatmap as web exports.
The app does not claim that dismissing the sheet means a save succeeded.

Safety/error handling: validates ID, HTTP status, PDF content type/signature and
16 MB size limit; 20-second download timeout; no automatic retry; duplicate-tap
lock; no late share after leaving the result or changing sessions; normal 401
session expiry. Tokens never appear in share URLs. Files are created in the
app's private cache. Previously handed-off files older than 24 hours are pruned
on the next export (or reclaimed by the OS), not immediately after the chooser
closes, so Android receiving apps can finish reading. Saved/shared copies remain
under the user's control. No shared gallery or device-wide storage permission.

Verification: 10 PDF export contract tests, 21 backend contract tests, 16 offline
contract tests, navigation regression checks and TypeScript pass. Network,
storage and native share-sheet behavior are mocked in the contract tests.
Both iOS and Android production-format bundles exported successfully to a local
QA directory. This confirms bundling, not native runtime behavior or release
deployment; release configuration still requires HTTPS.
The user confirmed iPhone PDF export works and supplied screenshots showing
the native share sheet and the exported two-page report open in the iPhone PDF
viewer. Android on-device export remains pending. Per-action save completion is
not reported by Expo's share API, so the app cannot automatically certify that
the user saved or sent the file rather than dismissed the sheet.
The user separately confirmed the iPhone navigation swipe fix works.

Run: restart Metro in `D:\AuthentiScan-Mobile` with
`npx.cmd expo start --clear`, then reopen the project in Expo Go. Keep the backend
running. Open **History > a saved scan > Export PDF**. Save the PDF to Files and
open it to check scores, disclaimer and heatmap. Recheck the remaining allowance.
Also cancel the share sheet and export again; neither action should create a
scan. Test a record with no heatmap: its report should still export with a note.

Repeat tests: `node tests/report-export.cjs` (plus the existing test scripts).
No mobile GitHub push or whole-system percentage change was made.
Reference: https://docs.expo.dev/versions/v57.0.0/sdk/sharing/

### Export feedback follow-up

After the native share sheet closes, a **PDF prepared successfully** popup and
visible green-bordered status card confirm that the report was prepared. The
message explicitly distinguishes preparation from saving: check the selected
folder if Save to Files was chosen; cancellation does not save a file by that
action. Export failures show a **PDF export failed** popup and error card.
Popups are delayed briefly for sheet dismissal and cancelled if the user leaves
the screen. No download, PDF generation, database or credit logic changed.

Checks passed: `node tests/report-feedback.cjs`, the 10 existing PDF export
tests, and TypeScript. Feedback tests mock native alerts and still require an
iPhone reload/retest for visual confirmation of the new popup.
