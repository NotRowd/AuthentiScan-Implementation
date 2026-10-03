"""Evaluate an exported AuthentiScan EfficientNet-B0 candidate without retraining."""

from __future__ import annotations

import argparse
import json
import sys
import hashlib
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import tensorflow as tf

# When executed as `python .\\training\\evaluate_efficientnet.py`, Python adds
# the training folder, not the AI-service folder, to its import path.
SERVICE_DIRECTORY = Path(__file__).resolve().parents[1]
if str(SERVICE_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIRECTORY))

from service.preprocessing import PREPROCESSING_VERSION
from service.policy import load_policy
from training.evaluation_core import prediction_records, summarize, binary_metrics
CLASS_INDICES = {"fake": 0, "real": 1}


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}




def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--policy", type=Path, help="Optional locked policy; never optimized on test images.")
    args = parser.parse_args()

    if not args.model.is_file():
        raise SystemExit(f"Model file does not exist: {args.model}")
    if args.report.exists():
        raise SystemExit(f"Report already exists: {args.report}. Choose a new report filename.")

    model = tf.keras.models.load_model(args.model, compile=False)
    policy = load_policy(args.policy) if args.policy else None
    records = prediction_records(model, args.dataset / "test", args.batch_size, policy)
    summary = summarize(records)
    metrics = binary_metrics(records)
    m = summary["matrix"]
    matrix = {"true_fake": m["ai_generated"]["ai_generated"], "false_authentic": m["ai_generated"]["authentic"],
              "false_ai_generated": m["authentic"]["ai_generated"], "true_authentic": m["authentic"]["authentic"]}
    report = {
        "created_at": datetime.now(UTC).isoformat(),
        "model_file": args.model.name,
        "class_mapping": CLASS_INDICES,
        "preprocessing_version": PREPROCESSING_VERSION,
        "binary_threshold": 0.5,
        "model_sha256": hashlib.sha256(args.model.read_bytes()).hexdigest(),
        "binary_summary": summary,
        "policy": vars(policy) if policy else None,
        "policy_summary": summarize(records, "policy_verdict") if policy else None,
        "test_metrics": metrics,
        "test_confusion_matrix": matrix,
        "test_predictions": records,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("Candidate evaluation complete.")
    print(json.dumps({"test_metrics": metrics, "policy_summary": report["policy_summary"]}, indent=2))
    print(f"Saved report: {args.report}")


if __name__ == "__main__":
    main()
