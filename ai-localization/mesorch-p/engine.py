"""Offline inference for the separate AuthentiScan pixel-localization service."""
import argparse
import base64
import gc
import hashlib
import io
import json
import os
import sys
from pathlib import Path

os.environ["CUBLAS_WORKSPACE_CONFIG"] = ":4096:8"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
from PIL import Image, ImageOps
import cv2
import numpy as np
import torch

from get_weights import ROOT, SHA, verify
from weight_compat import load_complete

MODEL = "mesorch-p-118-capstone-preview-v1"
MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 16_000_000


def decode(payload):
    if not 0 < len(payload) <= MAX_BYTES:
        raise ValueError("Image size exceeds the limit or is empty")
    with Image.open(io.BytesIO(payload)) as source:
        if source.format not in {"PNG", "JPEG", "WEBP"} or getattr(source, "n_frames", 1) != 1:
            raise ValueError("Expected a single PNG, JPEG or WebP image")
        if source.width * source.height > MAX_PIXELS:
            raise ValueError("Image exceeds the pixel limit")
        rgba = ImageOps.exif_transpose(source).convert("RGBA")
        return np.asarray(Image.alpha_composite(Image.new("RGBA", rgba.size, "white"), rgba).convert("RGB"))


class Engine:
    def __init__(self, path):
        verify(path)
        self.checkpoint_sha256 = SHA
        if not torch.cuda.is_available() or torch.cuda.mem_get_info()[0] < 4.5 * 2**30:
            raise RuntimeError("Requires a compatible CUDA GPU with 4.5 GiB free")
        torch.set_num_threads(2)
        cv2.setNumThreads(2)
        torch.use_deterministic_algorithms(True)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
        sys.path.insert(0, str(ROOT / "vendor"))
        from mesorch_p import Mesorch_P
        if set(torch.serialization.get_unsafe_globals_in_checkpoint(path)) != {"argparse.Namespace"}:
            raise ValueError("Unexpected checkpoint metadata classes")
        with torch.serialization.safe_globals([argparse.Namespace]):
            archive = torch.load(path, weights_only=True, map_location="cpu")
        audit = json.loads((ROOT / "evidence/EXTRA-KEYS-AUDIT.json").read_text())
        self.graph, reference, active = load_complete(
            lambda: Mesorch_P(seg_pretrain_path=None, conv_pretrain=False, image_size=512),
            archive["model"], {r["key"] for r in audit["extra_keys"]})
        if active != 743:
            raise ValueError("Unexpected active tensor count")
        del reference, archive
        gc.collect()
        self.graph.eval()
        self.graph.predictor.cuda()
        self.dummy = torch.zeros(1, 1, 512, 512, device="cuda")
        self.mean = np.array([.485, .456, .406], np.float32) * 255
        self.scale = 1 / (np.array([.229, .224, .225], np.float32) * 255)

    @torch.inference_mode()
    def predict(self, payload):
        rgb = decode(payload)
        height, width = rgb.shape[:2]
        result = dict(schema_version=1, model_version=MODEL,
                      validation_status="development_gates_failed", input_sha256=hashlib.sha256(payload).hexdigest(),
                      scope="pixel_level_forensic_edit_localization",
                      coordinate_space="normalized_upright_rgb", image_width=width, image_height=height,
                      threshold=.5, checkpoint_sha256=SHA, highlighted_pixels=0,
                      highlighted_fraction=0.0, mask_png_base64=None)
        resized = cv2.resize(rgb, (512, 512), interpolation=cv2.INTER_LINEAR)
        if (resized == resized[0, 0]).all():
            return dict(result, status="uncertain", reason="constant_input")
        x = (resized.astype(np.float32) - self.mean) * self.scale
        tensor = torch.from_numpy(x.transpose(2, 0, 1).copy()).unsqueeze(0).cuda()
        scores = self.graph(tensor, self.dummy)["pred_mask"][0, 0].cpu().numpy()
        if scores.shape != (512, 512) or not np.isfinite(scores).all():
            return dict(result, status="uncertain", reason="invalid_scores")
        mask = cv2.resize(scores, (width, height), interpolation=cv2.INTER_LINEAR) >= .5
        count = int(mask.sum())
        result.update(highlighted_pixels=count, highlighted_fraction=count / mask.size)
        if count == 0 or count == mask.size:
            return dict(result, status="uncertain", reason="no_candidate_region" if not count else "diffuse_response")
        png = io.BytesIO()
        Image.fromarray(mask.astype(np.uint8) * 255).save(png, format="PNG")
        return dict(result, status="available", reason=None,
                    mask_png_base64=base64.b64encode(png.getvalue()).decode("ascii"))
