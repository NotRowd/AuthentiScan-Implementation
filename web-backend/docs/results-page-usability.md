# Results page simplification — 13 October 2026

Scope: web scan-details presentation only. No model, prompt, threshold, saved analysis, billing, PDF layout, or native Android changes.

## Default view

- A prominent saved verdict and exactly two score cards (Authentic / AI-generated).
- A short result explanation, with recorded decision rules under “How this result was calculated”.
- Automatic image descriptions remain separate from the classification. Responses shorter than three words show an insufficient-detail message; the unmodified response remains under Description details. This length check does not verify longer captions.
- Original image and Grad-CAM, with a compact color legend. Color mechanics are optional. Unknown palettes/targets do not receive a guessed legend.
- Empty object results show a short message without repeating the image. Available detections retain box selection and supported heatmap comparison.
- Uncertain localization shows its status without another original-image panel. The unverified preview remains opt-in, with validation warnings when opened. Independent localization results are not suppressed by an uncertain classifier result.
- Model metadata and technical settings are collapsed. Export, refresh, scan-another-image, and feedback remain available.

## Verification

Run `npm.cmd run build`, `npm.cmd run verify:ai-lock`, `node --test tests/result-language.test.mjs`, and `npm.cmd run test:ui` from firebase-local.

Browser regression tests use mocked APIs, not user accounts. They cover all verdict states, missing/failed media, object controls, experimental preview visibility, short-caption fallback, one-time scene requests, keyboard-expandable details, and 390px-wide layouts. Screenshots are written to `.test-results/ui-regressions/`; `results-simple-*` are synthetic UI examples, not real image analyses.

## Viewing the change

Refresh the running web page at http://127.0.0.1:5174 (Ctrl+Shift+R if needed). Existing saved scans use the new layout without rescanning. This presentation change does not improve or validate the underlying models; localization remains unvalidated and scene descriptions can be inaccurate.
