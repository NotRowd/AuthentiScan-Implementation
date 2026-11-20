# Local AI runtime: Loyd classifier v1

Start in PowerShell (keep this terminal open):

```powershell
& 'D:\AuthentiScan - backend\ai-runtime\start-loyd-ai.ps1'
```

The web backend continues using port 5001. Stop any previous AI service on that port first. Start the web/backend separately using `npm.cmd run start:cloud` from `firebase-local`.

This launcher selects Loyd's verified `finetune.keras`, the manuscript-aligned policy
`loyd-v1/policy.manuscript-60.json`, and matching EXIF/white-alpha v2 preprocessing.
Authentic requires an authentic score >= 0.60; AI-generated requires its score >=
0.60; both below 0.60 returns Uncertain. Exact 0.40 authentic selects AI-generated,
and exact 0.60 authentic selects Authentic. Unrounded scores determine the verdict.
The policy records center 0.50 and margin 0.10 for context, but its explicit
`manuscript_min_score_v1` rule uses strict interior uncertainty, not the old inclusive band.
Startup checks the unchanged model checksum and preprocessing contract.
The archived validation-locked 0.32 +/- 0.05 policy is preserved unchanged.
This is manuscript alignment, not new training, probability calibration or a claim
of improved accuracy. Existing saved scans retain their scores, policy and verdict.
Uncertain new scans have no selected Grad-CAM target and no single-class heatmap.

Restart both the classifier and web/backend after this update. A process that was
already running still has the old policy in memory. Health must report
`decision_rule: manuscript_min_score_v1` and `minimum_class_score: 0.6`.

Health must report `loyd-classifier-v1-research` at http://127.0.0.1:5001/health. Run `node ai-runtime/smoke.mjs http://127.0.0.1:5001` from the backend root to check prediction, backend response compatibility and heatmap PNG delivery. This uses a local fixture, not cloud uploads or scan credits.

Manuscript policy verification (10 October 2026): three Python policy tests,
48 backend/emulator tests, and the production web build passed. An isolated real
model smoke test reported policy `sha256:f56f876dbf8234b6`, minimum class score 0.6,
and successful backend contract/Grad-CAM PNG checks. Boundary tests include exact
40%/60%, adjacent floating-point values, and the 51.02% example. These are functional
checks, not an accuracy evaluation. No user scan records were migrated.

Archived held-out test under the OLD decision policy: 82.67% for this candidate
versus 66.33% for the previous pipeline. These figures do not evaluate the new
60% manuscript rule. See `../ai-work/2026-10-04/RESULTS.md` for limitations.
The object detector is unchanged; a classifier upgrade does not add guitar detection.
Cross-preprocessing object/heatmap overlays are disabled. Existing scan results are not recomputed.

## Rollback

Stop the new AI terminal, then run:

```powershell
cd 'D:\AuthentiScan-AI-Foundation\ai-service'
$env:AUTHENTISCAN_MODEL_PATH='D:\AuthentiScan - backend\ai-models\curated-v1-candidate-v1-dev\authentiscan-efficientnet-b0-v3.keras'
$env:AUTHENTISCAN_POLICY_PATH='D:\AuthentiScan - backend\ai-models\curated-v1-candidate-v1-dev\policy.candidate-dev.json'
& '.\.venv\Scripts\python.exe' -m uvicorn service.app:app --host 127.0.0.1 --port 5001
```

Both original weights and the previous service remain unchanged.
