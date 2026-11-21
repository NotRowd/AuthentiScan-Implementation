# Current AWS deployment — 2026-11-07

## TruthScan analysis integration — 2026-11-12

The active provider for new scans is now TruthScan. New scans bypass the local
classifier, localizer, object detector, and visual-review workers. The old model
containers are stopped; their images and weights are retained for rollback.
They use the optional `local-models` Compose profile, so normal startup selects
only api and web and does not reload the memory-heavy worker models.
API and web containers are online, public HTTPS returns 200, and provider
readiness passes. Existing scans retain their original saved analysis.

Real and AI Generated labels require unrounded provider-label confidence of at
least 60% for Authentic or AI-Generated. Lower confidence, editing categories
and unsupported labels map to Uncertain. The original label is preserved in the
technical record. Separate binary scores remain null rather than being invented.
Saved heatmaps are delivered through owner-protected endpoints, with no fabricated
binary mask/pixel count. Provider IDs and the API key stay backend-only.

The authenticated public-endpoint test passed: upload, completed result, saved
written analysis, original image, PNG heatmap (183,385 bytes), PDF (315,814 bytes),
history, quota, duplicate request ID reuse, 401 for unauthenticated image access,
and 409 for attempts to start local scene/object inference on a provider scan.
Only one app credit was charged. Provider balance was 17,000 before this test and
16,000 afterward. The temporary test account and its stored media were removed.
These credit units should not be assumed to equal image counts.

The initial concurrent dependency build exhausted RAM while old models occupied
most of the 8 GB instance. Public requests/SSH stalled. The user rebooted EC2;
the local workers were stopped, and deployment reused the preserved dependency
images plus the locally verified web build. No dependency update was needed.
After recovery the server had about 6.9 GB available memory.

Rollback images:
`authentiscan-api:before-truthscan-20261112T142755Z` and
`authentiscan-web:before-truthscan-20261112T142755Z`.
Private source/runtime backup:
`/home/ubuntu/authentiscan-backups/truthscan-20261112T142755Z`.
Runtime secrets were preserved. See `firebase-local/TRUTHSCAN-INTEGRATION.md`
for operation and rollback notes. Mobile source is updated and typechecked;
an installed APK needs rebuilding, and native-device acceptance remains pending.

The website is deployed on AWS EC2, superseding older local readiness notes
that say hosting has not occurred or refer to Hostinger as the current target.

Public website: https://authentiscan.52-65-43-68.sslip.io
Remote project: /home/ubuntu/authentiscan

All-user PayMongo test checkout is deployed. The running API uses
`AUTHENTISCAN_BILLING_MODE=test` and `AUTHENTISCAN_BILLING_TEST_USERS=*`.
Every active signed-in account can access simulated checkout without adding its
Firebase UID. Pro still requires verified test payment and expires as before.
Live payments are not enabled.

Validation: all 7 local billing tests passed. In the running API, a read-only
fixture verified unlisted-account eligibility, Free before payment, recognition
and expiry of paid test Pro, and rejection of disabled accounts. The public
HTTPS page returned 200. All five containers were up; classifier, localizer,
and visual service health checks passed.

Pending user acceptance: sign in with an account never individually enabled,
refresh Subscription, acknowledge the test purchase, complete simulated
checkout, return to merchant, and verify Pro activates automatically without
pressing Check payment. Actual browser checkout was not completed by the agent.

Rollback image: authentiscan-api:before-all-user-checkout-20261107
Private pre-update files and runtime.env:
/home/ubuntu/authentiscan-backups/checkout-20261107T154348944171Z
Runtime secrets were preserved and not printed.

The user authorized applying requested website changes to AWS going forward.

## Capstone subscription presentation — 2026-11-08

PayMongo test keys are the final payment setup for the capstone. Live merchant
activation and live keys are not completion requirements for this project.
Deployed frontend wording now uses Pro, Payment history, Payment confirmed,
and Continue to checkout. A small capstone notice and checkout acknowledgement
explain that payment is simulated and no real money is charged. The sidebar
also displays Pro for the verified unlimited plan, including legacy API names.
Provider checkout remains managed by PayMongo and may show its own test labels.

Only the web container was rebuilt/restarted. Local and AWS frontend builds
passed. Focused payment-confirmation checks passed for verified activation,
unpaid orders, and return URLs alone. Public HTTPS checks confirmed the updated
bundle labels and all five containers remained up. Test billing and all-user
eligibility were verified in the running API; payment logic was unchanged.

Rollback web image: authentiscan-web:before-subscription-copy-20261108
Source backup: /home/ubuntu/authentiscan-backups/subscription-copy-20261108

## Signed-in password change — 2026-11-08

Profile now contains Current password, New password, and Confirm new password
fields instead of a link to Forgot password. Firebase reauthentication verifies
the current password before updatePassword; a forced ID-token refresh preserves
the current session after the update. Password fields clear after submission.
The profile's active paid plan displays Pro, including legacy Pro (Test) data.

Desktop/mobile browser checks exercised the actual adapter with a mocked Firebase
SDK: mismatch, wrong current password, network error, visibility, duplicate-submit
protection, success and token refresh. No real account password was changed.
Existing password-recovery browser checks also passed. Local/AWS builds passed;
only the web container was rebuilt/restarted. User acceptance with a real account
is pending: update in Profile, log out, verify new password signs in and old one
does not. Never send passwords in chat.

Rollback image: authentiscan-web:before-profile-password-20261108
Source backup: /home/ubuntu/authentiscan-backups/profile-password-20261108

## Focused anomaly review — 2026-11-08

What looks unusual now presents specific observations with Where and Why it
stands out, instead of a general image caption. Authentic results show a normal
image message. Current reviews distinguish no clear concern from unassessable
details and failed inference. Older saved reviews offer Run updated visual check
without charging a scan credit. New findings retain location/reason end to end
and carry anomaly_review_version=visual-anomalies-v2. Historical data is still
readable; old findings are not presented as updated anomaly evidence.

35 focused Node/Python tests passed, plus desktop/mobile browser checks and
local/AWS builds. Public HTTPS checks confirmed the new bundle; all five
containers and three private model services passed readiness checks after
restart. Classifier, Grad-CAM and localizer weights/policy were unchanged.
The live visual endpoint also returned the updated location/reason fields and
version marker for a blank image generated inside AWS. All five features were
unassessable; no suspicious finding was invented and no user scan was created.

Model-quality limitation: local development screening found unsupported normal
and sign-direction claims. Updated safeguards withhold these claims, but the
edited-sign case still was not reliably explained. Do not describe this as a
validated or comprehensive anomaly detector. Full observations and limitations
are in ai-scene/ANOMALY-REVIEW-2026-11-08.md. No development images were exported;
only reviewed application source was transferred to AWS.

Rollback images use the before-anomaly-review-20261108 tag for authentiscan-api,
authentiscan-web and authentiscan-visual. Backed-up source targets are under
/home/ubuntu/authentiscan-backups/anomaly-review-20261108.

## Visual review v3 corrections — 2026-11-08

Supersedes the v2 Authentic shortcut: visual review now operates independently
of the classifier label. A current clean visual review uses the requested exact
message, No significant visual anomalies detected. The image appears visually
consistent. Failed or wholly unassessable reviews do not receive that message.

v3 preserves physical-impossibility explanations instead of treating every
cannot statement as model inability. It conservatively withholds near-duplicate
and textually unrelated findings and normal/plausible statements mislabeled as
concerns. These checks do not independently establish visual truth or complete
category correctness. v2 records remain readable and can be refreshed without
another scan credit. The marker is visual-anomalies-v3; weights are unchanged.

The expanded prompt failed the local road example and normal-fence control and
was rejected. The preceding deployed prompt was retained, verified by exact AST
string comparison against the source backup. Model accuracy on the road example
remains unresolved. Detailed evidence and limitations are documented in
ai-scene/ANOMALY-V3-REVIEW-2026-11-08.md. No development images were exported.

18 Node tests, 19 Python tests, focused desktop/mobile browser checks, local and
AWS builds passed. AWS checks verified the current contract, physical-reason and
duplicate behavior, public HTTPS wording, all five containers, and three model
service health checks. These establish software behavior, not anomaly accuracy.

Rollback images use before-anomaly-v3-20261108 for api, web and visual.
Source backup: /home/ubuntu/authentiscan-backups/anomaly-v3-20261108.

## Self-hosted model evaluation and corrected status — 2026-11-08

The owner explicitly selected keeping images on AWS and evaluating another
self-hosted model. The supplied road image and two controls were stored privately
on AWS; no image was sent to an external vision API. The server has 7,776 MiB
RAM. No instance resize or new paid service was created.

Existing Qwen3-VL 2B/4B and privately evaluated Gemma 3 4B, Qwen3.5-4B and
Qwen3.5-9B candidates did not meet the reference-image acceptance criterion.
Gemma's initial runtime batch assertion was diagnosed and corrected; its actual
finding was still inaccurate. Larger-model and control findings were inspected,
not accepted merely because their JSON parsed. No experimental model was enabled
in production. Full evidence and limits are documented in
ai-scene/SELF-HOSTED-ANOMALY-ACCEPTANCE-2026-11-08.md.

The production panel now says Visual review inconclusive instead of attributing
every withheld review to insufficient visible detail. Its explanation says the
model did not produce reliable, consistent findings. Desktop/mobile checks,
local/AWS builds and public HTTPS checks passed for this wording correction.

The original AI workers were restored after the final test. Automatic anomaly
output matching the owner's example remains unfinished; it must not be claimed
as implemented or validated. Sparse-review source/tests remain experimental.

Web rollback image: authentiscan-web:before-inconclusive-20261108
Source backup: /home/ubuntu/authentiscan-backups/inconclusive-20261108.

## Tentative observations selected by owner — 2026-11-08

The owner explicitly selected “Show tentative observations” after the accuracy
limitations were explained. The current 2B model and five-category response
schema remain in use; none of the rejected model candidates or experimental
sparse-review implementations is promoted.

Review marker: visual-anomalies-v3-tentative-1. The parser and API/browser
normalizer accept category-relevant WHAT/WHERE/WHY statements without requiring
literal content-word overlap between observation and explanation. Both texts
must contain category-relevant terms. Duplicate findings, contradictory normal
claims, missing evidence fields, unsupported provenance claims and category
mismatches remain filtered. These are text checks, not independent visual
verification, and cannot catch every model error.

Cards explicitly say “Tentative AI observations · Unverified”, with an individual
warning that the model may misread the detail. Empty and inconclusive outcomes
remain distinct. Earlier saved records offer Run updated visual check, without
an additional scan credit. No findings are hardcoded for the reference image;
the model can still return no usable observations.

Validation: 16 focused Node tests, 25 Python tests, local production build and
desktop/mobile browser checks passed. The regressions cover different wording,
the screenshot's anatomy explanation incorrectly filed under lighting, valid
bent-window geometry, duplicates and clean/inconclusive/error states.

AWS source backups: /home/ubuntu/authentiscan-backups/tentative-20261108.
Rollback image tags: before-tentative-20261108 (api, visual, web).
Only the two exact, hash-verified rejected 9B evaluation weight files were removed
to free build space. Evaluation images/logs and all production weights remain.

The four deployed source hashes match the tested local versions. AWS api/visual/
web builds and the deployed parser smoke check passed. All five services are up;
classifier (5001), localizer (5014) and visual (5005) readiness checks pass. Public
HTTPS serves App-D94KYtX0.js with both the tentative heading and per-card warning.

The single private road-image request to the deployed /features endpoint returned
HTTP 502. The worker log contained no specific failure diagnostic. No additional
inference retries or model evaluations were started. Therefore successful
WHAT/WHERE/WHY generation on the reference image is still unverified; deployment
and deterministic UI/parser checks must not be described as model-accuracy proof.

## Simple-English paragraph review — 2026-11-08

Owner approved implementation of the finalized simple-English paragraph design.
The panel now combines normalized observations into one paragraph without the
What/Where/Why cards. Position and explanation remain in the internal contract.
Normal, partially assessed, artwork-like and failed review messages are distinct;
failures never become a clean-image statement. Artwork-like appearance does not
establish human authorship, and a classifier score never creates visual findings.

The existing self-hosted Qwen3-VL 2B model is retained. Its shorter prompt requests
everyday words, visible locations and relevant scene interactions, including
apparently impossible interactions that may be intentional. Artistic style and
fantasy subjects alone are not defects. The feature response now retains the
bounded image_type field for contextual wording; no general caption is shown.
The current marker is visual-anomalies-simple-v1; saved earlier reviews remain
readable and offer an updated check. No sample-specific answers are hardcoded.

44 focused Node/Python tests passed, along with the production build and real
desktop/mobile panel harness. These validate software behavior, not model accuracy.
The worker emits only fixed non-sensitive rejection diagnostics to help separate
incomplete generation from invalid review fields. No raw image content or model
response is logged. A proposed process-credential diagnostic was rejected by
automatic approval review and abandoned; normal service endpoints are used.

Rollback tags: before-simple-review-20261108 (api, visual, web).
Source backups: /home/ubuntu/authentiscan-backups/simple-review-20261108.

The live goat-image check exposed a specific validator bug: a complete response
with more than two otherwise valid findings caused HTTP 502 for the entire review.
Both parser and shared normalizer now retain at most two non-duplicate, valid
observations and explicitly mark extras as not shown; extra findings are never
converted into clean assessments. Missing fields, truncated generations and
unsupported origin claims still fail validation. A dedicated regression covers
the actual cause. Final focused suites: 20 Node tests and 26 Python tests passed,
plus desktop/mobile browser checks and the production build. Fixed diagnostics
distinguish too_many_findings from other invalid responses without raw output.

Final deployment verification: all five containers up and three model services
ready; public HTTPS serves App-C3YZhZNf.js. Source hashes match the tested local
versions (worker parser 8646f3e5…, shared contract ae7ab666…). The private goat
request completed successfully after the limit fix and returned the current
simple-review version with bounded findings. No saved scan or scan credit was
created by this check.

Important unresolved accuracy limit: the actual returned goat review incorrectly
said the man's eyes were closed/obscured by the goat, and described body/leg
alignment rather than clearly identifying the goat carrying the person. Thus
the transport/validation failure is fixed and the paragraph presentation is
deployed, but the model has not met the owner's semantic acceptance example.
Do not claim the anomaly detector is accurate, fully finished, or error-free.
No further model trials or inference retries were started after this result.

## False-finding validation improvement — 2026-11-08

The owner supplied an authentic-photo review containing contradictory visibility
claims and an unsupported inference that a held object's barrel extended from a
body. Shared API/browser validation now withholds visibility-only findings
(hidden/obscured details and ordinary closed eyes) unless a specific positive
defect is described. Apparent held/worn-object-to-body connections require an
additional visible boundary/connection defect in the explanation. Ordinary
overlap alone is not treated as an impossible interaction.

These are generic text consistency guards, not image-name or reference-answer
rules. They apply to earlier saved records too. A new paragraph state explicitly
says observations were unclear/conflicting when all concerns were withheld;
filtering cannot manufacture a clean or authentic assessment. Review versions,
model weights and classifier behavior are unchanged. Existing paragraphs keep
their original wording when supported findings remain.

23 relevant Node tests, a production build and desktop/mobile browser checks
passed. Tests replay the exact user-supplied model output, cover current and
historical reviews, preserve positive defect evidence and road/body interactions,
and confirm the false claims disappear from the visible paragraph. This validates
filtering behavior, not image-level detection accuracy. The underlying visual
model remains unvalidated and may invent other findings these guards cannot catch.

Source backups: /home/ubuntu/authentiscan-backups/finding-quality-20261108.
Rollback image tags: before-finding-quality-20261108 (api, web).

Deployment checks passed: both AWS builds, public HTTPS with App-BGsQ57Rj.js,
the exact returned-text regression executed against the API container's validator,
and all three model-service readiness checks. All five containers are running.
No new image inference, image export or saved-scan changes were needed: this fix
validates model output at the shared API/browser boundary. Existing saved reports
are filtered on read after refreshing the site.

## Preview recovery — 2026-11-08

Read-only diagnostics for the user's matching scans 31, 32 and 33 confirmed
Cloudinary original/mask downloads and localizationPreview generation succeed.
Scan 33: original 1,216,050 bytes, mask 1,318 bytes, rendered PNG 1,481,496 bytes;
complete server-side retrieval/render took about 1.2 seconds during the check.
The previous UI used Promise.all and one failure state for both images, making
either failed request hide both. The precise original browser/network trigger
cannot be reconstructed from screenshots, but this coupled failure is verified.

Mesorch previews now load independently, retain a successful image if its peer
fails, handle decode errors and offer Retry images. Aborts/object URLs are cleaned
up on scan changes/unmount/retry. Client deadlines allow original download (60s)
and original+mask retrieval/render (110s), instead of the previous 20s API cap
and shared 25s cancellation. No storage paths, owner checks or saved scans change.
Processing copy no longer promises the removed general image description.

The focused real-panel browser test covers original-only failure, highlight-only
failure, manual retry recovery, invalid image decoding and mobile/desktop fit.
Local and AWS production builds passed. Visual-model accuracy remains unresolved;
withheld observations are not a runtime failure or proof of authenticity.

Source backup: /home/ubuntu/authentiscan-backups/preview-recovery-20261108.
Web rollback tag: before-preview-recovery-20261108.

## Bounded two-pass finalization attempt — 2026-11-08

A separate two-pass candidate was implemented with four passing structural tests.
Actual AWS inference on the authentic-photo control failed: it called normal
texture/lighting findings and the second pass incorrectly approved them as visible
issues. It took 135.7 seconds. The evaluation was stopped before completing the
goat case, and no candidate was deployed. Existing production source files,
scan records and credits were not changed. Automatic restoration of the visual
worker ran, followed by service readiness verification. The 23 existing relevant
Node tests still pass. Detailed limits: ai-scene/TWO-PASS-ACCEPTANCE-2026-11-08.md.

Final detector quality remains unachieved. Another pass of the same model did
not provide independent verification and must not be represented as a solution.

## Final best-effort release accepted by owner — 2026-11-08

The owner explicitly relaxed the accuracy requirement and requested finalization
with the existing model. This finalizes the product as a best-effort visual aid,
not a validated anomaly detector. No further model trials or downloads are needed
for this accepted release; the rejected two-pass candidate remains undeployed.

The final UI distinguishes Possible unusual details, No clear unusual details,
and Review uncertain. A completed review with no assessable details now says the
AI could not give a clear explanation, rather than inviting a retry of an already
cached result. Runtime errors retain the retry action. False-claim guards, simple
paragraphs, classifier independence and preview retry recovery remain in place.
All accuracy limitations still apply; no guarantee of error-free operation or
correct interpretation is implied by this release decision.

23 relevant tests, the real desktop/mobile review harness, the preview recovery
harness and production build passed. Browser harnesses were run sequentially
after an initial shared development-port collision; this was a test-runner issue,
not a deployed service error. Model/API/contract versions are unchanged.

Rollback tag: authentiscan-web:before-final-best-effort-20261108.
Source backups: /home/ubuntu/authentiscan-backups/final-best-effort-20261108.

Final AWS verification passed: web build/deployment, public HTTPS serving
App-xGMLKmdP.js with the final states/uncertainty message/preview recovery, all
five containers running and all three model services ready. This meets the
owner's revised best-effort release scope; the stronger validated-detector
acceptance criteria remain unmet and are not claimed by this release.

## Context-aware graphic explanation — 2026-11-08

Owner requested an explanation appropriate for a designed portrait/score graphic.
Read-only inspection of saved scan 36 confirmed image_type=document, plus an
existing scene description explicitly describing a graphic with portraits,
names, scores and colorful text. The actual returned eye-color comparison
between different people was used as a regression case.

Shared API/browser guards now withhold ordinary differences in human traits
between separate people unless a distinct positive defect is described. Saved
records are filtered on read. A separate note preserves the reason for rejection.
The paragraph can now use existing same-image scene context: normalizeScene must
accept its provider/version/flags and its image hash must match the feature
review. Missing, malformed or wrong-image context is ignored. Document/screenshot
type alone and filenames never establish graphic context or image authorship.

When graphic context is supported, the paragraph identifies an apparent design
or collage, explains that design choices/normal interpersonal differences are
not evidence of AI generation, and distinguishes no reported issue from withheld
or unassessable details. Supported concrete findings remain eligible. The full
caption is not displayed, and the classifier score cannot force findings or
context. Model weights and response/review versions remain unchanged.

27 relevant tests, desktop/mobile browser checks replaying the actual returned
claim/context, and the production build passed. This is best-effort contextual
presentation and filtering, not independently verified model understanding.

Source backups: /home/ubuntu/authentiscan-backups/context-review-20261108.
Rollback image tags: before-context-review-20261108 (api, web).

Final deployment checks passed: both AWS builds, public HTTPS serving
App-DR2ne-vu.js, read-only replay of actual saved scan 36 through the deployed
normalizer plus same-image scene validation, all five containers running and
all three model services ready. No saved scan, credit or original image was
modified. Refreshing and reopening saved scan 36 applies the new presentation.

## Generalized image-context handling — 2026-11-08

Actual scan 37 context said “A graphic displaying four portraits…” while scan 36
said “A graphic image with three portrait photos…”. The previous exact phrase
matcher accepted only the latter. This was a context coverage bug, not missing
images or an inference outage.

The context helper now recognizes the main subject across common graphic,
poster/collage and portrait-grid descriptions. It avoids inferring a graphic
from an incidental poster inside a photograph. Same-image provider/version/hash
checks are retained. Documents, screenshots and artwork also receive contextual
fallback wording without being labeled collages or given an authorship verdict.
Clear, withheld and unassessable results stay distinct for every supported
content type. Photographs and unknown types keep their honest generic fallback.
Filename and classifier scores never choose context. No model change is involved.

29 relevant tests, desktop/mobile browser checks and production build passed.
Regressions include both reported graphic descriptions, varied wording/layouts,
incidental posters, invalid/mismatched context and all six worker image types.
This improves coverage, not universal detection accuracy; incorrect model type
or scene descriptions can still produce incorrect context. No automatic AI
origin inference, classifier correction or validated detector is claimed.

Rollback tag: authentiscan-web:before-general-context-20261108.
Source backups: /home/ubuntu/authentiscan-backups/general-context-20261108.

Final AWS verification passed: public HTTPS serves App-CXYPxnrQ.js; all five
containers and three AI service health checks are good. Read-only replay of
actual scans 36 and 37 using the exact deployed frontend helpers produced graphic
context and cautious design paragraphs for both, with no eye-color accusation.
No saved data or credits changed. This verifies the reported cases and software
coverage, not correct detection for every future image.

## Classification bar presentation — 2026-11-12

Deployed frontend-only update: Authentic/AI-Generated results show one matching
bar. TruthScan results use confidence in that returned label, with an explicit
confidence caption. Uncertain results show both recorded class scores when
available. Missing provider class scores remain 'Not supplied', with a label
confidence explanation; no complementary scores are invented.

Ten mocked browser cases across desktop and phone widths passed, including
99% AI-generated, 87% Authentic, paired 51.49%/48.51% Uncertain, and missing
scores for editing and low-confidence provider results. Production build passed.
Public HTTPS serves index-DwY8NF1s.js. No API inference, credentials or quota
settings changed, and no paid API tests were required for this display change.
Rollback: authentiscan-web:before-classification-bars-20261112T151047Z.
Source backup: /home/ubuntu/authentiscan-backups/classification-bars-20261112T151047Z.

## Results-page simplification — 2026-11-12

Removed the Technical details disclosure from localization views and the
Technical Record panel from the website scan-results page. The production build
passed and public HTTPS serves index-6Lna2bF2.js. This is a frontend-only change;
existing saved records and PDF exports retain their metadata. Provider attribution
in the visual-analysis text remains visible.
Rollback: authentiscan-web:before-result-cleanup-20261112T152924Z.
Source backup: /home/ubuntu/authentiscan-backups/result-cleanup-20261112T152924Z.

## Original image for Authentic results — 2026-11-12

Completed Authentic scan results now show a single uploaded original image under
Suspected edit regions. This view does not request a localization image or show
heatmap-unavailable wording, even if an older record has a saved heatmap. The
owner-authenticated original-image loader retains loading, retry and cleanup.
AI-generated and Uncertain localization views keep their existing behavior.
The frontend production build passed. Public bundle: index-CGm1cU0C.js.
Rollback: authentiscan-web:before-authentic-original-20261112T153307Z.
Source backup: /home/ubuntu/authentiscan-backups/authentic-original-20261112T153307Z.

## AI Edited grouping policy v2 — 2026-11-13

User approved mapping AI Edited at unrounded confidence >=60% to AI-Generated,
while preserving the actual confidence. Below 60% remains Uncertain. Digitally
Edited and unsupported categories remain Uncertain. Saved raw labels remain
intact; explanations distinguish AI editing from a wholly AI-generated image.
Web selected-class bars now support the AI Edited raw label and state that the
number describes detected AI editing. New records use truthscan_label_confidence_60_v2;
older records retain their saved explanatory policy unless explicitly migrated.

15 focused backend/presentation checks and 12 mocked browser cases passed,
including exact 60%, just below 60%, unchanged 97.25% and both viewport sizes.
Production build passed. Deployed API readiness/cloud health passed, and public
website serves index-DjYVyxcm.js. The shared backend applies the mapping to mobile
as well. No provider inference calls were made for this change.

The idempotent saved-record migration checked all users for AI Edited records:
0 matching records; 0 modified. Original analyses would be retained in private
analysis_policy_history for any future deliberate run against matching records.
Rollback images use suffix before-ai-edited-policy-20261113T111723Z (api and web).
Source backup: /home/ubuntu/authentiscan-backups/ai-edited-policy-20261113T111723Z.

## Calculated display remainder for low-confidence results — 2026-11-13

At the user's request, below-60% Uncertain results with known Real, AI Generated,
or AI Edited labels now show the returned confidence and a complementary display
value (100% minus confidence). The complement is explicitly labeled Calculated
remainder and a visible note explains that it is not a separate model score or
verified probability. Neither stored analysis, original confidence, verdict,
provider policy, PDF data nor app quota is changed by this frontend display.
Unknown/Digitally Edited labels do not receive fabricated binary comparisons.
Genuine supplied score pairs and selected-class displays retain their behavior.

18 mocked browser cases passed across desktop/phone widths, including the exact
52.24416255950928% response displayed as AI-generated 52.24% and calculated
Authentic 47.76%. Production build passed. New public bundle: index-BvxW7nB9.js.
Rollback: authentiscan-web:before-display-comparison-20261113T141608Z.
Source backup: /home/ubuntu/authentiscan-backups/display-comparison-20261113T141608Z.

## Neutral visual-analysis caption — 2026-11-14 (Philippine time)

Changed only the website What looks unusual caption to: Automated visual analysis.
Observations may be incorrect. No claim of a team-trained model was introduced.
Provider attribution in PDF reports/documentation and underlying source metadata
is retained. Production build passed; public bundle index-B0OO4OI-.js.
Rollback: authentiscan-web:before-neutral-caption-20261113T160454Z (UTC).
Source backup: /home/ubuntu/authentiscan-backups/neutral-caption-20261113T160454Z.

## Bento results page — 2026-11-14 (Philippine time)

Redesigned the website result page into a responsive light-theme bento layout:
large owner-protected original image, adjacent classification and explanation
cards, separate localization and observation panels, organized indicator rows,
and clear feedback/scan-again actions. Filename, size and upload date sit with
image metadata. Back navigation now returns to Scan History. Authentic results
show the original once in the main image card, without a duplicate heatmap view.
Technical Record/details remain absent. Actual saved scores, explicit calculated
remainder labeling, uncertainty policy, PDF export behavior and neutral caption
are preserved. No analysis API or model changes were made.

15 mocked layout cases passed (Authentic/AI-Generated/Uncertain at 1440, 1024,
768, 390, and 320 px), with long filenames, no horizontal overflow, proper desktop
placement/phone stacking, no local inference, original-only Authentic view,
indicator expansion, protected image failure/retry, history and feedback links.
Visual screenshots were inspected on desktop and phone. Production build passed.
Public HTTPS serves index-nNo1Ox_3.js and index-DoLZtsrw.css. No paid provider calls
were needed. Native mobile app UI is not changed by this website deployment.
Rollback: authentiscan-web:before-result-bento-20261113T163136Z (UTC).
Source backup: /home/ubuntu/authentiscan-backups/result-bento-20261113T163136Z.


## Dashboard Option B and Poppins — 2026-11-14 (Asia/Manila)

Explicitly approved by user after deployment approval request. Deployed compact
Option B dashboard with scan-entry card, 2x2 live statistics, recent scans, and
self-hosted Poppins 5.3.0 as the website sans font. Existing colors, logo,
rounded cards, navigation, dashboard data requests and allowance refresh remain.
Website-only update; native mobile APK and analysis/API behavior unchanged.

Dashboard browser checks passed at 1440/1280/1024/768/390/320 px with loading,
empty, error/refresh recovery, Free/Pro, zero counts, long names, and navigation.
Existing result bento checks passed for three verdicts at five widths with the
new font. Production build passed. No paid analysis calls used for validation.
Public HTTPS dashboard, index-Ba3U09eq.js, App-B2f_6mV0.js,
index-DXYITMLH.css and Poppins WOFF2 returned 200. API container stayed running.
Rollback: authentiscan-web:before-dashboard-bento-20261113T174353Z.
Source backup: /home/ubuntu/authentiscan-backups/dashboard-bento-20261113T174353Z.


## Scan Image completed state Option A — 2026-11-14 (Asia/Manila)

User explicitly approved uploading this update to AWS. Deployed Option A with
wider completed-state results, compact upload summary, larger natural-aspect
original/heatmap comparison, report actions above comparison, saved returned-label
confidence context and validated numeric rendering. Allowance display reads the
server effective plan, refreshes after completion/focus/reset/expiry, and handles
unavailable/retry without guessing Free or Unlimited. Poppins and existing branding
preserved. Protected images, export, credit messages, upload locking and pending/
failed flows retained. Existing saved-report layout uses unchanged default sizing.
No server/shared inference, classification mapping, threshold or billing rule edits.

Production build and seven-width isolated Scan Image browser checks passed,
including plan changes, retry, PDF export, duplicate-upload prevention, image retry,
missing heatmap/confidence, legacy scores and pending/failed. Existing result-page
regressions passed for three verdicts at five widths. No paid AI calls were used.
Public /scan, index-6h5cO852.js, App-BVu4sQGB.js and index-Ko6PS0rP.css returned
HTTPS 200. Website and API running; API was not recreated. Native mobile APK unchanged.
Rollback: authentiscan-web:before-scan-option-a-20261113T181702Z.
Source backup: /home/ubuntu/authentiscan-backups/scan-option-a-20261113T181702Z.


## Account flow Option B — 2026-11-14 (Asia/Manila)

Explicitly authorized by user: implement compact Option B and deploy to AWS.
Deployed shared 420px account cards, compact spacing/footer, existing Poppins/logo/
cyan/navy/pale-blue styling, consistent Sign in/Create account wording, clearer
verification/password guidance, associated field errors, focus, loading and success
states across login, registration, forgot/check email, verification and reset password.
SDK calls, recovery privacy, password minimum and server verification rules unchanged
(hash verified). Resend cooldowns and routing retained; duplicate request guards added.

Production build passed. New isolated suite passed 30 layouts plus confirmation at
five widths and core account/recovery behavior. Existing password recovery regression
passed. No production emails or password updates were issued. GET-only public browser
checks rendered login, registration, forgot and invalid reset-link views successfully.
All five account route HTML responses and new JS/CSS returned HTTPS 200. API remained
up without recreation. Native mobile APK unchanged. Firebase console/templates were
not changed or verified; outgoing reset links must point to the branded handler to
use this design instead of a Firebase-hosted page, subject to other email-action modes.

Served index-CD26uGa6.js, App-Kv9xDrtL.js, index-BZp1AsTF.css, App-D-UByWq3.css.
Rollback: authentiscan-web:before-account-option-b-20261114T042145Z.
Source backup: /home/ubuntu/authentiscan-backups/account-option-b-20261114T042145Z.


## Dashboard diagnostics panel removed — 2026-11-14 (Asia/Manila)

Removed the Connection Tools & Diagnostics disclosure and unused SystemReadiness
import from DashboardPage only, as requested. Backend and upload readiness checks
remain unchanged. Production build passed; public HTTPS serves index-xoporor4.js
and App-CY-6YkPE.js without the removed panel text. Web-only deployment.
Rollback: authentiscan-web:before-dashboard-remove-diagnostics-20261114T042907Z.
Source backup: /home/ubuntu/authentiscan-backups/dashboard-remove-diagnostics-20261114T042907Z.


## Subscription Option A — 2026-11-14 (Asia/Manila)

User selected Option A and explicitly requested AWS deployment. Implemented compact
current-plan banner and pricing cards, aligned plan information, subtle cyan Pro
emphasis, earlier payment history with desktop columns and mobile order cards.
Added adjacent disabled-checkout explanations for acknowledgement, account availability,
and busy states. Preserved Poppins, logo, sidebar, pale background and rounded cards.

Price is still server-provided; scan limits, calendar-month duration, exact expiry,
return-to-Free/saved-scans behavior, simulation notice, required acknowledgement,
checkout destination validation and original effect/action handlers remain unchanged.
Server/shared/service hashes verified unchanged. Pro increases allowance, not accuracy.

Production build, 7 existing billing unit tests and 36 isolated responsive layouts
passed. Browser checks cover Free/Pro, empty/populated history, unknown offer,
account restrictions, keyboard acknowledgement gating, loading/error/retry, payment
checks, returned/cancelled routes and no external calls. Desktop/mobile screenshots
visually inspected. Firebase-emulator integration tests were not run successfully:
the local-only project guard requires an emulator environment; no production billing
tests or checkout sessions were issued.

Web-only deployment UTC 2026-11-14T04:56:06Z. API not recreated.
Rollback: authentiscan-web:before-subscription-option-a-20261114T045606Z.
Source backup: /home/ubuntu/authentiscan-backups/subscription-option-a-20261114T045606Z.
Entry: index-qcbxq6Ya.js; App-aBPtMMrj.js; index-BBF4iodZ.css; App-DwHMqsnE.css.

## Verify-first registration — November 14, 2026

API and web deployed at 2026-11-14T07:49:58Z. Email OTP verification now precedes Firebase Auth/user profile creation. Firebase direct client signup disabled; email/password sign-in remains enabled. No existing accounts removed. Backend, web and mobile checks passed; live invalid-input rejection and deployed asset hashes verified. No real emails/accounts created in testing. Physical-device/inbox smoke test remains manual.

Avatar editor deployed API/web at 2026-11-14T11:08:23Z. Crop, zoom, reposition, rotate, flip, save and remove in Profile; sidebar shows the saved avatar. Server validates/resizes/strips metadata and saves only to the authenticated active user's profile. Backend tests (local/staged image), responsive Chrome tests and build passed. Live assets/auth rejection verified without changing real profiles. Rollback images: authentiscan-api:before-avatar-20261114T110823Z and authentiscan-web:before-avatar-20261114T110823Z. Source backup: /home/ubuntu/authentiscan-backups/avatar-editor-20261114T110823Z. Notes: output/avatar-editor-20261114/STATUS.md.

Profile Option A website deployed at 2026-11-14T11:33:45Z. Compact left summary/right forms, explicit view/edit/save/cancel, read-only email, quiet metadata, concise password guidance and avatar controls. Missing last-login data displays Not available. API/authentication services unchanged. Profile responsive/state tests, avatar regressions and production build passed; live HTML/assets verified. Rollback: authentiscan-web:before-profile-option-a-20261114T113345Z. Source backup: /home/ubuntu/authentiscan-backups/profile-option-a-20261114T113345Z. Notes: output/profile-option-a-20261114/STATUS.md.

Feedback Option 2 website deployed at 2026-11-15T07:26:38Z. Compact five-star rating with selected-value label; original rating meanings, privacy, optional 500-character comment, one submission and recovery logic preserved. Report layout/API unchanged; API container not recreated. Production build, responsive feedback/state/recovery tests and live asset verification passed. Rollback: authentiscan-web:before-feedback-option-2-20261115T072638Z. Source backup: /home/ubuntu/authentiscan-backups/feedback-option-2-20261115T072638Z. Notes: output/feedback-option-2-20261115/STATUS.md.

PDF neutral wording deployed API-only at 2026-11-15T13:29:30Z. Repeated vendor branding replaced with neutral captions/notes; external-service source and confidence/heatmap limitations retained. Saved provenance, classification and inference unchanged. Three synthetic four-page PDFs rendered/text-checked; deployed synthetic PDF generation and source hash passed. Zero active processing scans checked before API recreation. Rollback: authentiscan-api:before-report-wording-20261115T132930Z. Source backup: /home/ubuntu/authentiscan-backups/report-wording-20261115T132930Z. Notes: output/report-wording-20261115/STATUS.md.

Rollback images: authentiscan-api:before-verify-first-20261114T074958Z and authentiscan-web:before-verify-first-20261114T074958Z. Backup: /home/ubuntu/authentiscan-backups/verify-first-registration-20261114T074958Z. Full notes: output/verify-first-registration-20261114/STATUS.md. Image rollback alone does not restore Firebase signup policy. Mobile requires latest source reload or rebuilt APK.

Digital-editing display update deployed API/web at 2026-11-16T15:54:56Z. Completed Digitally Edited results meeting 60% use the explicitly explained Authentic application grouping; actual editing confidence retained and labelled separately from authenticity. Stored evidence unchanged. Public build asset hashes, API availability and deployed synthetic projection/PDF generation verified. Rollback: authentiscan-api:before-digital-editing-display-20261116T155456Z and authentiscan-web:before-digital-editing-display-20261116T155456Z. Source backup: /home/ubuntu/authentiscan-backups/digital-editing-display-20261116T155456Z. Notes: output/digital-editing-display-20261116/STATUS.md. Native source checked/exported; devices require Expo reload or rebuilt APK.

Website-only verdict simplification deployed 2026-11-16T16:08:16Z (November 17 Philippine time). Grouped digital-editing results show only the existing Authentic badge in the verdict area; score card and editing notes hidden there. Explanation retains detection meaning and caveats. Actual stored confidence, API, PDF and native source unchanged. Fifteen responsive result cases and history check passed; production build and live asset verification passed. Rollback: authentiscan-web:before-authentic-verdict-20261116T160816Z. Backup: /home/ubuntu/authentiscan-backups/authentic-verdict-20261116T160816Z.

Website-only reported confidence update deployed at 2026-11-16T16:12:44Z (November 17 Philippine time). Authentic grouped verdict displays actual returned score under Reported confidence with cyan bar and link guidance to explanation; no editing wording in score card. Existing explanation and API/PDF/native source unchanged. Responsive result/history checks and build passed. Live HTML/assets match tested build and API config available. Rollback: authentiscan-web:before-reported-confidence-20261116T161244Z. Backup: /home/ubuntu/authentiscan-backups/reported-confidence-20261116T161244Z.

Website caption removal deployed 2026-11-16T16:17:31Z (November 17 Philippine time). Removed For [returned label] line from completed Scan Image confidence card. Actual score, bar, confidence explanation and classification remain unchanged. Production build passed; live assets verified. API/native/PDF unchanged. Rollback: authentiscan-web:before-confidence-caption-20261116T161731Z. Backup: /home/ubuntu/authentiscan-backups/confidence-caption-20261116T161731Z.

Original-only display policy deployed API/web 2026-11-16T17:16:49Z (November 17 Philippine time). Authentic verdicts and every Digitally Edited provider label (including below-60 Uncertain) show uploaded originals only. API serialization omits localization/heatmap URL and heatmap/localization-image routes reject these results. Saved media/evidence/scores unchanged. PDF renderer shows one full-width original instead of comparison/heatmap panel. AI Generated and AI Edited heatmaps remain available. Fifteen policy/pipeline tests, five-width report regressions with zero heatmap requests for affected results and AI heatmap control, seven-width Scan Image workspace tests, native parity and TypeScript, web build passed. Four synthetic PDFs text/boundary checked; original-only page rendered and visually inspected. Live asset hashes/API availability and deployed synthetic safeScan cases/PDF passed. No real scan credits used. Native source updated; Expo reload/rebuilt APK needed. Rollback: authentiscan-api:before-original-only-20261116T171649Z and authentiscan-web:before-original-only-20261116T171649Z. Source backup: /home/ubuntu/authentiscan-backups/original-only-20261116T171649Z.

November 17, 2026 Philippine time: cleaned unused Docker build cache only (docker builder prune --all --force). Docker reported 3.939 GB reclaimed. Root disk fell from 91% used / 3.6 GB free to 82% used / 6.9 GB free. All 59 images, tagged rollbacks, containers, volumes, model/source files and backups preserved. Website/API containers continued running without restart; public /dashboard and /api/config returned HTTP 200.

Website-only dropdown removal deployed 2026-11-18T05:53:56Z. Removed How this result was calculated from the shared Result explanation component; main explanation, actual scores and classification behavior unchanged. Production build passed; public HTML and JS hashes match local build, removed text absent, main explanation present, API config HTTP 200. API/native/PDF unchanged. Rollback: authentiscan-web:before-remove-calculation-dropdown-20261118T055356Z. Source backup: /home/ubuntu/authentiscan-backups/remove-calculation-dropdown-20261118T055356Z.

Website explanations deployed UTC 2026-11-18T06:26:16Z. All seven current result cases checked with synthetic inputs; approved AI-involvement and grouped-Authentic explanation wording applied in presentation. Classification, scores, saved analysis, API/native/PDF unchanged. Six policy tests and production build passed; live HTML/entry/App hashes match, approved wording present and calculation dropdown absent, API config HTTP 200. Rollback: authentiscan-web:before-result-explanations-20261118T062616Z. Source backup: /home/ubuntu/authentiscan-backups/result-explanations-20261118T062616Z.

Website inline explanation deployed UTC 2026-11-18T06:44:16Z. Report explanation moved below confidence scores inside classification card; separate pale-blue card removed, scan-credit notice retained inside classification card, explanation heading retained for screen readers. Build and five-width browser regressions passed. Live HTML/JS/CSS hashes verified; API config HTTP 200. API/native/PDF/scores unchanged. Rollback: authentiscan-web:before-inline-explanation-20261118T064416Z. Source backup: /home/ubuntu/authentiscan-backups/inline-explanation-20261118T064416Z.

Website card-height fix deployed UTC 2026-11-18T07:03:59Z. Report bento grid uses items-start so classification card fits its content instead of stretching to image height. Production build passed, live HTML/JS/CSS hashes verified, API config HTTP 200. API/native/PDF/scores unchanged. Rollback: authentiscan-web:before-card-height-20261118T070359Z. Source backup: /home/ubuntu/authentiscan-backups/card-height-20261118T070359Z.

Website history-label update deployed UTC 2026-11-19T17:17:47Z (November 20 Philippine time). History now shows Confidence instead of Editing confidence. Scores, classifications, explanations and stored analyses unchanged. Production build passed; live HTML/entry/App hashes match, removed label absent, API config HTTP 200. API/native/PDF unchanged. Rollback: authentiscan-web:before-history-confidence-20261119T171747Z. Source backup: /home/ubuntu/authentiscan-backups/history-confidence-20261119T171747Z.


## Option B appearance controls — 2026-11-20

Deployed at 2026-11-20T04:25:23Z. The website now uses shared semantic
colors for Light and deep navy Dark. System is the default. Desktop workspace
controls are above the sidebar account area; public and mobile headers have an
Appearance selector. Preferences persist locally, sync across tabs, and follow
OS changes in System mode. A synchronous head script applies the theme before
React/styles load. Images and heatmaps retain their colors; API-generated PDFs
and authentication/payment/detection behavior are unchanged. Only web was recreated.

Validation: production build; 66 responsive theme layouts; 30 account layouts;
36 subscription layouts; profile edit/password states; feedback keyboard/rating/
loading/error/submission rules; three report verdicts at five widths. The loading
fixture delay was increased to make the existing feedback loading check reliable.
No live accounts, scans, payments or feedback were created during verification.

Rollback image: `authentiscan-web:before-theme-option-b-20261120T042523Z`.
Source backup: `/home/ubuntu/authentiscan-backups/theme-option-b-20261120T042523Z`.
Release and checks: `output/theme-option-b-20261120/`.

Live verification passed: 20 deployed files match local SHA-256; Light/Dark controls at 1440, 390 and 320px; reload persistence; System changes; white print background; no page errors. See output/theme-option-b-20261120/live-checks.json.


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


## History filter and dashboard cleanup — 2026-11-20

Website deployed at 20261120T101339Z. History removes only the Queued for AI,
Processing and Completed filter options. The dashboard replaces Queued scans
with Authentic, using the existing paginated authentic-filter total (limit 1)
for an exact account-wide count. Scan statuses, analysis data and API behavior
are unchanged. All 23 built files verified against live SHA-256; /api/config responds,
and the API container was not recreated. Existing APK downloads are retained.

Rollback: `authentiscan-web:before-history-filter-cleanup-20261120T101339Z`.
Source backup: `/home/ubuntu/authentiscan-backups/history-filter-cleanup-20261120T101339Z`.
Mobile has matching UI changes in local source for Expo Go only. No APK build,
mobile deployment or GitHub push. Tests: website production build, isolated
Light/Dark dashboard/History checks at 1440/390/320px, mobile TypeScript, targeted
UI/History tests, exact count/filter tests and 28 backend contract checks.
Records: `output/history-filter-cleanup-20261120/`.


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


## Appearance pill — 2026-11-21

Website deployed at 20261121T042806Z. The existing Appearance control now has a 112 × 48 sun/moon switch with visible Light/Dark selection, screen-reader checked state, keyboard access, focus ring and reduced-motion support. No System option or OS-change subscription remains. Legacy System (including the old unset default) resolves once into a saved explicit theme before app content. Local-storage failures offer Retry saving theme. Cross-tab synchronization retains explicit preferences. Existing layout, auth, analysis, images, PDF output and API are unchanged.

Validation: production build; 66 web route/theme/viewport checks at 1440/390/320px; System migration in both themes; persistence, cross-tab, keyboard and blocked storage; mobile TypeScript, 24 contrast checks, 42 style factories, restoration/migration/storage tests and targeted navigation/history/delete regressions. 23 live files verified by SHA-256. API container unchanged.

Rollback: `authentiscan-web:before-appearance-pill-20261121T042806Z`. Source backup: `/home/ubuntu/authentiscan-backups/appearance-pill-20261121T042806Z`. Records: `output/appearance-pill-preview-20261121/`. Matching mobile changes are local for Expo Go. Existing APK remains 1.0.3; no APK rebuilt or GitHub push.


## Profile Scan overview — 2026-11-21

Website deployed at 20261121T075908Z. Adds the approved compact 2 × 2 Scan overview directly below the existing profile summary, stacking before personal details on narrow screens. Shared ScanStatCards and useScanStatistics now supply both Dashboard and Profile from fetchUserStats plus the exact Authentic pagination total (status authentic, limit 1). No sample values in production. Keeps Free daily allowance and Pro null-as-Unlimited semantics. Missing/failed fields show dashes and Unavailable; actual zero stays zero. Includes retry, focus/visibility and allowance-reset refresh, category-coverage guidance and View scan history. Existing profile/photo/password/sidebar/theme UI retained.

Validation: production build; isolated Profile/Dashboard API fixtures, matching values, 10 Light/Dark layout cases at 1440/1024/760/390/320px, Free/Pro/zero/loading/missing/stats-failure/Authentic-failure/retry, focus and allowance-reset refresh, keyboard focus/history navigation and retained profile/password/theme controls. Existing dashboard/history regression passed. All 23 published files verified by SHA-256; API health responds and container unchanged.

Rollback: `authentiscan-web:before-profile-scan-overview-20261121T075908Z`. Source backup: `/home/ubuntu/authentiscan-backups/profile-scan-overview-20261121T075908Z`. Records: `output/profile-scan-overview-implementation-20261121/`. Website only; native mobile and APK unchanged, no GitHub push.


## PDF confidence correction — 2026-11-21

Export renderer deployed at 20261121T080723Z. Provider-backed PDFs now display the saved provider_label_confidence prominently on page one instead of looking for unavailable binary class scores. No complement is invented and no analysis values or verdicts are changed. Score meaning remains explicit for returned-label and editing confidence. Missing/invalid confidence shows Not supplied. Native classifier exports retain their separate class scores. Removes the Technical record section and its orphan final page; saved original media, visual observations, explanations and footer caveats remain. Existing downloaded files must be re-exported.

Validation: 12 synthetic confidence/export cases, 6 longer layout/uncertainty/failed/invalid fixtures, page numbering and margin checks, PNG rendering inspected, 2 image/orientation/safety tests. Staged and running API containers generated a synthetic PDF successfully without live scans or credits. Deployed renderer SHA-256 e832c777a7b7133c89de19292cd3f233aa7617b26d2bbd0636c3ac5dafaedd30. Website container unchanged.

Rollback: `authentiscan-api:before-pdf-score-fix-20261121T080723Z`. Backup: `/home/ubuntu/authentiscan-backups/pdf-score-fix-20261121T080723Z`. Records: `output/pdf-score-fix-20261121/`. Export API fix applies to web and mobile download requests. No website bundle change, native rebuild, APK release, or GitHub push.
