"""Offline, strict-load VAAS v2-base pixel-map runner. Research only.

Uses the upstream forward pass; replaces network-enabled constructors with
local configuration plus complete checkpoints. No scene-reasoning claims.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F
from torchvision import transforms as T
from localization import unit_map

ROOT = Path(__file__).resolve().parent
REVISION = "823d59bb4e7d228110a7232e74bb677634fe8e05"
WEIGHT_HASH = "ec0d1ea72cfd8ae6f9ae89d13c173c72058380a33107bc3ae61145f7de18206b"


def align_map(native, shape):
    """Explicit evaluation mapping: bilinear resize of probabilities, no renormalizing."""
    native = unit_map(native, (224, 224))
    tensor = torch.from_numpy(native.copy())[None, None]
    mapped = F.interpolate(tensor, size=tuple(shape), mode="bilinear", align_corners=False)
    return unit_map(mapped[0, 0].numpy(), shape)


def load_model():
    vendor = ROOT / "vendor/VAAS"
    git = "C:/Users/kenta/AppData/Local/Programs/Git/cmd/git.exe"
    if not Path(git).exists():
        git = "git"
    revision = subprocess.check_output([git, "-C", str(vendor), "rev-parse", "HEAD"], text=True).strip()
    if revision != REVISION or subprocess.check_output(
        [git, "-C", str(vendor), "status", "--porcelain"], text=True
    ).strip():
        raise ValueError("Unexpected or modified VAAS source")
    weights = ROOT / "weights/vaas-v2-base"
    assets = json.loads((weights / "assets.json").read_text())
    required = {"px_model.pth", "vit/model.safetensors", "vit/config.json", "segformer/config.json"}
    if not required.issubset({a["file"] for a in assets}):
        raise ValueError("Incomplete acquisition")
    for asset in assets:
        target = weights / asset["file"]
        if hashlib.sha256(target.read_bytes()).hexdigest() != asset["sha256"]:
            raise ValueError(f"Modified asset: {asset['file']}")
    if hashlib.sha256((weights / "px_model.pth").read_bytes()).hexdigest() != WEIGHT_HASH:
        raise ValueError("Wrong VAAS checkpoint")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.manual_seed(0)
    sys.path.insert(0, str(vendor))
    from transformers import SegformerConfig, SegformerForSemanticSegmentation, ViTModel
    from vaas.px.px_model import PatchConsistencySegformer
    from vaas.fusion.fxpx_crossattention import FxPxCrossAttention

    class OfflinePatchModel(PatchConsistencySegformer):
        def __init__(self):
            torch.nn.Module.__init__(self)
            config = SegformerConfig.from_pretrained(str(weights / "segformer"), local_files_only=True)
            config.num_labels = 1
            self.segformer = SegformerForSemanticSegmentation(config)
            self.cross_attention = FxPxCrossAttention(px_dim=512, fx_dim=768, gamma=0.1)

    started = time.perf_counter()
    px = OfflinePatchModel()
    # Strict load: do not accept random/unmatched layers hidden by strict=False.
    state = torch.load(weights / "px_model.pth", map_location="cpu", weights_only=True)
    px.load_state_dict(state, strict=True)
    del state
    fx, loading = ViTModel.from_pretrained(str(weights / "vit"), local_files_only=True,
                                 use_safetensors=True, add_pooling_layer=False,
                                 attn_implementation="eager", output_loading_info=True)
    if loading.get("missing_keys") or loading.get("mismatched_keys") or loading.get("error_msgs"):
        raise ValueError(f"Incomplete ViT backbone load: {loading}")
    if any(not k.startswith("classifier.") for k in loading.get("unexpected_keys", [])):
        raise ValueError(f"Unexpected ViT checkpoint layout: {loading}")
    # Upstream map uses last_hidden_state, not the unused/random pooler or S_H score.
    px.eval()
    fx.eval()
    transform = T.Compose([T.Resize((224, 224)), T.ToTensor(),
                           T.Normalize((.485, .456, .406), (.229, .224, .225))])
    return (px, fx, transform), time.perf_counter() - started


def infer(model, image):
    if image.mode != "RGB" or image.width * image.height > 1_000_000:
        raise ValueError("Expected <=1 megapixel RGB research image")
    px, fx, transform = model
    started = time.perf_counter()
    with torch.inference_mode():
        x = transform(image).unsqueeze(0)
        features = fx(x).last_hidden_state
        logits = px(x, features)["logits"]
        logits = F.interpolate(logits, size=(224, 224), mode="bilinear", align_corners=False)
        native = torch.sigmoid(logits)[0, 0].cpu().numpy()
    scores = align_map(native, (image.height, image.width))
    return scores, native, time.perf_counter() - started


if __name__ == "__main__":
    model, seconds = load_model()
    manifest = json.loads((ROOT / "datasets/opensdi-pilot-v1/manifest.json").read_text())
    with Image.open(ROOT / "datasets/opensdi-pilot-v1" / manifest[0]["image"]) as source:
        scores, native, elapsed = infer(model, source.convert("RGB"))
    print(json.dumps(dict(load_seconds=seconds, inference_seconds=elapsed,
                         shape=scores.shape, minimum=float(scores.min()), maximum=float(scores.max()))))
