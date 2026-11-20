"""Diagnostic native-resolution recheck; never a fresh test set or threshold tuning."""
import hashlib
import io
import json
import urllib.parse
from pathlib import Path

import numpy as np
from PIL import Image
import prepare_opensdi as acquire
from run_trufor import load_model, infer
from localization import pixel_metrics, overlay

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "datasets/opensdi-pilot-v1"
OUT = ROOT / "runs/opensdi-native-diagnostic"


def main():
    OUT.mkdir(parents=True, exist_ok=False)
    acquire.used = json.loads((DATA / "download-ledger.json").read_text())["accounted_bytes"]
    manifest = json.loads((DATA / "manifest.json").read_text())
    # Fixed positions, not chosen for visual/model success. Only two diagnostic
    # samples; the full pilot covers all five generators.
    samples = [r for r in manifest if r["id"] in ["sd15-partial-1139", "flux-partial-1139"]]
    model, _ = load_model()
    reports = []
    for item in samples:
        query = urllib.parse.urlencode({"dataset": "nebula/OpenSDI_test", "config": "default",
                                       "split": item["generator"], "offset": item["row_index"], "length": 1})
        row = json.loads(acquire.fetch("https://datasets-server.huggingface.co/rows?" + query))["rows"][0]["row"]
        image_bytes = acquire.fetch(row["image"]["src"])
        mask_bytes = acquire.fetch(row["mask"]["src"])
        if hashlib.sha256(image_bytes).hexdigest() != item["viewer_image_sha256"] or hashlib.sha256(mask_bytes).hexdigest() != item["viewer_mask_sha256"]:
            raise ValueError("Cached source asset changed; cannot compare resolutions")
        with Image.open(io.BytesIO(image_bytes)) as source:
            image = source.convert("RGB")
        with Image.open(io.BytesIO(mask_bytes)) as source:
            truth = (np.asarray(source.convert("L")) > 127).astype(np.uint8)
        directory = OUT / item["id"]
        directory.mkdir()
        if image.width * image.height > 1_000_000:
            reports.append({"id": item["id"], "status": "skipped_cpu_size_guard", "size": image.size})
            continue
        scores, reliability, detection, seconds = infer(model, image)
        metrics = pixel_metrics(scores, truth, .5)
        image.save(directory / "input.png")
        Image.fromarray(truth * 255).save(directory / "truth.png")
        overlay(image, scores, .5).save(directory / "overlay.png")
        np.savez_compressed(directory / "prediction.npz", map=scores, conf=reliability,
                            score=detection, imgsize=scores.shape)
        report = {"id": item["id"], "status": "ok", "size": image.size, "metrics": metrics,
                  "inference_seconds": seconds, "threshold": .5,
                  "native_means": "dataset-viewer resolution; not necessarily original encoded file"}
        reports.append(report)
        print(json.dumps(report), flush=True)
    (OUT / "summary.json").write_text(json.dumps(reports, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
