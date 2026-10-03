"""Versioned inference preprocessing, shared by offline evaluation and training.

Preserves existing API pixels: RGB conversion, no EXIF rotation/compositing,
Pillow bilinear resize, float32 0..255. The model owns normalization.
"""
from io import BytesIO
from pathlib import Path
import numpy as np
from PIL import Image, UnidentifiedImageError

PREPROCESSING_VERSION = "rgb-pillow-bilinear-224-v1"
IMAGE_SIZE = (224, 224)
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 16_000_000
SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP"}


def decode_image(image_bytes: bytes) -> tuple[np.ndarray, np.ndarray]:
    if not image_bytes or len(image_bytes) > MAX_FILE_SIZE_BYTES:
        raise ValueError("Image must contain data and be no larger than 10 MB.")
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            if image.format not in SUPPORTED_FORMATS:
                raise ValueError("Only JPEG, PNG, and WebP images are allowed.")
            if image.width * image.height > MAX_PIXELS or getattr(image, "n_frames", 1) != 1:
                raise ValueError("Use a non-animated image up to 16 million pixels.")
            image.verify()
        with Image.open(BytesIO(image_bytes)) as image:
            original = np.asarray(image.convert("RGB"), dtype=np.uint8)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError("The uploaded file is not a valid supported image.") from error
    resized = Image.fromarray(original).resize(IMAGE_SIZE, Image.Resampling.BILINEAR)
    return np.asarray(resized, dtype=np.float32)[None], original


def load_model_image(path: Path) -> np.ndarray:
    if path.stat().st_size > MAX_FILE_SIZE_BYTES:
        raise ValueError("Image exceeds 10 MB.")
    return decode_image(path.read_bytes())[0][0]
