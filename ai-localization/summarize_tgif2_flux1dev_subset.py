"""Summarize threshold-locked TGIF2 Flux.1-dev localization results by split."""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np


METRICS = ("auroc", "auprc", "dice", "iou")


def verified_prediction_rows(evaluation: Path, manifest: Path, data_root: Path,
                             run_dir: Path) -> tuple[list[dict], float]:
    sys.path.insert(0, str(Path(__file__).parent / "vendor/trail-image-edit-localization/src"))
    from trail.core import median3, patch_labels
    from trail.data import load_mask, read_manifest, resolve_relative, sha256_file
    from trail.metrics import average_precision, dice, iou, rank_auc

    summary = json.loads((evaluation / "summary.json").read_text())
    if summary.get("threshold_source") != "fit on splits dev":
        raise ValueError("Threshold must be fitted exclusively on dev")
    threshold = float(summary["threshold"])
    if not math.isfinite(threshold):
        raise ValueError("Nonfinite operating threshold")
    manifest_rows = read_manifest(manifest)
    by_id = {row["sample_id"]: row for row in manifest_rows}
    if len(by_id) != len(manifest_rows):
        raise ValueError("Duplicate manifest samples")
    splits = {split: {row["source_id"] for row in manifest_rows if row["split"] == split}
              for split in ("dev", "test")}
    if not all(splits.values()) or splits["dev"] & splits["test"]:
        raise ValueError("Missing or overlapping development/test source groups")
    run = json.loads((run_dir / "run.json").read_text())
    if run.get("manifest_sha256") != sha256_file(manifest) or not run.get("mask_blind_inference"):
        raise ValueError("Inference manifest/provenance mismatch")
    records = {record["sample_id"]: record for record in run["records"]}
    if len(records) != len(run["records"]) or set(records) != set(by_id):
        raise ValueError("Inference must cover every manifest sample exactly once")
    with (evaluation / "per_image.csv").open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != len(by_id) or {row["sample_id"] for row in rows} != set(by_id):
        raise ValueError("Evaluation sample set differs from inference/manifest")
    layers = [int(value) for value in run["model"]["layers"]]
    layer_index = layers.index(int(summary["layer"]))
    for row in rows:
        metadata = by_id[row["sample_id"]]
        if any(row[field] != metadata[field] for field in ("source_id", "split")):
            raise ValueError("Evaluation source/split differs from manifest")
        record = records[row["sample_id"]]
        artifact = resolve_relative(run_dir, record["file"])
        if sha256_file(artifact) != record["sha256"]:
            raise ValueError("Prediction artifact checksum mismatch")
        with np.load(artifact, allow_pickle=False) as payload:
            score_map = np.asarray(payload["scores"][layer_index], dtype=np.float32)
        if summary.get("median3"):
            score_map = median3(score_map)
        if not np.isfinite(score_map).all():
            raise ValueError("Nonfinite prediction map")
        truth = load_mask(resolve_relative(data_root, metadata["mask"]))
        labels, valid = patch_labels(truth, score_map.shape)
        labels, scores = labels[valid], score_map[valid]
        if not len(scores):
            raise ValueError("No evaluable patches")
        prediction = scores >= threshold
        role = metadata["image_role"]
        if role not in {"aligned_original", "edited"}:
            raise ValueError("Unknown sample role")
        if role == "aligned_original" and labels.any():
            raise ValueError("Authentic control has edited truth labels")
        row.update(image_role=role, condition=metadata["condition"],
                   auroc=rank_auc(labels, scores), auprc=average_precision(labels, scores),
                   dice=dice(labels, scores, threshold), iou=iou(labels, scores, threshold),
                   predicted_positive_patches=int(prediction.sum()),
                   evaluated_patches=int(len(scores)),
                   false_positive_patches=int(np.count_nonzero(prediction & ~labels)))
    return rows, threshold


def as_finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def mean_finite(values: list[Any]) -> float | None:
    numbers = [number for value in values if (number := as_finite(value)) is not None]
    return sum(numbers) / len(numbers) if numbers else None


def summarize_rows(rows: list[dict[str, str]]) -> dict[str, Any]:
    groups: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        groups[(row["split"], row.get("image_role", "unknown"), row.get("condition", "unknown"))].append(row)

    summaries: list[dict[str, Any]] = []
    for (split, image_role, condition), group in sorted(groups.items()):
        summary: dict[str, Any] = {
            "split": split,
            "image_role": image_role,
            "condition": condition,
            "n_images": len(group),
        }
        for metric in METRICS:
            summary[f"{metric}_image_macro"] = (
                None if image_role == "aligned_original" else
                mean_finite([row.get(metric) for row in group]))
            per_source: dict[str, list[Any]] = defaultdict(list)
            for row in group:
                per_source[row["source_id"]].append(row.get(metric))
            source_means = [mean_finite(values) for values in per_source.values()]
            summary[f"{metric}_source_macro"] = (
                None if image_role == "aligned_original" else mean_finite(source_means))

        if image_role == "aligned_original":
            false_highlight_fractions = []
            images_with_false_highlight = 0
            for row in group:
                highlighted = int(row["predicted_positive_patches"])
                background = int(row["evaluated_patches"])
                if background <= 0:
                    raise ValueError("No evaluated patches in authentic control")
                false_highlight_fractions.append(highlighted / background)
                images_with_false_highlight += int(highlighted > 0)
            summary["false_highlight_patch_fraction_image_macro"] = mean_finite(
                false_highlight_fractions
            )
            summary["images_with_any_false_highlight"] = images_with_false_highlight
        summaries.append(summary)

    by_split = defaultdict(list)
    for row in summaries:
        by_split[row["split"]].append(row)
    return {
        "status": "research_evaluation_not_release_certification",
        "threshold_protocol": "one global threshold fit on development rows by upstream evaluator; unchanged for test rows",
        "test_threshold_retuning": False,
        "metrics": "Patch AUROC/AUPRC and thresholded Dice/IoU recomputed from checksummed maps; per-image oracle metrics intentionally omitted.",
        "groups": summaries,
        "split_counts": {
            split: sum(group["n_images"] for group in groups_for_split)
            for split, groups_for_split in sorted(by_split.items())
        },
        "limitations": [
            "Only FLUX.1-dev supplied semantic and random-mask splices are represented.",
            "Does not validate fully generated images, other generators, ordinary edits, scene anomalies, or production latency.",
            "Maps are patch-level research scores, not pixel-exact manipulation probabilities.",
            "Upstream patch rule excludes boundary cells with greater than zero but less than 50% edited coverage.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evaluation", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    args = parser.parse_args()
    evaluation = args.evaluation.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if output.exists():
        raise FileExistsError(f"refusing to overwrite existing summary: {output}")
    rows, threshold = verified_prediction_rows(evaluation, args.manifest.resolve(),
        args.data_root.resolve(), args.run_dir.resolve())
    result = summarize_rows(rows)
    result["threshold"] = threshold
    run = json.loads((args.run_dir.resolve() / "run.json").read_text())
    result["model"] = run["model"]
    result["configuration"] = run["configuration"]
    result["manifest_sha256"] = run["manifest_sha256"]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")
    # The automatic job uses this layout. Standalone summaries remain supported.
    if args.run_dir.resolve().name == "inference" and output.parent == args.run_dir.resolve().parent:
        from review_tgif2 import create_review
        create_review(output.parent)
    print(json.dumps({"split_counts": result["split_counts"], "threshold": result["threshold"]}, indent=2))


if __name__ == "__main__":
    main()
