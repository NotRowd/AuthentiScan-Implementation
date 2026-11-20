"""Loopback-only experimental localizer, disabled without a reviewed policy.

No classification, Grad-CAM, object boxes or ground-truth masks enter inference.
No uploaded images or generated masks are written to disk by this service.
"""
from __future__ import annotations

import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import math
import os
from pathlib import Path
import sys
import threading
import warnings

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
MODEL = "trail-dinov2s14-flux1dev-v1"
SCOPE = "experimental_flux1dev_partial_edits"
MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 16_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def decode_upright(payload: bytes) -> Image.Image:
    if not payload or len(payload) > MAX_BYTES:
        raise ValueError("Invalid image size")
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(payload)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"} or getattr(source, "n_frames", 1) != 1:
                raise ValueError("Unsupported image")
            if source.width * source.height > MAX_PIXELS:
                raise ValueError("Too many pixels")
            upright = ImageOps.exif_transpose(source).convert("RGBA")
            background = Image.new("RGBA", upright.size, "white")
            return Image.alpha_composite(background, upright).convert("RGB")


def load_reviewed_policy(path: Path) -> tuple[dict, str]:
    raw = path.read_bytes()
    policy = json.loads(raw)
    if policy.get("review_status") != "approved_for_limited_research" or policy.get("model_version") != MODEL or policy.get("scope") != SCOPE:
        raise ValueError("A reviewed, limited-research policy is required")
    report_path = (path.parent / policy["evaluation_report"]).resolve()
    report_raw = report_path.read_bytes()
    if hashlib.sha256(report_raw).hexdigest() != policy.get("evaluation_sha256"):
        raise ValueError("Evaluation report checksum mismatch")
    report = json.loads(report_raw)
    config = report.get("configuration", {})
    if report.get("status") != "research_evaluation_not_release_certification" or report.get("model", {}).get("model_key") != "dinov2_vits14" or report.get("model", {}).get("layers") != [11] or any(config.get(key) != value for key, value in {"family":"haar", "strength":0.2, "application":"global", "replicates":1}.items()):
        raise ValueError("Evaluation does not match this frozen model/configuration")
    threshold = policy.get("threshold")
    if isinstance(threshold, bool) or not isinstance(threshold, (float, int)) or not math.isfinite(threshold) or not 0 < threshold < 2:
        raise ValueError("Invalid fixed threshold")
    if report.get("threshold") != threshold or report.get("test_threshold_retuning") is not False or report.get("split_counts") != {"dev": 240, "test": 240}:
        raise ValueError("Policy does not match the completed source-disjoint evaluation")
    if not isinstance(policy.get("review_notes"), str) or not policy["review_notes"].strip():
        raise ValueError("Review notes documenting limits are required")
    return policy, hashlib.sha256(raw).hexdigest()


def pack_prediction(score_map: np.ndarray, threshold: float, size: tuple[int, int],
                    image_hash: str, policy_hash: str) -> dict:
    scores = np.asarray(score_map)
    if scores.shape != (32, 32) or not np.isfinite(scores).all():
        raise ValueError("Invalid localizer output")
    selected = scores >= threshold
    count = int(selected.sum())
    status = "available" if 0 < count < selected.size else "uncertain"
    return dict(schema_version=1, status=status, model_version=MODEL, scope=SCOPE,
                coordinate_space="normalized_upright_rgb", input_sha256=image_hash,
                policy_sha256=policy_hash, threshold=threshold,
                image_width=size[0], image_height=size[1], grid_shape=[32, 32],
                mask=selected.astype(int).ravel().tolist() if status == "available" else None,
                reason=None if status == "available" else "no_candidate_region" if count == 0 else "diffuse_response")


class FrozenPipeline:
    """Offline scoring pipeline; does not grant permission to serve predictions."""
    def __init__(self):
        from continue_tgif2_benchmark import CHECKPOINT, CHECKSUM
        if hashlib.sha256(CHECKPOINT.read_bytes()).hexdigest() != CHECKSUM:
            raise ValueError("Model checkpoint checksum mismatch")
        source = ROOT / "weights/hub/facebookresearch_dinov2_7764ea0f912e53c92e82eb78a2a1631e92725fc8"
        if not (source / "hubconf.py").is_file():
            raise ValueError("Pinned model source is not cached")
        os.environ["TORCH_HOME"] = str(ROOT / "weights")
        sys.path.insert(0, str(ROOT / "vendor/trail-image-edit-localization/src"))
        import torch
        from trail.models import FrozenDino, load_model_specs
        from trail.runner import Configuration
        torch.set_num_threads(2)
        specs = load_model_specs(ROOT / "vendor/trail-image-edit-localization/configs/models.json")
        self.model = FrozenDino("dinov2_vits14", specs["dinov2_vits14"], layers=[11], device="cpu", offline=True)
        self.config = Configuration("haar", 0.2, "global", 1)

    def score(self, payload: bytes) -> tuple[np.ndarray, tuple[int,int], str]:
        from trail.core import median3
        from trail.runner import infer_configuration
        original = decode_upright(payload)
        image = np.asarray(original.resize((448, 448), Image.Resampling.BICUBIC))
        digest = hashlib.sha256(payload).hexdigest()
        maps, _ = infer_configuration(self.model, image, self.config, seed_key=digest, pair_batch=1)
        return median3(maps[0]), original.size, digest


class Localizer:
    def __init__(self, policy_path: Path):
        self.policy, self.policy_hash = load_reviewed_policy(policy_path)
        self.pipeline = FrozenPipeline()

    def predict(self, payload: bytes) -> dict:
        scores, size, digest = self.pipeline.score(payload)
        return pack_prediction(scores, self.policy["threshold"], size, digest, self.policy_hash)


def make_server(port: int, engine=None):
    busy = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def reply(self, code, body):
            payload = json.dumps(body, allow_nan=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(payload)
            self.close_connection = True

        def do_GET(self):
            if self.path != "/health":
                return self.reply(404, {"success": False})
            self.reply(200, dict(service="authentiscan-localizer", model_loaded=engine is not None,
                                 status="experimental" if engine else "candidate_not_approved",
                                 model_version=getattr(engine,"model_version",MODEL),
                                 usage_mode=getattr(engine,"usage_mode",None),
                                 validation_status=getattr(engine,"validation_status",None),
                                 score_preview_version=getattr(engine,"score_preview_version",None)))

        def do_POST(self):
            if self.path != "/localize":
                return self.reply(404, {"success": False})
            if self.headers.get("Origin") or self.headers.get("X-AuthentiScan-Localizer") != "localization-v1":
                return self.reply(403, {"success": False})
            if engine is None:
                return self.reply(200, {"success": True, "data": dict(schema_version=1, status="unavailable", reason="candidate_not_approved")})
            if not busy.acquire(blocking=False):
                return self.reply(503, {"success": False, "error": "Localizer busy"})
            try:
                if self.headers.get("Transfer-Encoding"):
                    raise ValueError("Content-Length required")
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_BYTES:
                    return self.reply(413, {"success": False})
                payload = self.rfile.read(length)
                if len(payload) != length:
                    raise ValueError("Incomplete image")
                result = engine.predict(payload)
                self.reply(200, {"success": True, "data": result})
            except (ValueError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
                self.reply(400, {"success": False, "error": "Image or localization output invalid"})
            except Exception:
                self.reply(503, {"success": False, "error": "Localization unavailable"})
            finally:
                busy.release()

        def log_message(self, *_args):
            pass  # Do not retain upload names, bytes or private paths in access logs.

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    policy_path = os.getenv("AUTHENTISCAN_LOCALIZATION_POLICY", "").strip()
    engine = Localizer(Path(policy_path)) if policy_path else None
    print("Localizer: experimental" if engine else "Localizer: unavailable (no approved candidate)", flush=True)
    make_server(5004, engine).serve_forever()
