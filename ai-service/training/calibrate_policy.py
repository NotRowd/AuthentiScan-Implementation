"""Measure threshold and uncertainty trade-offs on the validation split.

This does not retrain a model and deliberately does not read the protected
test split. It produces evidence for choosing the app's binary decision
threshold and an UNCERTAIN band; it does not silently invent that policy.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import tensorflow as tf


SERVICE_DIRECTORY = Path(__file__).resolve().parents[1]
if str(SERVICE_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIRECTORY))

from training.train_efficientnet import CLASS_INDICES, compile_model, load_split
from service.preprocessing import PREPROCESSING_VERSION


def collect_scores(model: tf.keras.Model, dataset) -> tuple[np.ndarray, np.ndarray]:
    labels: list[np.ndarray] = []
    scores: list[np.ndarray] = []
    for images, batch_labels in dataset:
        labels.append(batch_labels.numpy().reshape(-1).astype(int))
        scores.append(model.predict(images, verbose=0).reshape(-1))
    return np.concatenate(labels), np.concatenate(scores)


def binary_metrics(labels: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, float | int]:
    predicted = (scores >= threshold).astype(int)
    true_fake = int(np.sum((labels == 0) & (predicted == 0)))
    false_authentic = int(np.sum((labels == 0) & (predicted == 1)))
    false_ai_generated = int(np.sum((labels == 1) & (predicted == 0)))
    true_authentic = int(np.sum((labels == 1) & (predicted == 1)))
    fake_recall = true_fake / max(1, true_fake + false_authentic)
    authentic_recall = true_authentic / max(1, true_authentic + false_ai_generated)
    return {
        "threshold": round(float(threshold), 4),
        "balanced_accuracy": (fake_recall + authentic_recall) / 2,
        "accuracy": float(np.mean(predicted == labels)),
        "true_fake": true_fake,
        "false_authentic": false_authentic,
        "false_ai_generated": false_ai_generated,
        "true_authentic": true_authentic,
    }


def uncertainty_options(
    labels: np.ndarray, scores: np.ndarray, threshold: float
) -> list[dict[str, float | int | None]]:
    options: list[dict[str, float | int | None]] = []
    for margin in (0.0, 0.025, 0.05, 0.075, 0.10):
        decided = np.abs(scores - threshold) > margin
        decided_count = int(np.sum(decided))
        options.append(
            {
                "margin": margin,
                "uncertain_count": int(len(labels) - decided_count),
                "uncertain_rate": float(1 - (decided_count / len(labels))),
                "decided_accuracy": float(np.mean((scores[decided] >= threshold) == labels[decided]))
                if decided_count
                else None,
            }
        )
    return options


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not args.model.is_file():
        raise SystemExit(f"Model file does not exist: {args.model}")
    if args.report.exists():
        raise SystemExit(f"Report already exists: {args.report}. Choose a new report filename.")

    validation = load_split(args.dataset / "valid", args.batch_size, False, args.seed)
    model = tf.keras.models.load_model(args.model, compile=False)
    compile_model(model, learning_rate=1e-5)
    labels, scores = collect_scores(model, validation)

    candidates = [binary_metrics(labels, scores, threshold / 100) for threshold in range(5, 96)]
    best = max(candidates, key=lambda item: (item["balanced_accuracy"], -abs(item["threshold"] - 0.5)))
    report = {
        "created_at": datetime.now(UTC).isoformat(),
        "model_file": args.model.name,
        "calibration_split": "valid",
        "preprocessing_version": PREPROCESSING_VERSION,
        "class_mapping": CLASS_INDICES,
        "positive_class": "authentic",
        "selection_rule": "maximize balanced accuracy; ties choose the threshold nearest 0.50",
        "recommended_threshold": best,
        "uncertainty_options": uncertainty_options(labels, scores, float(best["threshold"])),
        "policy_status": "choose an uncertainty margin after reviewing coverage and decided accuracy",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("Calibration evidence complete.")
    print(json.dumps(report, indent=2))
    print(f"Saved report: {args.report}")


if __name__ == "__main__":
    main()
