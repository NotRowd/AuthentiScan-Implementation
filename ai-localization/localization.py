"""Offline localization-map validation and evaluation. Not an inference model."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def unit_map(value, shape=None):
    array = np.asarray(value, dtype=np.float32)
    if array.ndim != 2 or not array.size:
        raise ValueError("Expected a nonempty H x W map.")
    if shape is not None and array.shape != tuple(shape):
        raise ValueError("Map/image dimensions differ; do not silently resize forensic maps.")
    if not np.isfinite(array).all() or (array < 0).any() or (array > 1).any():
        raise ValueError("Map values must be finite and within [0, 1].")
    return array


def threshold_mask(scores, threshold):
    if not np.isfinite(threshold) or not 0 < threshold < 1:
        raise ValueError("Explicit experimental threshold must be between 0 and 1.")
    return unit_map(scores) >= threshold


def pixel_metrics(scores, truth, threshold):
    predicted = threshold_mask(scores, threshold)
    truth = np.asarray(truth)
    if truth.shape != predicted.shape or not np.isin(truth, [0, 1]).all():
        raise ValueError("Ground truth must be an aligned binary 0/1 mask.")
    truth = truth.astype(bool)
    tp = int((predicted & truth).sum())
    fp = int((predicted & ~truth).sum())
    fn = int((~predicted & truth).sum())
    tn = int((~predicted & ~truth).sum())
    return {
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "iou": tp / (tp + fp + fn) if tp + fp + fn else None,
        "dice": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
        "false_positive_pixel_rate": fp / (fp + tn) if fp + tn else None,
        "flagged_fraction": float(predicted.mean()),
    }


def overlay(image, scores, threshold):
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    scores = unit_map(scores, rgb.shape[:2])
    selected = threshold_mask(scores, threshold)
    # Fixed scale: never normalize each image to manufacture a bright region.
    low = np.array([255, 195, 70], dtype=np.float32)
    high = np.array([200, 0, 90], dtype=np.float32)
    colors = low + scores[..., None] * (high - low)
    alpha = (selected * scores * 0.55)[..., None]
    return Image.fromarray(np.rint(rgb * (1 - alpha) + colors * alpha).astype(np.uint8))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", type=Path, required=True,
                        help="Exact upright RGB image supplied to the upstream model")
    parser.add_argument("--prediction", type=Path, required=True,
                        help="Official TruFor NPZ containing map, imgsize, optionally conf")
    parser.add_argument("--threshold", type=float, required=True,
                        help="Experimental only; lock using validation data before test evaluation")
    parser.add_argument("--model-id", required=True, help="Record checkpoint version/hash")
    parser.add_argument("--truth", type=Path, help="Aligned PNG mask: 0 untouched, 255 edited")
    parser.add_argument("--output", type=Path, required=True, help="New output directory")
    args = parser.parse_args()
    with Image.open(args.image) as source:
        if source.getexif().get(274, 1) != 1:
            raise ValueError("Use an upright, EXIF-normalized model input before inference.")
        if source.mode != "RGB":
            raise ValueError("Use the exact RGB image supplied to the model.")
        image = source.copy()
    shape = (image.height, image.width)
    with np.load(args.prediction, allow_pickle=False) as prediction:
        scores = unit_map(prediction["map"], shape)
        if tuple(prediction["imgsize"].tolist()) != shape:
            raise ValueError("Upstream image-size metadata does not match input.")
        reliability = unit_map(prediction["conf"], shape) if "conf" in prediction else None
    mask = threshold_mask(scores, args.threshold)
    report = {
        "status": "research_only", "deployment_ready": False,
        "method": "manipulation_localization", "model_id": args.model_id,
        "image_sha256": hashlib.sha256(args.image.read_bytes()).hexdigest(),
        "prediction_sha256": hashlib.sha256(args.prediction.read_bytes()).hexdigest(),
        "shape": list(shape), "experimental_threshold": args.threshold,
        "flagged_fraction": float(mask.mean()),
        "reliability_map_available": reliability is not None,
        "interpretation": "Candidate manipulation evidence, not proof of AI generation. "
                          "No calibrated localization decision is available.",
        "limitations": ["Threshold not certified", "Unmarked pixels are not guaranteed authentic",
                        "Matching dimensions do not verify matching image content",
                        "Cannot identify the editing tool or explain scene anomalies"],
    }
    if args.truth:
        with Image.open(args.truth) as source:
            truth = np.asarray(source.convert("L"))
        if not np.isin(truth, [0, 255]).all():
            raise ValueError("Ground truth PNG must contain only 0 and 255.")
        report["metrics"] = pixel_metrics(scores, truth // 255, args.threshold)
    preview = overlay(image, scores, args.threshold)
    args.output.mkdir(parents=True, exist_ok=False)
    preview.save(args.output / "research-overlay.png")
    Image.fromarray(mask.astype(np.uint8) * 255).save(args.output / "research-mask.png")
    if reliability is not None:
        Image.fromarray(np.rint(reliability * 255).astype(np.uint8)).save(args.output / "reliability.png")
    (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("Research outputs saved. This does not establish model accuracy or deployment readiness.")


if __name__ == "__main__":
    main()
