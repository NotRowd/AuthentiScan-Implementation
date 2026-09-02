# AuthentiScan model-training handoff

The project model is fixed by the manuscript: **EfficientNet-B0** binary image
classification with **Grad-CAM** explanations. Training may improve the data and
weights, but must preserve the API contract below.

## Dataset contract

```text
dataset/
  train/fake/   train/real/
  valid/fake/   valid/real/
  test/fake/    test/real/
```

Keep folder names exactly `fake` and `real`. TensorFlow's directory loader
sorts them alphabetically, so the required mapping is `fake = 0`, `real = 1`.
Images or near-duplicates must not cross between splits. Do not use the
repository's ignored `calibration/` images for training.

## Required exported model contract

- Architecture: `EfficientNetB0`
- Input: `224 x 224` RGB
- Output: one sigmoid value; the positive output represents `real`
- Grad-CAM layers: record the base model, last convolutional, pooling, dropout,
  and output layer names.
- Export format: a `.keras` file.

## Handoff package

Give the integration owner the following, without committing datasets to Git:

1. The new `.keras` model, named with a new version (for example `..._v3.keras`).
2. The final notebook or training script and its dependency versions.
3. Input size, preprocessing, `fake = 0` / `real = 1`, and Grad-CAM layer names.
4. Test-set size, accuracy, precision, recall, F1 score, and confusion matrix.
5. A completed copy of `model/model-metadata.json` updated for the new model.

The integration owner validates the model through the AI API, Grad-CAM,
backend, database, and web UI before replacing an earlier model.
