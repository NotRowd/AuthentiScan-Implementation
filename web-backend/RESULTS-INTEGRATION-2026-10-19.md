# Results integration — 19 October 2026

## Implemented

- Web: the saved classification explanation remains with the scores. The original image is next to a separate **What looks unusual?** panel. Real saved feature concerns are numbered with their category and observation; unknown/no-concern states remain explicit. Grad-CAM stays a separate section. No invented image coordinates or mockup findings are displayed.
- Native app (`D:\AuthentiScan-Mobile`): saved five-feature reviews are mapped, validated, and shown in the result screen. Missing reviews have an explicit free retry. Completed cached reviews do not start another inference request. Unmount/session guards prevent late responses from replacing another session's review.
- PDF: validated, image-bound saved feature reviews are exported, including all five statuses and the model provenance. Missing/invalid/failed records do not acquire findings. Exporting does not call inference. Long descriptions and feature observations paginate.
- Edited-area wording is aligned across web, mobile and PDF. Failed-validation warnings remain visible; no candidate was promoted or relabeled as validated.

The PDF skill's render-and-inspect workflow was used to check page layout in addition to text/margin assertions. Test screenshots and PDF fixtures use synthetic, explicitly labeled data, not actual scan predictions.

## Real model checks and remaining work

The approved IML-ViT download and isolated evaluation finished. See `../ai-localization/IML-VIT-SCREEN-2026-10-19.md`. The screened configuration has inadequate partial-edit overlap and was **not deployed**. This was a six-image labeled smoke screen, not a general accuracy claim.

The user's road/swimmer JPEG was also sent directly to the existing local visual-review service, without Firebase writes, cloud upload, or scan credits. Input SHA-256: `a93b1216a5e91d035d148c12eaa0f452365773d3aaeeac78b64c0a106468d55b`. Model `qwen3-vl-2b-q4km-f16-review-v1`, revision `52d6c8ffea26cc873ac5ad116f8631268d7eb503`, returned `unable_to_assess` for eyes, shape, texture, lighting, and scene. The result was structurally valid, but it did **not** reproduce the specific explanation illustrated in the design example.

Therefore the presentation and saved-output integration are implemented; reliable specific visual explanations, scene-anomaly assessment, and manipulation localization are **not certified complete**. No claim is made that interface changes improve AI accuracy. No manuscript, payment settings, classifier cutoff, or saved scan was changed.

## Verification

- Web production build passed.
- All 36 backend unit tests passed with required local loopback/temp-file permissions. The sandbox-only first run was unable to exercise mock servers and filesystem operations; tests were rerun, not weakened.
- Full mocked browser regression suite passed, including saved reviews, retry/error states, narrow layouts, and unchanged verdicts/credits.
- Native TypeScript check and current-AI tests passed (17 contract cases, component behavior tests, feedback and 34 language-parity cases). Physical Android rendering still needs a device check.
- Six PDF variants passed text, page numbering, invalid-data exclusion, full-content and margin checks; rendered changed pages were visually inspected. The standard illustrative report is four pages; the long-content stress fixture is seven.

Refresh the web app to view the layout. Restart the backend through its existing launcher to load PDF server changes; do not start a second model process. Reload the native development app to view the new review panel. New scans use the existing upload-time preparation flow; old missing results still need an explicit retry where offered.
