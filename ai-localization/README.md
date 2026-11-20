# Manipulation localization: isolated research prototype

19 October update: the approved IML-ViT download and isolated local smoke screen
are complete. The tested configuration is **not approved for deployment**: very
low overlap on both partial-edit samples. See `IML-VIT-SCREEN-2026-10-19.md` for
the bounded scope, exact results, provenance, and repeat command. No production
model or saved scan was changed.

Update: a real, opt-in **experimental** web implementation is now available using
the trained head despite its failed validation, at the user's explicit request.
See `EXPERIMENTAL-IMPLEMENTATION.md` for the startup command and limitations.
This does not approve the model or change the normal-mode defaults. Web/PDF
results retain a failed-validation warning; empty predictions remain uncertain.

Latest outcome (10 October): the smaller, paired-supervision v2 CPU experiment
also failed validation. It returned empty masks on 74/80 edited validation images,
worse than v1's 61/80. V2 was not deployed; the live experimental model and its
warnings are unchanged. All 51 Python tests passed and the 240-image final test
remains unused. See `V2-RESULTS-2026-10-10.md` and
`runs/supervised-v2-paired-2026-10-10/validation-review/index.html`.

Previous outcome (10 October, 00:41 Manila): Kent completed the full mask-supervised
CPU experiment without Loyd. All 20 epochs finished, but the selected head failed
validation (Dice 0.0815 semantic / 0.0445 random, versus a 0.50 minimum in each).
No model was deployed and the fresh test set remains unused. See
`CPU-RESULTS-2026-10-10.md` and `runs/supervised-cpu-2026-10-10/validation-review/index.html`.
The existing 277 MB Loyd package remains intact for reproducibility; simply
rerunning the same experiment on a GPU is not an established quality fix.

Earlier outcome (9 October, 23:16 Manila): the 480-image TGIF2 evaluation is
complete. The tested TRAIL/DINOv2-S configuration/policy produced empty masks
on all 160 edited confirmation images and is **not approved**. See
`TGIF2-REVIEW-2026-10-09.md`. Web/API/PDF integration is implemented, but remains
disabled for real localization predictions. Downloading is finished.

Status (2026-10-09): official TruFor checkpoint installed in an isolated CPU
environment. Two bundled smoke tests, a 60-image OpenSDI pilot and two no-resize
diagnostic runs completed. See PILOT-RESULTS-2026-10-09.md: current configuration
is NOT approved for integration due to weak overlap and false highlights.
NO representative release evaluation and NO validated threshold yet.
The separate localizer service and web/API integration are implemented but
disabled by default pending candidate review; see `INTEGRATION-STATUS-2026-10-09.md`.
VAAS v2-base comparison also completed on all 60 samples: higher partial-edit
overlap, but substantially more false highlights. It is NOT approved either;
see `VAAS-PILOT-RESULTS-2026-10-09.md` for the comparison and next gate.
The existing classifier and Grad-CAM are unchanged. Old saved scans are not
reprocessed; the web displays their missing localization as not assessed.
No paid API or cloud upload is used. The official checkpoint and CPU dependencies
were downloaded for nonprofit research; inference itself is local/offline.

## Run a research inference

From `D:\AuthentiScan - backend` in PowerShell:

```powershell
& '.\ai-localization\.venv\Scripts\python.exe' '.\ai-localization\run_trufor.py' --image 'D:\path\to\upright-rgb-image.png' --output '.\ai-localization\runs\my-new-test' --threshold 0.5
```

Use a NEW output directory and an RGB image no larger than 1 megapixel for this
CPU smoke-test runner. No automatic resizing or alpha conversion is performed.
0.5 is an experimental rendering threshold, not an approved decision policy.
The runner verifies the upstream revision, unmodified source and checkpoint hash,
loads weights with restricted deserialization, and records provenance and timing.
Its /256 input scaling is TruFor-specific; do not substitute classifier processing.
See the smoke-test report for the isolated dependency versions and limitations.

## Evaluation pilot

`prepare_opensdi.py` prepares a deterministic 60-image OpenSDI pilot, with a
200 MB acquisition cap and checksummed provenance. It resumes verified completed
records and respects provider rate limits. Third-party data is git-ignored.
See PILOT-PROTOCOL.md for license, resizing, sampling and evaluation limits.
`evaluate_pilot.py` loads TruFor once, runs all samples, and reports per-image,
per-generator and group metrics without tuning the fixed 0.5 threshold.
This is an exploratory reduced-resolution pilot, not final test certification.

## Candidate research

Alternative screening and pilot results are recorded in
`CANDIDATE-SCREENING-2026-10-09.md` and
`TRAIL-PILOT-RESULTS-2026-10-09.md`. TRAIL was acquired at a pinned revision and
tested with frozen DINOv2-S/14. Its source is MIT-licensed and its DINOv2-S
weights are Apache-2.0. The 60-image OpenSDI pilot showed patch-ranking signal
for partial edits, but its oracle Dice is weak and no threshold was calibrated.
This remains research-only; it is not approved for production or evidence that
TRAIL can localize full-image generation, exact boundaries, or impossible scenes.
The paper's headline result uses a much larger DINOv3 7B model and must not be
attributed to our small configuration.

## Source-disjoint TGIF2 experiment

A bounded Flux.1-dev benchmark handoff is prepared in
`TGIF2-FLUX1DEV-HANDOFF-2026-10-09.md`. Its checksum-verified archive set is
3,731,300,672 bytes (under the previously approved 8 GB limit), covering 80
development and 80 source-disjoint confirmation images in both semantic and
random-mask edit conditions plus aligned authentic controls. Acquisition and
checksum verification completed on Kent's PC, and 480 images were prepared.
`continue_tgif2_benchmark.py --download` owns the resumed download and then
automatically proceeds through preparation, inference and evaluation. The first
tool-session jobs stopped after their chat run; they were replaced with a hidden
Windows background process, verified alive after its launcher exited. Check
`runs/tgif2-auto-2026-10-09-v3/status.json` and `infer.log` for its stage and
progress. Do not start a second download against the same partial files. The archive
download and inference are complete. Held-out results rejected this candidate;
no production release is claimed. This is threshold calibration and held-out evaluation, not neural
network training. Optional web/API support is present, but localization
inference is not enabled and no candidate is approved for release.

The evaluation summary now derives predicted highlights from the actual saved
maps, not the upstream CSV's ground-truth counts, and joins missing sample roles
from the dataset manifest. A regression test covers a fully highlighted authentic
control: its false-highlight rate must be 100%, not 0%.

The candidate is still research-only. Even if the narrow Flux.1-dev experiment
passes, it does not establish localization for fully generated images, other
generators, or physically implausible scenes.

DetectiveSAM v2 remains an alternative, but its model/code license is missing
and its public inference loader uses unrestricted pickle deserialization. Do
not download/run that checkpoint or integrate it until those gates are resolved;
details and evaluation plan are in `CANDIDATE-SCREENING-2026-10-09.md`.
DeCLIP remains another candidate whose checkpoint terms need resolution. A
licensing/inference question is drafted for its first author in
`DECLIP-AUTHOR-QUESTION.md`; GitHub Issues are disabled, and no email was sent.
PromptForge-350k / ICL-Net is a closer research match for prompt-based local edits,
but the paper says its code/data will be released and this screen did not find an
official runnable release. See the candidate report.
MaskCLIP's follow-up permission and hardware/code check is recorded in
`MASKCLIP-PREFLIGHT-2026-10-09.md`. Permission remains unresolved; the author
question is posted at https://github.com/iamwangyabin/OpenSDI/issues/18 and tracked
in `MASKCLIP-AUTHOR-QUESTION.md`. Do not repeat the same search or start downloading
until new permission/release evidence is available.
VAAS v2-base is an isolated general-forensics comparison, not an approved
diffusion-edit detector. Its setup/evaluation never changes the production app.

```powershell
& '.\ai-localization\.venv-vaas\Scripts\python.exe' '.\ai-localization\prepare_vaas.py'
& '.\ai-localization\.venv-vaas\Scripts\python.exe' '.\ai-localization\run_vaas.py'
& '.\ai-localization\.venv-vaas\Scripts\python.exe' '.\ai-localization\evaluate_vaas.py'
```

Run from the backend root. Only preparation requires network; inference is
offline. Evaluation refuses to overwrite an existing result directory. The
VAAS environment references `.venv` for CPU PyTorch, so retain both environments.
Do not run this command as part of the production launcher. See the candidate
report for pins, licensing restrictions, map alignment and pilot limitations.

TruFor predicts manipulation and reliability maps. It is NOT a scene-reasoning
model and its output must not be called proof of AI generation. Suitability for
modern generative edits and fully generated images remains unverified here.

- Official source: https://github.com/grip-unina/TruFor
- Inference: https://github.com/grip-unina/TruFor/tree/main/TruFor_train_test
- Official NPZ keys inspected: map, imgsize, optional conf and score.
- Upstream restricts use to informational/nonprofit purposes; review the complete
  license and checkpoint terms before acquisition, redistribution or deployment.
- Do not install upstream dependencies into the working classifier environment.

## First implementation

`localization.py` imports already-computed official NPZ predictions using
`allow_pickle=False`, validates dimensions/ranges, renders a fixed-scale overlay,
and optionally compares it with known binary masks. It does not infer a mask.
Use the SAME upright RGB input for upstream inference and this tool. Matching
dimensions cannot detect accidentally pairing maps with the wrong image.
An output SHA-256 records the supplied input, not proof of upstream provenance.
NPZ files must be trusted local research files, not public upload inputs.

Example after obtaining a legitimate model prediction:

```powershell
& 'D:\AuthentiScan-AI-Foundation\ai-service\.venv\Scripts\python.exe' .\localization.py --image .\example.png --prediction .\example.png.npz --threshold 0.5 --model-id 'checkpoint-sha256-here' --truth .\mask.png --output .\experiment-001
```

0.5 above is an EXPERIMENTAL example, not a validated operating threshold.
Never select the threshold on the held-out test set. Empty truth/prediction
masks have null IoU/Dice; authentic-image false-positive rate is reported separately.
Reliability is preserved independently; it is not treated as calibrated confidence.

Run tests from this directory:

```powershell
& 'D:\AuthentiScan-AI-Foundation\ai-service\.venv\Scripts\python.exe' -m unittest -v
```

## Remaining work before real integration

1. Review candidate licenses, weights, dependencies and actual CPU/GPU memory.
2. Acquire a checkpoint in an isolated environment, pin provenance/checksum.
3. Smoke-test real inference. Never synthesize a mask from classifier scores,
   object boxes or Grad-CAM. A failure must remain unavailable, not authentic.
4. Create licensed held-out examples: authentic, partial generative edits with
   masks, conventional edits, fully generated and compressed/resized examples.
   Keep source-image families together across splits to prevent leakage.
5. Measure IoU/Dice on edited examples, false positives on authentic images,
   latency, memory, and abstention behavior separately by manipulation type.
6. Validate uncertainty thresholds; do not imply full-image localization from
   an image-level AI score. Do not label ordinary edits necessarily AI-generated.
7. Integrate a separate localization API/result field; separate protected assets
   from Grad-CAM. Preserve authorization, owner-only access and hard deletion.
8. Keep classification-based Grad-CAM (user reconfirmed 2026-10-08). Add
   localization as a separate panel only when validated; retain historical
   provenance. Add unavailable/uncertain states, PDF/history support and tests.
9. Scene anomaly explanations are a separate future capability, not supplied by
   TruFor or by instance segmentation. Update manuscript after scope approval.
