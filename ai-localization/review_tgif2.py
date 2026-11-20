"""Evidence-only review of frozen TGIF2 predictions; never grants release approval."""
from __future__ import annotations

import base64
from collections import defaultdict
import html
import json
import math
from pathlib import Path
import sys

import numpy as np


def bootstrap_source_mean(rows: list[dict], field: str) -> dict | None:
    grouped = defaultdict(list)
    for row in rows:
        value = row.get(field)
        if value is not None and math.isfinite(float(value)):
            grouped[row["source_id"]].append(float(value))
    values = np.asarray([np.mean(v) for _, v in sorted(grouped.items())])
    if not len(values):
        return None
    rng = np.random.default_rng(20261009)
    means = values[rng.integers(0, len(values), size=(5000, len(values)))].mean(axis=1)
    return {"mean": float(values.mean()), "lower_95": float(np.percentile(means, 2.5)),
            "upper_95": float(np.percentile(means, 97.5)), "sources": len(values)}


def grid_svg(image: Path, grid: np.ndarray, color: str, title: str) -> str:
    encoded = base64.b64encode(image.read_bytes()).decode("ascii")
    rectangles = "".join(f'<rect x="{x*14}" y="{y*14}" width="14" height="14"/>'
                         for y, x in np.argwhere(grid))
    return f'<figure><figcaption>{html.escape(title)}</figcaption><svg role="img" aria-label="{html.escape(title, quote=True)}" viewBox="0 0 448 448"><image width="448" height="448" href="data:image/png;base64,{encoded}"/><g fill="{color}" fill-opacity="0.42">{rectangles}</g></svg></figure>'


def create_review(job_root: Path) -> dict:
    sys.path.insert(0, str(Path(__file__).parent / "vendor/trail-image-edit-localization/src"))
    from trail.core import median3, patch_labels
    from trail.data import load_mask, read_manifest, resolve_relative, sha256_file
    from summarize_tgif2_flux1dev_subset import verified_prediction_rows

    manifest_path = job_root / "prepared/manifest.csv"
    data_root, run_dir = job_root / "prepared", job_root / "inference"
    rows, threshold = verified_prediction_rows(job_root / "evaluation", manifest_path, data_root, run_dir)
    manifest = read_manifest(manifest_path)
    metadata = {row["sample_id"]: row for row in manifest}
    run = json.loads((run_dir / "run.json").read_text())
    records = {record["sample_id"]: record for record in run["records"]}
    evaluation = json.loads((job_root / "evaluation/summary.json").read_text())
    layer_index = run["model"]["layers"].index(evaluation["layer"])
    # Fixed by manifest order, not by quality: first three source families/split.
    selected = set()
    for split in ("dev", "test"):
        source_order = list(dict.fromkeys(row["source_id"] for row in manifest if row["split"] == split))
        selected.update((split, source) for source in source_order[:3])
    figures = []
    for row in rows:
        record = records[row["sample_id"]]
        artifact = resolve_relative(run_dir, record["file"])
        if sha256_file(artifact) != record["sha256"]:
            raise ValueError("Prediction changed during review")
        with np.load(artifact, allow_pickle=False) as payload:
            scores = np.asarray(payload["scores"][layer_index], dtype=np.float32)
        if evaluation["median3"]:
            scores = median3(scores)
        predicted = scores >= threshold
        meta = metadata[row["sample_id"]]
        pixel_truth = load_mask(resolve_relative(data_root, meta["mask"]))
        if pixel_truth.shape != (448,448) or predicted.shape != (32,32):
            raise ValueError("Unexpected benchmark geometry")
        pixel_prediction = np.repeat(np.repeat(predicted,14,axis=0),14,axis=1)
        if row["image_role"] == "edited":
            overlap = int(np.count_nonzero(pixel_truth & pixel_prediction))
            total = int(pixel_truth.sum())+int(pixel_prediction.sum())
            union = int(np.count_nonzero(pixel_truth | pixel_prediction))
            row["projected_pixel_dice"] = 2*overlap/total if total else None
            row["projected_pixel_iou"] = overlap/union if union else None
        row["full_grid_highlight_fraction"] = float(predicted.mean())
        row["empty_prediction"] = int(not predicted.any())
        row["diffuse_prediction"] = int(predicted.all())
        if (row["split"], row["source_id"]) in selected:
            truth, _ = patch_labels(pixel_truth, scores.shape)
            image = resolve_relative(data_root, meta["image"])
            metric = "authentic control" if row["image_role"] == "aligned_original" else f'Dice {row["dice"]:.3f}; IoU {row["iou"]:.3f}'
            figures.append(f'<section><h3>{html.escape(row["sample_id"])}</h3><p>{metric}; selected grid: {predicted.mean():.1%}</p><div class="pair">'
                           + grid_svg(image, truth, "#008875", "Supplied truth at patch resolution")
                           + grid_svg(image, predicted, "#d00083", "Model candidate regions — fixed threshold") + '</div></section>')
    grouped = defaultdict(list)
    for row in rows:
        grouped[(row["split"], row["condition"], row["image_role"])].append(row)
    groups = []
    for (split, condition, role), members in sorted(grouped.items()):
        group = dict(split=split, condition=condition, role=role, images=len(members),
                     empty_predictions=sum(row["empty_prediction"] for row in members),
                     diffuse_predictions=sum(row["diffuse_prediction"] for row in members),
                     highlight_fraction=bootstrap_source_mean(members, "full_grid_highlight_fraction"))
        if role == "edited":
            group.update(dice=bootstrap_source_mean(members, "dice"), iou=bootstrap_source_mean(members, "iou"),
                         auroc=bootstrap_source_mean(members, "auroc"), auprc=bootstrap_source_mean(members, "auprc"),
                         projected_pixel_dice=bootstrap_source_mean(members,"projected_pixel_dice"),
                         projected_pixel_iou=bootstrap_source_mean(members,"projected_pixel_iou"))
        else:
            group["images_with_false_highlights"] = sum(row["full_grid_highlight_fraction"] > 0 for row in members)
        groups.append(group)
    value = dict(status="awaiting_human_model_quality_review", release_approved=False, threshold=threshold,
                 threshold_retuned=False, groups=groups,
                 interval_method="5000 deterministic percentile bootstrap draws over source-family means; 95% intervals",
                 visual_selection="First three source families in each frozen manifest split; all three conditions",
                 limitations=["Only one generator and two partial-edit conditions; no broad AI-authorship claim.",
                              "32x32 patch grid, not pixel-exact segmentation.",
                              "Boundary patches with edited coverage between 0 and 50% are excluded from overlap metrics.",
                              "Projected pixel metrics include every resized-mask pixel, expanding each grid cell to 14x14; this does not make the model pixel-exact.",
                              "Empty and full maps abstain in the service, but remaining maps are not proven reliable."])
    report = job_root / "review"
    report.mkdir(exist_ok=False)
    (report / "quality-review.json").write_text(json.dumps(value, indent=2, allow_nan=False), encoding="utf-8")
    table_rows = []
    for group in groups:
        dice = f'{group["dice"]["mean"]:.3f}' if group.get("dice") else "—"
        false = str(group.get("images_with_false_highlights", "—"))
        table_rows.append(f'<tr><td>{html.escape(group["split"])}</td><td>{html.escape(group["condition"])}</td><td>{group["images"]}</td><td>{dice}</td><td>{false}</td><td>{group["empty_predictions"]}</td><td>{group["highlight_fraction"]["mean"]:.1%}</td></tr>')
    document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AuthentiScan localization evaluation</title>
<style>body{font:16px system-ui;background:#f2f6fa;color:#12223d;max-width:1160px;margin:auto;padding:24px}h1{font-size:30px}.note,section{background:white;border:1px solid #ccd7e1;border-radius:12px;padding:18px;margin:20px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0}figcaption{font-weight:600;margin-bottom:8px}svg{width:100%;height:auto}table{width:100%;border-collapse:collapse;background:white}td,th{text-align:left;border:1px solid #cbd5e1;padding:9px}.table{overflow:auto}h3{overflow-wrap:anywhere}@media(max-width:600px){.pair{grid-template-columns:1fr}body{padding:12px}}</style>
<h1>AuthentiScan: measured localization results</h1><div class="note"><strong>Research evaluation, not a release approval.</strong><p>Teal: supplied truth. Magenta: actual model predictions, not Grad-CAM. These examples are selected by fixed source order, not best results. The model never receives truth masks as inputs.</p>'''
    document += f'<p>Fixed threshold: {threshold:.9g}. Development and confirmation sources are disjoint. Threshold chosen on development only.</p></div>'
    document += '<div class="table"><table><tr><th>Split</th><th>Condition</th><th>Images</th><th>Mean Dice</th><th>Authentic images falsely highlighted</th><th>Empty maps</th><th>Mean highlighted area</th></tr>' + ''.join(table_rows) + '</table></div>'
    document += '<p>Overlap uses the upstream valid-patch rule; true edit boundaries remain coarser than the original mask. Authentic controls use false-highlight counts, not empty-mask "perfect" Dice. Confidence intervals and limits are in quality-review.json.</p>'
    document += ''.join(figures) + '</html>'
    (report / "visual-review.html").write_text(document, encoding="utf-8")
    return value


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job-root", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(create_review(args.job_root.resolve()), indent=2))
