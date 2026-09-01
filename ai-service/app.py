from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.staticfiles import StaticFiles

load_dotenv(Path(__file__).with_name(".env"))

from gradcam import generate_gradcam, overlay_heatmap
from model_service import (
    classify_score,
    load_authentiscan_model,
    positive_label_from_environment,
    preprocess_image,
    uncertainty_margin_from_environment,
)


MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp"}
HEATMAP_DIRECTORY = Path(__file__).parent / "generated-heatmaps"
MODEL_VERSION = "authentiscan-efficientnet-b0-v2"

HEATMAP_DIRECTORY.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model = load_authentiscan_model()
    yield


app = FastAPI(
    title="AuthentiScan AI Service",
    version="0.1.0",
    lifespan=lifespan,
)
app.mount("/heatmaps", StaticFiles(directory=HEATMAP_DIRECTORY), name="heatmaps")


@app.get("/health")
def health(request: Request):
    return {
        "success": True,
        "service": "authentiscan-ai",
        "model_loaded": hasattr(request.app.state, "model"),
        "label_mapping_configured": positive_label_from_environment() is not None,
    }


@app.post("/predict")
async def predict(request: Request, image: UploadFile = File(...)):
    if image.content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Only JPEG, PNG, and WebP images are allowed.",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="An image file is required.")
    if len(image_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Image must not be larger than 10 MB.")

    positive_label = positive_label_from_environment()
    if positive_label is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "AI_POSITIVE_LABEL must be set to ai_generated or authentic after "
                "the trained-model label mapping is confirmed."
            ),
        )

    try:
        model_input, original_rgb = preprocess_image(image_bytes)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    model = request.app.state.model
    positive_score = float(model.predict(model_input, verbose=0)[0][0])
    result = classify_score(
        positive_score,
        positive_label,
        uncertainty_margin_from_environment(),
    )

    heatmap = generate_gradcam(model, model_input)
    overlay_rgb = overlay_heatmap(heatmap, original_rgb)
    heatmap_name = f"{uuid.uuid4()}.png"
    heatmap_path = HEATMAP_DIRECTORY / heatmap_name
    cv2.imwrite(str(heatmap_path), cv2.cvtColor(overlay_rgb, cv2.COLOR_RGB2BGR))

    result.update(
        {
            "readable_explanation": (
                "The model produced a binary image-authenticity score. "
                "The heatmap highlights image regions that contributed to the positive class."
            ),
            "heatmap_path": f"/heatmaps/{heatmap_name}",
            "model_version": MODEL_VERSION,
            "positive_class": positive_label,
            "positive_score": positive_score,
        }
    )

    return {"success": True, "data": result}
