"""Candidate-only pixels: EXIF orientation, white alpha, RGB, bilinear 224.

Not installed in the working app. Train, evaluate, calibrate and serve the NEW
candidate with this exact module. Never silently apply it to the older model.
EfficientNet owns normalization; model inputs stay float32 in [0, 255].
"""
from io import BytesIO
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

PREPROCESSING_VERSION = "exif-white-rgb-pillow-bilinear-224-v2"
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
            oriented = ImageOps.exif_transpose(image)
            rgba = oriented.convert("RGBA")
            white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            original = np.asarray(Image.alpha_composite(white, rgba).convert("RGB"), dtype=np.uint8)
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as error:
        raise ValueError("The uploaded file is not a valid supported image.") from error
    resized = Image.fromarray(original).resize(IMAGE_SIZE, Image.Resampling.BILINEAR)
    return np.asarray(resized, dtype=np.float32)[None], original


def load_model_image(path: Path) -> np.ndarray:
    if path.stat().st_size > MAX_FILE_SIZE_BYTES:
        raise ValueError("Image exceeds 10 MB.")
    return decode_image(path.read_bytes())[0][0]
