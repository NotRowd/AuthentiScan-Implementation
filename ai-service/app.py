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
from model_metadata import ModelMetadata, load_model_metadata
from model_service import (
    classify_score,
    load_authentiscan_model,
    preprocess_image,
    uncertainty_margin_from_environment,
    verified_image_format,
)


MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
HEATMAP_DIRECTORY = Path(__file__).parent / "generated-heatmaps"
HEATMAP_DIRECTORY.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    metadata = load_model_metadata()
    app.state.model_metadata = metadata
    app.state.model = load_authentiscan_model(metadata)
    yield


app = FastAPI(
    title="AuthentiScan AI Service",
    version="0.1.0",
    lifespan=lifespan,
)
app.mount("/heatmaps", StaticFiles(directory=HEATMAP_DIRECTORY), name="heatmaps")


@app.get("/health")
def health(request: Request):
    metadata: ModelMetadata | None = getattr(request.app.state, "model_metadata", None)
    return {
        "success": True,
        "service": "authentiscan-ai",
        "model_loaded": hasattr(request.app.state, "model"),
        "model_version": metadata.model_version if metadata else None,
        "architecture": metadata.architecture if metadata else None,
        "input_size": list(metadata.input_size) if metadata else None,
        "label_mapping": metadata.class_indices if metadata else None,
        "gradcam_configured": metadata is not None,
    }


@app.post("/predict")
async def predict(request: Request, image: UploadFile = File(...)):
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="An image file is required.")
    if len(image_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Image must not be larger than 10 MB.")

    metadata: ModelMetadata = request.app.state.model_metadata

    try:
        # Postman and other clients may label a valid local file as octet-stream.
        # The image bytes, rather than the client-provided MIME header, are authoritative.
        verified_image_format(image_bytes)
        model_input, original_rgb = preprocess_image(image_bytes, metadata.input_size)
    except ValueError as error:
        status_code = 415 if str(error) == "Only JPEG, PNG, and WebP images are allowed." else 400
        raise HTTPException(status_code=status_code, detail=str(error)) from error

    model = request.app.state.model
    positive_score = float(model.predict(model_input, verbose=0)[0][0])
    result = classify_score(
        positive_score,
        metadata.positive_label,
        uncertainty_margin_from_environment(),
    )

    heatmap = generate_gradcam(model, model_input, metadata.gradcam)
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
            "model_version": metadata.model_version,
            "positive_class": metadata.positive_label,
            "positive_score": positive_score,
        }
    )

    return {"success": True, "data": result}
