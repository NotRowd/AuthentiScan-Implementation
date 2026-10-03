"""Runtime policy loading and score classification for AuthentiScan."""

from __future__ import annotations

import json
import math
import hashlib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class InferencePolicy:
    model_version: str
    threshold: float
    uncertainty_margin: float
    positive_class: str
    gradcam_base_layer: str
    gradcam_last_conv_layer: str
    gradcam_pooling_layer: str
    gradcam_dropout_layer: str
    gradcam_output_layer: str
    policy_version: str = "unversioned"


def load_policy(path: Path) -> InferencePolicy:
    if not path.is_file():
        raise FileNotFoundError(f"Inference policy was not found: {path}")
    raw = json.loads(path.read_text(encoding="utf-8"))
    threshold = float(raw["threshold"])
    margin = float(raw["uncertainty_margin"])
    if not 0 < threshold < 1:
        raise ValueError("Inference policy threshold must be between 0 and 1.")
    if not 0 <= margin < 0.5:
        raise ValueError("Inference policy uncertainty_margin must be between 0 and 0.5.")
    if raw["positive_class"] != "authentic":
        raise ValueError("AuthentiScan's EfficientNet output must use authentic as the positive class.")
    gradcam = raw["gradcam"]
    return InferencePolicy(
        model_version=str(raw["model_version"]),
        threshold=threshold,
        uncertainty_margin=margin,
        positive_class="authentic",
        gradcam_base_layer=str(gradcam["base_model_layer"]),
        gradcam_last_conv_layer=str(gradcam["last_conv_layer"]),
        gradcam_pooling_layer=str(gradcam["pooling_layer"]),
        gradcam_dropout_layer=str(gradcam["dropout_layer"]),
        gradcam_output_layer=str(gradcam["output_layer"]),
        policy_version="sha256:" + hashlib.sha256(
            json.dumps(raw, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()[:16],
    )


def classify_authentic_score(score: float, policy: InferencePolicy) -> dict[str, float | str]:
    authentic_score = float(score)
    if not math.isfinite(authentic_score) or not 0 <= authentic_score <= 1:
        raise ValueError("Model score must be finite and between 0 and 1.")
    ai_generated_score = 1.0 - authentic_score
    distance = abs(authentic_score - policy.threshold)
    if distance <= policy.uncertainty_margin or math.isclose(
        distance, policy.uncertainty_margin, rel_tol=0, abs_tol=1e-12
    ):
        verdict = "uncertain"
    elif authentic_score >= policy.threshold:
        verdict = "authentic"
    else:
        verdict = "ai_generated"
    return {
        "verdict": verdict,
        # Keep a numeric field for older clients; the semantics are explicit.
        "confidence_score": (authentic_score if verdict == "authentic" else
                             ai_generated_score if verdict == "ai_generated" else
                             max(authentic_score, ai_generated_score)),
        "confidence_kind": "max_class_score_no_verdict" if verdict == "uncertain" else "verdict_class_score",
        "authentic_score": authentic_score,
        "ai_generated_score": ai_generated_score,
        "decision_threshold": policy.threshold,
        "uncertainty_margin": policy.uncertainty_margin,
    }
