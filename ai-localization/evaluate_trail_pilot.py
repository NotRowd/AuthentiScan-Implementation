"""Threshold-free, exploratory analysis of a TRAIL pilot run.

No threshold is tuned or applied. Binary localization ranking is summarized
only for partial-edit samples, which contain both edited and untouched patches.
Fully generated/authentic masks are single-class controls and are summarized via
raw activation distributions rather than misleading per-image AUROC.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--layer", type=int, default=11)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    from trail.core import median3, patch_labels
    from trail.data import load_mask, read_manifest, resolve_relative, sha256_file
    from trail.metrics import average_precision, oracle_dice, rank_auc

    manifest_path = args.manifest.resolve()
    data_root = args.data_root.resolve()
    run_dir = args.run_dir.resolve()
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise FileExistsError(f"refusing to overwrite non-empty output: {output}")
    manifest = read_manifest(manifest_path)
    by_id = {row["sample_id"]: row for row in manifest}
    run = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    if run.get("manifest_sha256") != sha256_file(manifest_path):
        raise ValueError("inference run used a different manifest")
    layers = [int(value) for value in run["model"]["layers"]]
    if args.layer not in layers:
        raise ValueError(f"layer {args.layer} absent from inference run")
    layer_index = layers.index(args.layer)
    records = run.get("records", [])
    if len(records) != len(manifest):
        raise ValueError(f"expected {len(manifest)} inference records, found {len(records)}")

    per_image: list[dict[str, object]] = []
    for record in records:
        sample_id = str(record["sample_id"])
        row = by_id[sample_id]
        prediction_path = resolve_relative(run_dir, str(record["file"]))
        if sha256_file(prediction_path) != record["sha256"]:
            raise ValueError(f"prediction checksum failed: {prediction_path}")
        with np.load(prediction_path, allow_pickle=False) as stored:
            score_map = median3(np.asarray(stored["scores"][layer_index], dtype=np.float32))
        truth = load_mask(resolve_relative(data_root, row["mask"]))
        labels, valid = patch_labels(truth, score_map.shape)
        scores = score_map[valid]
        labels = labels[valid]
        finite = np.isfinite(scores)
        scores, labels = scores[finite], labels[finite]
        values: dict[str, object] = {
            "sample_id": sample_id,
            "source_id": row["source_id"],
            "generator": row.get("generator", ""),
            "regime": row.get("regime", ""),
            "patch_auroc": None,
            "patch_auprc": None,
            "oracle_dice_diagnostic_only": None,
            "score_mean": float(np.mean(scores)),
            "score_median": float(np.median(scores)),
            "score_p95": float(np.percentile(scores, 95)),
            "score_max": float(np.max(scores)),
            "positive_patch_fraction": float(np.mean(labels)),
        }
        if row.get("regime") == "partial":
            auc = rank_auc(labels, scores)
            ap = average_precision(labels, scores)
            oracle, _ = oracle_dice(labels, scores)
            values["patch_auroc"] = auc if math.isfinite(auc) else None
            values["patch_auprc"] = ap if math.isfinite(ap) else None
            values["oracle_dice_diagnostic_only"] = oracle
        per_image.append(values)

    groups: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    for row in per_image:
        groups[(str(row["regime"]), "ALL")].append(row)
        groups[(str(row["regime"]), str(row["generator"]))].append(row)
    summaries = []
    for (regime, generator), rows in sorted(groups.items()):
        metrics = ("patch_auroc", "patch_auprc", "oracle_dice_diagnostic_only",
                   "score_mean", "score_median", "score_p95", "score_max")
        summary: dict[str, object] = {
            "regime": regime,
            "generator": generator,
            "n_images": len(rows),
        }
        for metric in metrics:
            vals = np.asarray(
                [row[metric] for row in rows if row[metric] is not None], dtype=float
            )
            summary[f"{metric}_image_macro"] = (
                float(vals.mean()) if vals.size else None
            )
        summaries.append(summary)

    output.mkdir(parents=True, exist_ok=True)
    for name, rows in (("per_image.csv", per_image), ("group_summary.csv", summaries)):
        with (output / name).open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
    payload = {
        "status": "exploratory_development_pilot_not_release_validation",
        "method": "TRAIL with frozen DINOv2 ViT-S/14, block 11",
        "threshold_used": None,
        "threshold_tuned": False,
        "map_filter": "reflect-padded median3",
        "input_geometry": "448x448 aspect-preserving letterbox; gray padding; masks padded untouched",
        "pilot_size": len(per_image),
        "by_regime": [row for row in summaries if row["generator"] == "ALL"],
        "limitations": [
            "60 OpenSDI samples are exploratory and are not an independent release test.",
            "Patch AUROC/AUPRC measures ranking on coarse 14x14-pixel patches, not exact boundaries.",
            "Oracle Dice is an optimistic per-image diagnostic and is not an operating result.",
            "Full-generation and authentic masks are single-class controls; their raw map scores do not establish a calibrated decision threshold.",
            "The pilot does not test general impossible-scene reasoning or establish AI authorship.",
        ],
        "model": run["model"],
        "configuration": run["configuration"],
        "manifest_sha256": run["manifest_sha256"],
    }
    (output / "summary.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(payload["by_regime"], indent=2))


if __name__ == "__main__":
    main()
