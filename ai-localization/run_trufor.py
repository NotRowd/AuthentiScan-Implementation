"""Isolated, CPU-only TruFor research inference; not a production API.

Uses official GRIP-UNINA TruFor modules without modifying their source.
Respect vendor/TruFor/test_docker/LICENSE.txt and LICENSE_CMX.txt.
"""
import argparse
import hashlib
import importlib.metadata
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
import torch

from localization import unit_map, overlay, threshold_mask

ROOT = Path(__file__).resolve().parent
REVISION = "ae54475df6f41a491d7615100feb19263dec13f7"
WEIGHT_HASH = "ac1d90e329a72e0d66e8665e123a19e94bfae3209c3ef8a4f9ca3b91578c7844"


def load_model():
    vendor = ROOT / "vendor/TruFor"
    revision = subprocess.check_output(["git", "-C", str(vendor), "rev-parse", "HEAD"], text=True).strip()
    if revision != REVISION:
        raise ValueError("Unexpected upstream revision.")
    if subprocess.check_output(["git", "-C", str(vendor), "status", "--porcelain"], text=True).strip():
        raise ValueError("Upstream checkout is modified; review changes before running.")
    weights = ROOT / "weights/official/weights/trufor.pth.tar"
    if hashlib.sha256(weights.read_bytes()).hexdigest() != WEIGHT_HASH:
        raise ValueError("Checkpoint hash mismatch.")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.manual_seed(0)
    src = vendor / "test_docker/src"
    sys.path.insert(0, str(src))
    from config import _C
    from models.cmx.builder_np_conf import myEncoderDecoder
    config = _C.clone()
    config.merge_from_file(str(src / "trufor.yaml"))
    config.freeze()
    started = time.perf_counter()
    # Do not fall back to arbitrary pickle execution for untrusted checkpoints.
    # Legacy official checkpoint stores NumPy scalar training metadata.
    # Permit only its inspected scalar/dtype globals, not unrestricted pickle.
    safe_numpy = [(np._core.multiarray.scalar, "numpy.core.multiarray.scalar"),
                  np.dtype, type(np.dtype("float64")), type(np.dtype("float32"))]
    with torch.serialization.safe_globals(safe_numpy):
        checkpoint = torch.load(weights, map_location="cpu", weights_only=True)
    model = myEncoderDecoder(cfg=config)
    model.load_state_dict(checkpoint["state_dict"], strict=True)
    del checkpoint
    model.eval()
    load_seconds = time.perf_counter() - started
    return model, load_seconds


def infer(model, image):
    if image.mode != "RGB" or image.width * image.height > 1_000_000:
        raise ValueError("Expected <=1 megapixel RGB research input.")
    # /256 is deliberate: matches official data_core.py, not classifier preprocessing.
    tensor = torch.from_numpy(np.array(image).transpose(2, 0, 1).copy()).float().unsqueeze(0) / 256.0
    started = time.perf_counter()
    with torch.inference_mode():
        pred, conf, det, _ = model(tensor)
        scores = torch.softmax(pred[0], dim=0)[1].cpu().numpy()
        reliability = torch.sigmoid(conf[0, 0]).cpu().numpy()
        detection = float(torch.sigmoid(det).item())
    inference_seconds = time.perf_counter() - started
    shape = (image.height, image.width)
    scores = unit_map(scores, shape)
    reliability = unit_map(reliability, shape)
    if not np.isfinite(detection) or not 0 <= detection <= 1:
        raise ValueError("Invalid detection output.")
    return scores, reliability, detection, inference_seconds


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--threshold", required=True, type=float,
                        help="Experimental visualization threshold, not calibrated")
    args = parser.parse_args()
    threshold_mask([[0.0]], args.threshold)
    if args.output.exists():
        raise ValueError("Output exists; use a fresh run directory.")
    input_hash = hashlib.sha256(args.image.read_bytes()).hexdigest()
    with Image.open(args.image) as source:
        if source.width * source.height > 1_000_000 or source.mode != "RGB":
            raise ValueError("Expected <=1 megapixel RGB research input.")
        image = ImageOps.exif_transpose(source).copy()
    model, load_seconds = load_model()
    scores, reliability, detection, inference_seconds = infer(model, image)
    shape = (image.height, image.width)
    mask = threshold_mask(scores, args.threshold)
    report = {
        "status": "research_only", "deployment_ready": False,
        "model": "TruFor official pretrained", "source_revision": REVISION,
        "checkpoint_sha256": WEIGHT_HASH, "original_file_sha256": input_hash,
        "upright_rgb_pixel_sha256": hashlib.sha256(image.tobytes()).hexdigest(),
        "device": "cpu", "threads": 2, "shape": list(shape),
        "preprocessing": "EXIF upright RGB; no resize; CHW float /256 (TruFor)",
        "load_seconds": load_seconds, "inference_seconds": inference_seconds,
        "image_manipulation_score": detection,
        "experimental_threshold": args.threshold,
        "flagged_pixel_fraction": float(mask.mean()),
        "localization_min": float(scores.min()), "localization_max": float(scores.max()),
        "reliability_mean": float(reliability.mean()),
        "accuracy_evaluated": False,
        "warning": "Manipulation evidence is not proof of AI generation. "
                   "No calibrated localization decision or scene explanation is provided.",
        "packages": {p: importlib.metadata.version(p) for p in
                     ["torch", "torchvision", "timm", "numpy", "Pillow", "yacs"]},
        "attribution": "Guillaro et al., TruFor, CVPR 2023; GRIP-UNINA; nonprofit research only",
    }
    args.output.mkdir(parents=True, exist_ok=False)
    image.save(args.output / "input.png")
    np.savez_compressed(args.output / "prediction.npz", map=scores, conf=reliability,
                        score=detection, imgsize=shape)
    overlay(image, scores, args.threshold).save(args.output / "research-overlay.png")
    Image.fromarray(mask.astype(np.uint8) * 255).save(args.output / "research-mask.png")
    Image.fromarray(np.rint(reliability * 255).astype(np.uint8)).save(args.output / "reliability.png")
    (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
