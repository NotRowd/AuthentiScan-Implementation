# Separate manipulation localization

10 October update: `npm.cmd run start:cloud:experimental` connects the trained
supervised candidate as an explicit prototype. It has **failed validation**;
the web and PDF preserve that warning and no release approval is implied.
See `../../ai-localization/EXPERIMENTAL-IMPLEMENTATION.md` for startup and tests.
The original normal-mode behavior below remains unchanged.

Experimental implementation verified 10 October 2026: 46 Python tests, 39
backend/emulator tests, browser regressions, and web build passed. Real offline
model-to-HTTP-to-adapter inference was checked on three previously reviewed
images, with no cloud account writes. PDF warnings were rendered and inspected.

The result page now includes a separate localization panel. The optional adapter
is disabled by default. The completed candidate evaluation failed to localize
the held-out edits, so it returns `candidate_not_approved` for new scans.
See `../../ai-localization/TGIF2-REVIEW-2026-10-09.md`. Existing saved scans are not
reanalyzed. This change does not improve or replace the classifier or Grad-CAM.

Implementation and limitations:
`../../ai-localization/INTEGRATION-STATUS-2026-10-09.md`.

Saved metadata lives in the owner's scan document, not in public assets.
`GET /api/v1/scans/:scanId/localization-image` requires the owning account and
returns an upright preview of the protected original. Hard deletion removes the
document (including its localization grid) and the original/Grad-CAM assets.

The optional module cannot turn a failed request into an "authentic" finding.
Available grids are experimental candidate regions, not calibrated probabilities
or exact manipulation boundaries. PDF export includes status and model limits
and a separate candidate-grid page if the protected original passes hash and
upright-geometry checks. A missing preview does not block the rest of the report.

Verified 9 October 2026: 38 backend/emulator tests, browser regression suite
(desktop and 390px viewport), and production build passed. Fixtures are synthetic;
these checks do not establish localization accuracy or cloud deployment parity.
