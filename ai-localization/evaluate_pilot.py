"""Evaluate fixed pilot without tuning, score inversion or cherry-picking."""
import hashlib
import json
from pathlib import Path
import statistics
import time

import numpy as np
from PIL import Image
from localization import pixel_metrics, overlay
from run_trufor import load_model, infer, WEIGHT_HASH, REVISION

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "datasets/opensdi-pilot-v1"
OUT = ROOT / "runs/opensdi-pilot-v1"


def aggregate(rows):
    def mean(name):
        values = [r["metrics"][name] for r in rows if r["metrics"][name] is not None]
        return statistics.mean(values) if values else None
    return {"n": len(rows), "mean_iou": mean("iou"), "mean_dice": mean("dice"),
            "mean_false_positive_pixel_rate": mean("false_positive_pixel_rate"),
            "mean_flagged_fraction": mean("flagged_fraction"),
            "images_with_any_highlight": sum(r["metrics"]["flagged_fraction"] > 0 for r in rows),
            "images_over_1pct_highlight": sum(r["metrics"]["flagged_fraction"] > .01 for r in rows),
            "median_inference_seconds": statistics.median(r["inference_seconds"] for r in rows)}


def main():
    plan = json.loads((DATA / "plan.json").read_text())
    manifest = json.loads((DATA / "manifest.json").read_text())
    if len(manifest) != 60:
        raise ValueError("Incomplete cohort")
    if OUT.exists():
        raise ValueError("Existing evaluation output; do not overwrite")
    threshold = plan["threshold"]
    if threshold != .5:
        raise ValueError("Pilot threshold must remain fixed at 0.5")
    OUT.mkdir(parents=True)
    model, load_seconds = load_model()
    rows = []
    started = time.perf_counter()
    for item in manifest:
        entry = {"id": item["id"], "group": item["group"], "generator": item["generator"]}
        try:
            for key, hashkey in [("image", "input_sha256"), ("truth", "truth_sha256")]:
                if hashlib.sha256((DATA / item[key]).read_bytes()).hexdigest() != item[hashkey]:
                    raise ValueError("Dataset hash mismatch")
            with Image.open(DATA / item["image"]) as source:
                image = source.convert("RGB")
            with Image.open(DATA / item["truth"]) as source:
                truth = np.asarray(source.convert("L"))
            if not np.isin(truth, [0, 255]).all():
                raise ValueError("Nonbinary ground truth")
            scores, reliability, detection, seconds = infer(model, image)
            metrics = pixel_metrics(scores, truth // 255, threshold)
            # IoU/Dice over an all-zero truth are not interpreted as localization
            # quality. For authentic controls use false-positive pixel rate.
            if item["group"] == "authentic":
                metrics["iou"] = metrics["dice"] = None
            directory = OUT / item["id"]
            directory.mkdir()
            np.savez_compressed(directory / "prediction.npz", map=scores, conf=reliability,
                                score=detection, imgsize=scores.shape)
            overlay(image, scores, threshold).save(directory / "overlay.png")
            entry.update(status="ok", metrics=metrics, inference_seconds=seconds,
                         manipulation_score=detection)
        except Exception as error:
            entry.update(status="failed", error=f"{type(error).__name__}: {error}")
        rows.append(entry)
        (OUT / "per-image.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
        print(f"{len(rows)}/60 {entry['id']}: {entry['status']} "
              f"{entry.get('metrics', {}).get('iou', '')}", flush=True)
    good = [r for r in rows if r["status"] == "ok"]
    groups = {g: aggregate([r for r in good if r["group"] == g])
              for g in plan["groups"] if any(r["group"] == g for r in good)}
    by_generator = {gen: {g: aggregate([r for r in good if r["group"] == g and r["generator"] == gen])
                         for g in plan["groups"] if any(r["group"] == g and r["generator"] == gen for r in good)}
                    for gen in plan["generators"]}
    report = {"evaluation": "exploratory_reduced_resolution_pilot", "deployment_ready": False,
              "threshold": threshold, "load_seconds": load_seconds,
              "batch_seconds": time.perf_counter() - started, "expected_n": 60,
              "successful_n": len(good), "failed_n": len(rows) - len(good),
              "unique_source_families": len({r["source_family"] for r in manifest}),
              "unique_prepared_images": len({r["input_sha256"] for r in manifest}),
              "checkpoint_sha256": WEIGHT_HASH, "source_revision": REVISION,
              "manifest_sha256": hashlib.sha256((DATA / "manifest.json").read_bytes()).hexdigest(),
              "groups": groups, "by_generator": by_generator,
              "limitations": plan["limitations"] + ["No calibrated abstention policy",
                   "Full-image mask is a dataset annotation convention, not proof each pixel carries forensic traces",
                   "Authentic source families may repeat across generator splits; samples are not necessarily independent"]}
    (OUT / "summary.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(groups, indent=2), flush=True)


if __name__ == "__main__":
    main()
