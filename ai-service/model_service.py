from __future__ import annotations

import os
from io import BytesIO
from pathlib import Path
from typing import Literal

import numpy as np
import tensorflow as tf
from PIL import Image, UnidentifiedImageError

from model_metadata import ModelMetadata

SUPPORTED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
PositiveLabel = Literal["ai_generated", "authentic"]


def load_authentiscan_model(metadata: ModelMetadata) -> tf.keras.Model:
    if not metadata.model_path.is_file():
        raise FileNotFoundError(f"Model file was not found: {metadata.model_path}")

    model = tf.keras.models.load_model(metadata.model_path, compile=False)
    validate_model_contract(model, metadata)
    return model


def validate_model_contract(model: tf.keras.Model, metadata: ModelMetadata) -> None:
    expected_input = (None, metadata.input_size[0], metadata.input_size[1], 3)
    if tuple(model.input_shape) != expected_input:
        raise ValueError(
            f"Model input shape {model.input_shape} does not match metadata {expected_input}."
        )
    if tuple(model.output_shape) != (None, 1):
        raise ValueError("AuthentiScan requires a binary model with output shape (None, 1).")

    base_model = model.get_layer(metadata.gradcam.base_model_layer)
    base_model.get_layer(metadata.gradcam.last_conv_layer)
    for layer_name in (
        metadata.gradcam.pooling_layer,
        metadata.gradcam.dropout_layer,
        metadata.gradcam.output_layer,
    ):
        model.get_layer(layer_name)


def preprocess_image(
    image_bytes: bytes, image_size: tuple[int, int]
) -> tuple[np.ndarray, np.ndarray]:
    """Return model input and the original RGB pixels for a Grad-CAM overlay."""
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            original_rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("The uploaded file is not a valid image.") from error

    resized = Image.fromarray(original_rgb).resize(image_size)

    # The saved EfficientNet model includes its own rescaling/normalization layers.
    model_input = np.expand_dims(np.asarray(resized, dtype=np.float32), axis=0)
    return model_input, original_rgb


def verified_image_format(image_bytes: bytes) -> str:
    """Return a supported image format based on file contents, not its MIME label."""
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image_format = image.format
            image.verify()
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("The uploaded file is not a valid image.") from error

    if image_format not in SUPPORTED_IMAGE_FORMATS:
        raise ValueError("Only JPEG, PNG, and WebP images are allowed.")

    return image_format


def positive_label_from_environment() -> PositiveLabel | None:
    value = os.getenv("AI_POSITIVE_LABEL", "").strip().lower()
    if value in {"ai_generated", "authentic"}:
        return value
    return None


def uncertainty_margin_from_environment() -> float:
    raw_value = os.getenv("AI_UNCERTAINTY_MARGIN", "0.05")

    try:
        margin = float(raw_value)
    except ValueError:
        return 0.05

    return min(max(margin, 0.0), 0.49)


def classify_score(
    positive_score: float,
    positive_label: PositiveLabel,
    uncertainty_margin: float,
) -> dict[str, float | str]:
    """Map a binary sigmoid score to AuthentiScan's agreed response fields."""
    positive_score = min(max(float(positive_score), 0.0), 1.0)

    if positive_label == "ai_generated":
        ai_generated_score = positive_score
        authentic_score = 1.0 - positive_score
    else:
        authentic_score = positive_score
        ai_generated_score = 1.0 - positive_score

    if abs(positive_score - 0.5) <= uncertainty_margin:
        verdict = "uncertain"
    elif ai_generated_score > authentic_score:
        verdict = "ai_generated"
    else:
        verdict = "authentic"

    return {
        "verdict": verdict,
        "confidence_score": max(authentic_score, ai_generated_score),
        "authentic_score": authentic_score,
        "ai_generated_score": ai_generated_score,
    }
