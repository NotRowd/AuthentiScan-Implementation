"""Fixed 60-image development comparison; no threshold tuning or deployment."""
import hashlib
import json
from pathlib import Path
import time
import importlib.metadata

import numpy as np
from PIL import Image
from evaluate_pilot import aggregate
from localization import pixel_metrics, overlay
from run_vaas import load_model, infer, WEIGHT_HASH, REVISION

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "datasets/opensdi-pilot-v1"
OUT = ROOT / "runs/vaas-v2-base-opensdi-pilot-v1"
MANIFEST_HASH = "c77112be07e6f06f80f7df14177f328207295292f61b2f0ba7ed3230ffd63ccb"


def main():
    if hashlib.sha256((DATA / "manifest.json").read_bytes()).hexdigest() != MANIFEST_HASH:
        raise ValueError("Pilot manifest changed")
    manifest = json.loads((DATA / "manifest.json").read_text())
    plan = json.loads((DATA / "plan.json").read_text())
    if len(manifest) != 60 or plan["threshold"] != .5:
        raise ValueError("Changed pilot protocol")
    if OUT.exists():
        raise ValueError("Output exists; do not overwrite research results")
    model, load_seconds = load_model()
    OUT.mkdir(parents=True)
    started = time.perf_counter()
    rows = []
    for item in manifest:
        row = {k: item[k] for k in ("id", "group", "generator")}
        try:
            for key, hashkey in [("image", "input_sha256"), ("truth", "truth_sha256")]:
                if hashlib.sha256((DATA / item[key]).read_bytes()).hexdigest() != item[hashkey]:
                    raise ValueError("Dataset asset hash mismatch")
            with Image.open(DATA / item["image"]) as source:
                image = source.convert("RGB")
            scores, native, seconds = infer(model, image)
            # Ground truth is opened only after inference and never passed to model.
            with Image.open(DATA / item["truth"]) as source:
                truth = np.asarray(source.convert("L"))
            if not np.isin(truth, [0, 255]).all():
                raise ValueError("Ground truth is not binary")
            metrics = pixel_metrics(scores, truth // 255, .5)
            if item["group"] == "authentic":
                metrics["iou"] = metrics["dice"] = None
            destination = OUT / item["id"]
            destination.mkdir()
            np.savez_compressed(destination / "prediction.npz", map=scores,
                                native_map=native, imgsize=scores.shape)
            overlay(image, scores, .5).save(destination / "overlay.png")
            row.update(status="ok", metrics=metrics, inference_seconds=seconds,
                       minimum=float(scores.min()), maximum=float(scores.max()))
        except Exception as error:
            row.update(status="failed", error=f"{type(error).__name__}: {error}")
        rows.append(row)
        (OUT / "per-image.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
        print(f"{len(rows)}/60 {item['id']}: {row['status']} {row.get('metrics', {}).get('iou')}", flush=True)
    good = [r for r in rows if r["status"] == "ok"]
    groups = {g: aggregate([r for r in good if r["group"] == g])
              for g in plan["groups"] if any(r["group"] == g for r in good)}
    by_generator = {gen: {g: aggregate([r for r in good if r["group"] == g and r["generator"] == gen])
                         for g in plan["groups"] if any(r["group"] == g and r["generator"] == gen for r in good)}
                    for gen in plan["generators"]}
    report = dict(model="VAAS-v2-base-df2023", deployment_ready=False,
                  expected_n=60, successful_n=len(good), failed_n=60-len(good),
                  threshold=.5, load_seconds=load_seconds, batch_seconds=time.perf_counter()-started,
                  checkpoint_sha256=WEIGHT_HASH, source_revision=REVISION,
                  manifest_sha256=MANIFEST_HASH, groups=groups, by_generator=by_generator,
                  environment={p: importlib.metadata.version(p) for p in
                               ["torch", "torchvision", "transformers", "numpy", "Pillow", "safetensors"]},
                  limitations=plan["limitations"] + [
                      "Exploratory reuse of an inspected pilot, not independent test evidence",
                      "VAAS internally resizes inputs to 224x224; TruFor did not use the same internal resolution",
                      "Raw sigmoid map bilinearly aligned to pilot dimensions without per-image normalization",
                      "No S_F/S_H score, calibrated confidence, scene explanation or authenticity claim",
                      "General forensic checkpoint, not specifically a diffusion-inpainting model",
                      "No calibrated abstention rule; full-image masks are a dataset convention"])
    (OUT / "summary.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(groups, indent=2), flush=True)


if __name__ == "__main__":
    main()
