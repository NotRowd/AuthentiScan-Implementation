# Local scene observations

## Output safeguards and rejected prompt candidate — 23 October 2026

Incomplete/refused model completions now fail explicitly, and an all-unassessable
review is no longer summarized as no clear concern. The separate grounded prompt
comparison completed six requests but still invented details; it was **not**
enabled. See `GROUNDED-REVIEW-2026-10-23.md`. These changes improve output handling,
not factual accuracy. The visual reviewer is not yet accepted as reliable.

## Duplicate-category response fix — 20 October 2026

The user-supplied original classroom JPEG reproduced a model-output failure:
the model returned two `eyes` entries and omitted `scene`. The strict parser
rejected the combined review, making both the description and feature review
unavailable even though the model process was running.

- Request format `structured-development-v3` uses an object with five required,
  named slots: `eyes`, `shape`, `texture`, `lighting`, and `scene`. Each slot has
  one status, observation and location. The prompt treats both eyes together.
- Parsing still rejects missing/extra slots, duplicate JSON keys, incomplete
  concerns and unsupported provenance claims. Historical array responses remain
  readable only if they pass the same strict checks. No missing finding is
  invented, and invalid output is not silently converted to a successful review.
- The public description and feature-review contracts are unchanged. Named slots
  normalize into the existing five-item array and share the existing image-bound
  cache. Classifier decisions, credits and saved scans are unchanged.

Verification: 16 Python parser/adapter/lifecycle tests and 19 backend review
tests passed; the AI baseline lock verified unchanged. The original JPEG then
completed real local inference in 66.4 seconds and passed both backend contract
normalizers with a description and all five unique checks. This is a response
availability regression check, not an accuracy validation: the response still
misread visible text and described eye blur, which is not proof of editing.
Local diagnostic reports are in ignored `runs/photo-review-diagnostic-2026-10-20`
and `runs/photo-review-fixed-2026-10-20`; they contain model text, not image bytes
or credentials. No Firebase records were written.
The real project-logo integration check also passed concurrent backend
description/feature requests, forced owned-adapter termination, automatic model
recovery, and release of both test ports on shutdown.

To reproduce another image locally, use `diagnose_image_review.py --image PATH
--output NEW_DIRECTORY` with the `.venv-vaas` interpreter. Stop the running
backend first: the diagnostic refuses occupied model port 5007 and only cleans
up its own model process. It never updates a saved scan.

Restart the backend to load the new request format. After its ready message,
open the existing report and retry the missing observations; no re-upload or
additional scan credit is needed.

## Visual-review availability fix — 20 October 2026

- Visual review now starts independently of `AUTHENTISCAN_LOCALIZATION_MODE`.
  Both normal cloud startup and the existing mobile launcher start Qwen when
  its local assets are installed. Previously normal startup silently skipped it
  unless experimental localization was enabled. Explicit opt-out remains possible
  with `AUTHENTISCAN_SCENE_MODE=off`.
- Description and feature requests now share a bounded backend queue: one active
  request, at most four waiting, and a 60-second maximum queue wait. Concurrent
  retry clicks no longer send overlapping inference requests from this backend
  to the single CPU model. Overload still fails safely; requests are not retried
  indefinitely. Other independently launched callers are not covered by this queue.
- Web/native review timeouts and server leases include queue time. No scan is
  charged again for retrying saved observations. Upload-time preparation and
  independent classifier results remain unchanged.
- Upload failures log only fixed diagnostic messages for connection, timeout,
  busy queue, model failure, or unusable output. No image bytes, generated text,
  credentials, or arbitrary exception messages are logged.

These changes address confirmed startup/request-handling problems. The later
original-image reproduction above identified a separate duplicate-category
failure. Neither change improves model accuracy or makes the failed localizer valid.

Verification: `npm.cmd run test:qwen` covers startup modes, existing-service
protection, queue bounds/expiry/recovery and shared adapters. The real local test
`node tests/scene-lifecycle-live.mjs` uses only the project logo on an isolated
adapter, starts description/features concurrently, checks owned-process recovery,
and releases its ports. Do not run this live test beside a model on port 5007.
Native type checking/current-AI tests and the web build also pass.

To apply: stop the backend with Enter, wait for the PowerShell prompt, then run
`npm.cmd run start:cloud:mobile` again from `firebase-local`. Keep the classifier
running separately. Wait for `Qwen local descriptions and visual review ready`.
Open the saved scan and retry missing observations; do not re-upload to repair
an existing report. The evaluated IML-ViT replacement remains disconnected.

## Startup/shutdown reliability update — 19 October 2026

- Windows adapters join a private kill-on-close Job Object before creating the
  model. The job handle is not inherited. An abrupt adapter exit therefore also
  terminates its own model, without touching unrelated processes. See
  [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).
- Parent-pipe watching uses raw descriptor reads, not Python's buffered stdin;
  startup failure can exit without the `_enter_buffered_busy` shutdown crash.
- Occupied adapter/model ports fail with a clear message. No process is killed
  merely because it uses port 5005 or 5007. A pre-existing legacy orphan requires
  identity/ownership verification and manual cleanup once.
- The backend awaits scene shutdown before exiting. Unexpected owned-adapter
  exits get at most two restart attempts per backend session. A model crash makes
  its adapter exit so recovery can run. Initial startup failure is reported, not
  retried indefinitely. Existing separately launched services are not supervised
  or terminated by another backend.
- Readiness checks distinguish the Windows virtualenv launcher from its actual
  Python interpreter. Both IDs are exposed locally for ownership matching.
- Description/review failures have specific user-facing messages; saved results
  and credits are unchanged. Recovery does not automatically rerun failed scans.
  Retry the missing observations on the saved report after the service is ready.

Tests: `python -m unittest test_process_lifecycle test_qwen_service -v` in this
directory with `.venv-vaas`; `npm.cmd run test:qwen` in `firebase-local`.
`node tests/scene-lifecycle-live.mjs` in `firebase-local` checks real inference,
forced temporary-adapter exit, automatic recovery and reusable ports. It uses
the project logo, no Firebase writes, adapter port 5015 and model port 5007;
both test ports must be free first. Do not run it beside the live scene service.

Restart normally using `npm.cmd run start:cloud:mobile`. Wait for
`Qwen local descriptions and visual review ready` and the website startup line.
Press Enter in the backend terminal and wait for shutdown before starting again.

Verification on 19 October: seven Python lifecycle/adapter tests, thirteen Node
scene/supervisor tests, and all 80 backend/emulator regressions passed. The real
model generated a description and five-feature review, recovered after forced
temporary-adapter termination, generated a description again, and released both
ports on shutdown. The AI baseline lock verified unchanged. Only the previously
verified orphan model was cleared; classifier PID 15964 remained running. The
main backend was left stopped for the user's normal restart.

## Current provider: Qwen (16 October 2026)

At Kent's request, the downloaded Qwen3-VL-2B candidate is now connected to the
existing `/scene` and `/features` backend flows. The older SmolVLM setup below is
retained as historical documentation, not the current startup target.

- Restart the backend with `npm.cmd run start:cloud:mobile` from
  `D:\AuthentiScan - backend\firebase-local` (or the existing experimental web command).
  Stop the older backend terminal first; an occupied scene port is never taken over.
- Startup launches `qwen_service.py` on loopback port 5005 and its authenticated
  llama.cpp child on loopback port 5007. Do not run the evaluation script at the
  same time. It uses the same port 5007. Missing assets fail closed, without a
  hidden fallback to the older model.
- The new description contract is version 3. Old SmolVLM captions remain readable
  during updates; failed updates preserve saved text. Web result pages update
  older descriptions automatically, then request the separate five-feature review.
  New cached descriptions do not rerun or consume credits.
- The web PDF renderer accepts both old and new descriptions. Export after the
  new description has finished saving. Export itself does not run inference.
- Android's description version guard is updated to version 3. Reload its bundle
  after restarting the backend. Physical Android testing remains a manual check;
  this change does not add a native five-feature review panel.
- The runtime validates pinned model/runtime hashes at startup and stops its own
  child on normal shutdown or parent-pipe closure. It stores no uploaded image
  files. One parsed response may be reused in memory for 120 seconds so the scene
  and feature calls need not infer twice; it is hash-bound and size-bounded.
- Inference is local; existing image storage and Firestore persistence are
  unchanged. Model text remains unverified. No classification, threshold,
  Grad-CAM, object detector, or localization changes were made.

**Integration is not accuracy validation.** The small prior screen produced no
positive visual-concern findings. We have not established reliable anomaly
detection or named causal reasons for the classifier's verdict. The original
AI lock remains a preserved baseline; the new provider is a separate extension
with pins in `visual-candidate.json`, not a silently rewritten baseline.

Checks: `npm.cmd run test:qwen` and `npm.cmd run test:qwen:live` from
`firebase-local`; Python tests: `python -m unittest test_qwen_service
test_visual_candidate -v` using `.venv-vaas` from this directory. The live smoke
test uses the project logo, temporary port 5015, and the real backend adapters;
it does not create accounts or write scans. Runtime port 5007 must be free.

Integration verification on 16 October 2026: 69 backend/emulator tests, 8 focused
JavaScript contract tests, 9 Python adapter/evaluation tests, the browser regression
suite and web production build passed. Android contract/panel tests and TypeScript
checking passed. Real Qwen inference through both backend adapters completed in
23.93 seconds on the logo; the feature call reused the hash-bound response. Its
temporary processes exited normally. These checks demonstrate integration, not
anomaly accuracy. No real cloud accounts or saved scans were changed for testing.

## Historical SmolVLM implementation

This optional web feature runs HuggingFaceTB/SmolVLM-500M-Instruct on this PC.
It provides a short tentative scene observation, not proof of manipulation or
an AI-authorship decision. It may miss anomalies, hallucinate details, or just
describe the scene. It has not been validated as an anomaly detector.

## Model and privacy

- Official source: https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct
- Model-card license: Apache-2.0.
- Pinned revision: `a7da5b986cb59b408707209984f360a5f4ad7e47`.
- Weight SHA256: `d05b567eeaf534e83d375551f068ed57b5f52d37c657197f644af5ef9db091a2`.
- About 1.02 GB of model files. No API key, paid API, or external vision request.
- Uses the existing isolated `ai-localization/.venv-vaas` Python environment.
- Offline model loading, `trust_remote_code=False`, safetensors, CPU inference.
- The inference service only listens on `127.0.0.1:5005`. It rejects browser
  origins and requires the backend's custom header. It does not save user images.
- **Existing Firebase/Cloudinary behavior is unchanged.** The backend retrieves
  the scan's existing stored image for local inference, and saves the resulting
  text with the scan in Firestore. This feature does not make the entire app's
  storage local or send images to an external vision-AI provider.

## Setup and run

Complete the pinned download once from the project root:

```powershell
& '.\ai-localization\.venv\Scripts\python.exe' -u '.\ai-scene\prepare_model.py'
```

If that connection is slow, stop that downloader before using the resumable
range downloader. Never run both concurrently:

```powershell
& '.\ai-localization\.venv\Scripts\python.exe' -u '.\ai-scene\resume_weights.py'
& '.\ai-localization\.venv\Scripts\python.exe' -u '.\ai-scene\prepare_model.py'
```

The range downloader preallocates a file: its file size is **not** completed
download progress. Read `ranges.json` or the terminal's completed-byte counter.
The service starts only after `manifest.json` exists and hashes pass.

Start the classifier normally if needed, then restart the existing web terminal:

```powershell
Set-Location 'D:\AuthentiScan - backend\firebase-local'
npm.cmd run start:cloud:experimental
```

This starts the local object detector, localization model, and scene model.
Do not start duplicate services. Missing/failed scene setup does not prevent
the main web app from starting; automatic image observations then report unavailability
with a retry button. The saved classifier explanation remains visible.

For standalone troubleshooting only:

```powershell
Set-Location 'D:\AuthentiScan - backend'
& '.\ai-localization\.venv-vaas\Scripts\python.exe' -u '.\ai-scene\feature_service.py'
```

## Adviser demo

1. Open a **completed** scan in the web app.
2. Read **Result explanation** directly below the verdict. It automatically summarizes
   the saved class decision and scores, even when the scene model is unavailable.
3. Image observations start automatically on opening a completed result that lacks
   the current explanation. Wait for local inference (CPU speed varies). It does
   not consume a second credit. There is no initial Explain scene button.
4. Read **Image description**. Only the saved description is displayed; estimated
   image type and tentative visual assessment are hidden to simplify the panel.
   Existing structured records and model behavior are unchanged. The description
   is stored and reused on later visits, separately from the classifier summary.
5. Classification, Grad-CAM and localization remain separate and unchanged.

The owner-only endpoint is `POST /api/v1/scans/:scanId/scene`. It verifies the
original image hash, prevents duplicate inference, and cannot recreate a scan
deleted during inference. Failures release the lease and can be retried.
No scene-text PDF export or native-mobile UI is included in this change.

### Updating older explanations

Restart the web/backend terminal to load explanation format version 2. No new
model download is needed: the same pinned weights use separate style and description
questions, with a tentative assessment question for photograph-like images only.
Logos, artwork and unclear types explicitly say inconsistencies are not assessed;
the model is not forced to invent an anomaly. This is a prompt/UI change, not a newly trained model.
An already-running old scene service is not silently replaced.

Open an older completed scan; its image observations update automatically. The backend
reuses that scan's stored image, replaces only the explanation after successful
inference, and preserves the old text if inference fails. No extra scan credit is
used. Version 1 saved captions remain readable while updating. Errors show
**Retry image observations** and do not trigger an automatic retry loop. Current
saved explanations do not rerun inference. Leaving the page cancels the browser
request; it does not necessarily cancel an inference already running on the server.
CPU inference now takes longer
because it answers two or three questions; allow up to a few minutes.

## Checks

### Original single-caption implementation (10 October 2026)

The complete pinned download passed its hashes and loaded offline on this PC.
Real inference through the loopback service and backend adapter passed on two
images: an existing validation image (10.23 seconds) and the supplied road-swimmer
image (9.45 seconds). These timings exclude initial model loading.

The road-swimmer observation was: "A person is diving into a road with water up
to their shoulders." This is an actual model response, not a canned explanation.
It is not a verified description: the small model can misread what is water or
road and does not establish how the image was made. These checks demonstrate
working inference, not anomaly-detection accuracy.

The web build and browser regression suite passed. All 44 backend/emulator
tests, 52 localization Python tests and 4 scene Python tests passed during this
implementation. Test accounts and images used by the emulator/browser tests
were fixtures; no real cloud accounts or image uploads were created for tests.

`python -m unittest test_scene.py -v` from this folder checks decoding, abstention
and HTTP access. `npm.cmd test` and `npm.cmd run test:ui` in `firebase-local`
cover persistence, authorization, retry, deletion and rendering with fixtures.
`node tests/scene-smoke.mjs` from `firebase-local` runs the actual downloaded
model and writes `.test-results/scene/real-inference.json`; fixture tests alone
do not demonstrate real model inference or anomaly accuracy.

### Structured explanation update (10 October 2026)

- 45 backend/emulator tests passed, including legacy-caption upgrade, failure
  preservation, authorization, caching, unchanged credits and deletion races.
- All seven scene Python tests passed, including type parsing, abstention,
  skipping forced logo anomalies, fragment rejection and loopback access control.
- Browser regression suite and production web build passed, including a 390px
  explanation panel and the Update explanation flow. Browser text is mocked;
  these are UI checks, not model-quality measurements.
- Offline development checks are recorded in `runs/explanation-v2-review.json`.
  The style question recognized the project logo as a logo/graphic and the two
  photographic-looking examples as photograph-like. This is not an accuracy benchmark.
- The description of the logo mentions a blue shield, mountains and a magnifying
  glass. The separate anomaly question produced irrelevant text for the logo,
  so final code deliberately does not ask that question for non-photographic or
  uncertain types. `runs/explanation-v2-logo-final.json` records the final logo check.
- A bare label from the assessment question is now replaced by an inability-to-assess
  message. This is a fragment filter, **not** a factuality verifier. Longer answers
  may still be inaccurate or merely describe the scene. The road example was not
  reliably explained as an anomaly; no improved anomaly-detection accuracy is claimed.
- The two/three-question development runs took about 50–68 seconds per image on
  this PC, excluding cold model loading. Actual latency varies.

### Automatic result explanation

The web summary uses only the saved verdict, scores, decision policy and Grad-CAM
metadata. It never treats a scene caption as the classifier's reason, changes the
verdict based on scene text, or assumes the largest score always selects the class.
The policy details are expandable. This is a decision summary, not a verified
feature-level account of why the CNN assigned a score. Automatic scene generation
is triggered when viewing a completed result, not by a persistent background worker.

## Visual feature review extension (13 October 2026)

`feature_service.py` preserves `/explain` and adds `/features` on the same offline,
loopback service. It uses the existing pinned model, not a second download. The
locked classifier, Grad-CAM, detector, localizer and legacy scene module remain
unchanged. The extension has its own `visual-features-v1` contract; the existing
AI-lock verification does **not** certify or validate this added module.

The web results page requests five separate checks after the description finishes:
eyes, shape/anatomy, texture, lighting/shadows, and object/scene relationships.
Each check can report a possible concern, no clear concern, or inability to assess.
They are unvalidated observations, not the CNN's causal reasons or edited masks.
Unsupported claims and malformed responses become inability-to-assess results;
the parser is not a factuality verifier. No classifier score is passed to this model.

The owner-only `POST /api/v1/scans/:scanId/features` route binds the review to the
original image hash, caches the result, prevents duplicate work, and checks deletion
and account status again before saving. It does not charge a credit or alter the
classification. Leaving the page cancels the browser request, not necessarily the
inference already running. Failed requests require an explicit retry.

Restart the existing web/backend terminal to load the new service. Do not launch
a second copy on port 5005. Existing scene-only service instances are reported as
needing a restart rather than silently killed.

### Verification and current limitation

- All 57 backend/emulator tests passed, including feature ownership, caching,
  image-hash rejection, duplicate work and deletion races.
- All 35 JavaScript unit tests and all three feature-service Python tests passed.
  An additional adapter test passed for response size, invalid JSON, busy service
  and wrong-image responses.
- The browser regression suite, production build and original AI lock passed.
  Browser findings are synthetic test fixtures, not evidence of model accuracy.
- Real-model probes on the logo and the previously available road-swimmer image
  returned five inability-to-assess results. A traced logo run showed prompt echo
  rather than usable visual assessments. These checks do **not** establish anomaly
  detection. A shorter prompt is tested only in the smoke script and is not promoted
  into the service based on UI/test success.
- The shorter prompt was also checked on the existing training image
  `supervised-localization-v1/assets/train/fake/segm_flux1dev/724.png` (TGIF2,
  CC BY-SA 4.0). All five responses were unusable/inconclusive; inference took
  73.61 seconds excluding loading. `runs/feature-review-candidate-smoke.json`
  stores the raw outputs. This is a development probe, not a held-out evaluation.
- The initial extension was web-only. The 2026-10-19 integration below adds native
  and PDF rendering; it does not establish visual-model accuracy.

### Saved-result presentation integration — 2026-10-19

- Web: the original sits beside **What looks unusual?** on desktop, with the saved
  description and numbered model-reported concerns. Narrow screens stack them.
  The classification explanation and Grad-CAM remain separate; no illustrative
  coordinates or hard-coded example findings were added.
- Android: validates and renders the five saved feature findings, with all-checks
  expansion and a manual no-extra-credit retry for unavailable reviews. Saved
  reviews do not start a second inference. Physical-device layout still needs review.
- PDF: exports validated, image-bound saved findings and model provenance, with
  unknown/missing states. Export does not invoke inference. Layout checks cover
  long observations, invalid records, failed scans, and uncertain classification.
- Tests: production web build, mocked browser regressions, 36 backend unit tests,
  native typecheck/contract/panel tests, and six rendered PDF fixtures passed.
- A direct local `/features` check on the supplied road/swimmer image completed
  successfully but returned **unable_to_assess for all five categories**. Therefore
  scene-anomaly detection and specific visual explanations are not proven ready.
  Successful integration must not be described as successful model validation.
- The separately approved IML-ViT screen is documented in
  `../ai-localization/IML-VIT-SCREEN.md`. It did not justify replacing the detector.

For an offline probe (no scan changes), from the repository root:

```powershell
& '.\ai-localization\.venv-vaas\Scripts\python.exe' '.\ai-scene\review_features_smoke.py' --trace
```

`--image PATH` selects an existing development image. `--candidate-prompt` tests
a shorter prompt without changing the running service. The trace may contain
image-derived descriptions; keep these development records local. Do not use
the sealed test cohort for prompt tuning.
