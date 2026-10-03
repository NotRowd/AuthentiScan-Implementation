"""Run a local, standalone AuthentiScan prediction API.

This service intentionally has no backend or web dependency. A later backend
integration can call its stable `/predict` contract after the model is approved.
"""

from __future__ import annotations

import os
import uuid
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.staticfiles import StaticFiles

from service.gradcam import generate_gradcam, overlay_heatmap, GradCAMUnavailable
from service.policy import InferencePolicy, classify_authentic_score, load_policy
from service.preprocessing import decode_image, MAX_FILE_SIZE_BYTES, PREPROCESSING_VERSION


SERVICE_DIRECTORY = Path(__file__).resolve().parent
HEATMAP_DIRECTORY = SERVICE_DIRECTORY / "generated-heatmaps"
HEATMAP_DIRECTORY.mkdir(exist_ok=True)


def configured_path(variable: str) -> Path:
    value = os.getenv(variable, "").strip()
    if not value:
        raise RuntimeError(f"Set {variable} before starting the AI service.")
    return Path(value)


def validate_model_contract(model: tf.keras.Model, policy: InferencePolicy) -> None:
    if tuple(model.input_shape) != (None, 224, 224, 3):
        raise ValueError("AuthentiScan requires a 224x224 RGB model input.")
    if tuple(model.output_shape) != (None, 1):
        raise ValueError("AuthentiScan requires a binary sigmoid model output.")
    base_model = model.get_layer(policy.gradcam_base_layer)
    base_model.get_layer(policy.gradcam_last_conv_layer)
    for name in (policy.gradcam_pooling_layer, policy.gradcam_dropout_layer, policy.gradcam_output_layer):
        model.get_layer(name)


def explain_prediction(model, model_input, original_rgb, policy, result):
    target = result["verdict"] if result["verdict"] != "uncertain" else None
    metadata = {"status": "unavailable", "target": target, "reason": "uncertain_prediction",
                "method": "gradcam", "palette": "blue-green-yellow-v1", "overlay_alpha": 0.4}
    image_path = None
    if target is not None:
        try:
            heatmap = generate_gradcam(model, model_input, policy, target=target)
            heatmap_name = f"{uuid.uuid4()}.png"
            overlay_heatmap(heatmap, original_rgb).save(HEATMAP_DIRECTORY / heatmap_name)
            image_path = f"/heatmaps/{heatmap_name}"
            metadata.update(status="available", reason=None, source_grid=list(heatmap.shape))
        except GradCAMUnavailable as error:
            metadata["reason"] = str(error)
        except Exception as error:
            # Classification remains usable if optional explanation fails.
            logging.getLogger(__name__).warning("Grad-CAM unavailable (%s)", type(error).__name__)
            metadata["reason"] = "generation_failed"
    explanation = "Class scores are model estimates, not calibrated proof of authenticity or manipulation. "
    if target is None:
        explanation += "The decision is uncertain; no single-class heatmap is shown."
    elif image_path:
        explanation += f"The heatmap explains the {target.replace('_', '-')} score, not exact edited regions."
    else:
        explanation += "No usable heatmap is available; this does not prove the image is authentic."
    return {"gradcam": metadata, "heatmap_path": image_path, "readable_explanation": explanation}


@asynccontextmanager
async def lifespan(app: FastAPI):
    policy = load_policy(configured_path("AUTHENTISCAN_POLICY_PATH"))
    model = tf.keras.models.load_model(configured_path("AUTHENTISCAN_MODEL_PATH"), compile=False)
    validate_model_contract(model, policy)
    app.state.policy = policy
    app.state.model = model
    yield


app = FastAPI(title="AuthentiScan AI Foundation", version="0.3.0", lifespan=lifespan)
app.mount("/heatmaps", StaticFiles(directory=HEATMAP_DIRECTORY), name="heatmaps")


@app.get("/health")
def health(request: Request):
    policy: InferencePolicy = request.app.state.policy
    return {
        "success": True,
        "service": "authentiscan-ai-foundation",
        "model_loaded": hasattr(request.app.state, "model"),
        "model_version": policy.model_version,
        "architecture": "EfficientNetB0",
        "input_size": [224, 224],
        "class_mapping": {"fake": 0, "real": 1},
        "decision_threshold": policy.threshold,
        "uncertainty_margin": policy.uncertainty_margin,
        "gradcam_configured": True,
        "inference_contract_version": 2,
        "preprocessing_version": PREPROCESSING_VERSION,
        "policy_version": policy.policy_version,
    }


@app.post("/predict")
async def predict(request: Request, image: UploadFile = File(...)):
    image_bytes = await image.read(MAX_FILE_SIZE_BYTES + 1)
    if not image_bytes:
        raise HTTPException(status_code=400, detail="An image file is required.")
    if len(image_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Image must not be larger than 10 MB.")
    try:
        model_input, original_rgb = decode_image(image_bytes)
    except ValueError as error:
        code = 415 if str(error) == "Only JPEG, PNG, and WebP images are allowed." else 400
        raise HTTPException(status_code=code, detail=str(error)) from error

    model: tf.keras.Model = request.app.state.model
    policy: InferencePolicy = request.app.state.policy
    authentic_score = float(model.predict(model_input, verbose=0)[0][0])
    try:
        result = classify_authentic_score(authentic_score, policy)
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Model returned an invalid score.") from error
    result.update(explain_prediction(model, model_input, original_rgb, policy, result))
    result.update(
        {
            "model_version": policy.model_version,
            "positive_class": policy.positive_class,
            "inference_contract_version": 2,
            "preprocessing_version": PREPROCESSING_VERSION,
            "policy_version": policy.policy_version,
        }
    )
    return {"success": True, "data": result}
