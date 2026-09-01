"""Evaluate the trained model on independently labelled image folders.

The training notebook proved the model's binary mapping is fake=0 and real=1.
This tool reports how accurately the saved model classifies a held-out set and
how often the configured uncertainty margin is used.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean

from calibrate_label_mapping import image_files
from model_service import load_authentiscan_model, preprocess_image


def verdict_from_authentic_score(score: float, uncertainty_margin: float) -> str:
    if abs(score - 0.5) <= uncertainty_margin:
        return "uncertain"
    return "authentic" if score > 0.5 else "ai_generated"


def score_directory(model, directory: Path, expected: str, uncertainty_margin: float) -> list[dict]:
    records: list[dict] = []
    for image_path in image_files(directory):
        model_input, _ = preprocess_image(image_path.read_bytes())
        authentic_score = float(model.predict(model_input, verbose=0)[0][0])
        records.append(
            {
                "file_name": image_path.name,
                "expected": expected,
                "predicted": verdict_from_authentic_score(authentic_score, uncertainty_margin),
                "authentic_score": authentic_score,
                "ai_generated_score": 1.0 - authentic_score,
            }
        )
    return records


def evaluate_records(records: list[dict]) -> dict:
    if not records:
        raise ValueError("At least one labelled image is required.")

    correct = sum(record["expected"] == record["predicted"] for record in records)
    uncertain = sum(record["predicted"] == "uncertain" for record in records)
    decided = len(records) - uncertain
    decisive_correct = sum(
        record["expected"] == record["predicted"]
        for record in records
        if record["predicted"] != "uncertain"
    )

    authentic_as_ai = sum(
        record["expected"] == "authentic" and record["predicted"] == "ai_generated"
        for record in records
    )
    ai_as_authentic = sum(
        record["expected"] == "ai_generated" and record["predicted"] == "authentic"
        for record in records
    )

    return {
        "total_images": len(records),
        "correct_predictions": correct,
        "uncertain_predictions": uncertain,
        "coverage": decided / len(records),
        "overall_accuracy": correct / len(records),
        "decisive_accuracy": decisive_correct / decided if decided else None,
        "false_ai_generated": authentic_as_ai,
        "missed_ai_generated": ai_as_authentic,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--authentic-dir", type=Path, required=True)
    parser.add_argument("--ai-generated-dir", type=Path, required=True)
    parser.add_argument("--uncertainty-margin", type=float, default=0.05)
    parser.add_argument("--report", type=Path, help="Optional JSON report output path.")
    args = parser.parse_args()

    if not 0 <= args.uncertainty_margin < 0.5:
        raise SystemExit("--uncertainty-margin must be from 0.0 up to (but not including) 0.5.")
    for directory in (args.authentic_dir, args.ai_generated_dir):
        if not directory.is_dir():
            raise SystemExit(f"Directory does not exist: {directory}")

    model = load_authentiscan_model()
    authentic_records = score_directory(model, args.authentic_dir, "authentic", args.uncertainty_margin)
    ai_generated_records = score_directory(
        model, args.ai_generated_dir, "ai_generated", args.uncertainty_margin
    )
    if not authentic_records or not ai_generated_records:
        raise SystemExit("Each directory needs at least one JPG, JPEG, PNG, or WebP image.")
    records = authentic_records + ai_generated_records

    summary = evaluate_records(records)
    report = {
        "model_version": "authentiscan-efficientnet-b0-v2",
        "label_mapping": {"fake": 0, "real": 1},
        "uncertainty_margin": args.uncertainty_margin,
        "summary": summary,
        "mean_authentic_score_for_known_authentic_images": mean(
            record["authentic_score"] for record in records if record["expected"] == "authentic"
        ),
        "mean_authentic_score_for_known_ai_generated_images": mean(
            record["authentic_score"] for record in records if record["expected"] == "ai_generated"
        ),
        "records": records,
    }

    rendered = json.dumps(report, indent=2)
    print(rendered)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(rendered, encoding="utf-8")
        print(f"\nSaved evaluation report: {args.report}")


if __name__ == "__main__":
    main()
