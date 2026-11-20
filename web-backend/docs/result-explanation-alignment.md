# Result output alignment — 13 October 2026

## Implemented scope

Web, Android and PDF explanations now explain the saved score-based decision for each image. For the current policy, they identify which class met 60%, or report both scores when neither met that cutoff. Older scans retain their saved threshold and uncertainty band. Missing, unsupported or inconsistent metadata receives an explicit fallback, never invented reasoning or a new verdict. Rounding does not change the decision.

Grad-CAM is described as a classification heatmap. Its target class is identified, and its known blue/green/yellow palette describes lower/intermediate/higher relative score contribution. Yellow is not proof of editing; blue is not proof of authenticity. Unknown palettes/targets are not guessed. Uncertain results retain the existing no-single-class-heatmap behavior.

Object boxes and labels identify common objects only. They do not establish AI origin, edited pixels, anatomical faults, or physically impossible relationships. Detection scores are not authenticity scores, and detections do not alter classification.

Image descriptions remain separate observations, not the classifier's reasons. No scene prompt, model, AI weights, threshold, inference pipeline, saved scan, or credit rule was changed. The manuscript DOCX was not edited.

## Remaining scientific limitation

This closes the output-language mismatch, not the research gap of explaining specific visual causes. The current classifier does not record a verified reason such as unnatural eye lighting or skin texture. Do not claim that this change adds visual-defect detection, causal explanations, semantic-anomaly detection, or exact manipulation localization.

## Suggested manuscript wording for the later revision

AuthentiScan presents the saved classification, class scores, and a plain-language explanation of the decision rule applied to those scores. Grad-CAM visualizes regions contributing to a recorded class score; it does not establish exact manipulated regions or identify the particular visual defect responsible for the score. A separate object detector provides common-object labels and bounding boxes as image context, not proof of manipulation or semantic anomalies. Class scores are estimates rather than proof of authenticity.

## Verification

- 33 backend/presentation unit checks passed.
- Browser regressions passed, including the result-specific Uncertain explanation and expandable explanation limits.
- Native TypeScript, 15 current-backend transport cases, and 5 native panel behavior groups passed.
- 34 web/native explanation parity cases passed; the helper copies must remain in sync.
- Web build, Android bundle export, and AI-lock verification passed.
- Synthetic PDF variants cover completed, uncertain, missing, invalid, failed, and long-content records. Text checks and rendered-page review verify the revised explanations and object/heatmap wording.

These checks used synthetic or mocked data, not real scans or credits. Native-device visual acceptance is still required.

## See the changes

Restart the existing backend session, refresh the web page, and reload Expo. Reopen an existing saved scan; no new analysis is required for the decision explanation. Export a new PDF: previously downloaded files do not update automatically. Keep the classifier service unchanged.
