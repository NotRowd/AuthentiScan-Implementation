"""CPU-only object context. No authenticity score or manipulated-region claims."""
from io import BytesIO
from pathlib import Path
import hashlib
import math
import os
import re
import warnings

from PIL import Image
import torch
from torchvision.models.detection import ssdlite320_mobilenet_v3_large, SSDLite320_MobileNet_V3_Large_Weights

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / '.detector-models'
WEIGHTS = SSDLite320_MobileNet_V3_Large_Weights.COCO_V1
MODEL_VERSION = 'ssdlite320-mobilenetv3-coco-v1'
THRESHOLD = 0.5
MAX_DETECTIONS = 20
MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 16_000_000
CHECKPOINT = MODEL_DIR / 'checkpoints' / WEIGHTS.url.rsplit('/', 1)[-1]


def load_detector():
    # Download is an explicit setup step, never a request-time side effect.
    if not CHECKPOINT.is_file():
        raise RuntimeError('Run detector/setup.py first; pretrained weights are missing.')
    expected = re.search(r'-([a-f0-9]+)\.pth$', CHECKPOINT.name).group(1)
    if not hashlib.sha256(CHECKPOINT.read_bytes()).hexdigest().startswith(expected):
        raise RuntimeError('Detector checkpoint checksum does not match official weights.')
    torch.set_num_threads(max(1, min(2, os.cpu_count() or 1)))
    model = ssdlite320_mobilenet_v3_large(weights=None, weights_backbone=None, num_classes=len(WEIGHTS.meta['categories']))
    model.load_state_dict(torch.load(CHECKPOINT, map_location='cpu', weights_only=True))
    return model.eval()


def decode_image(data):
    if not data or len(data) > MAX_BYTES:
        raise ValueError('Use an image up to 10 MB.')
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        with Image.open(BytesIO(data)) as image:
            if image.format not in {'JPEG', 'PNG', 'WEBP'} or getattr(image, 'n_frames', 1) != 1:
                raise ValueError('Use a non-animated JPEG, PNG, or WebP.')
            if image.width * image.height > MAX_PIXELS:
                raise ValueError('Image exceeds 16 million pixels.')
            image.verify()
        with Image.open(BytesIO(data)) as image:
            # Match the current classifier/Grad-CAM pixel orientation exactly.
            # The web provides a metadata-stripped model-orientation preview.
            return image.convert('RGB')


def serialize_prediction(prediction, width, height):
    categories = WEIGHTS.meta['categories']
    objects = []
    for score, label, box in zip(prediction['scores'].tolist(), prediction['labels'].tolist(), prediction['boxes'].tolist()):
        if not math.isfinite(score) or not THRESHOLD <= score <= 1 or not isinstance(label, int) or not 0 < label < len(categories):
            continue
        if categories[label] == 'N/A' or len(box) != 4 or not all(math.isfinite(x) for x in box):
            continue
        x1, y1, x2, y2 = [max(0., min(1., value / size)) for value, size in zip(box, [width, height, width, height])]
        if x2 <= x1 or y2 <= y1:
            continue
        objects.append({'label': categories[label], 'class_id': label, 'score': float(score), 'box': [x1, y1, x2, y2]})
    objects.sort(key=lambda item: item['score'], reverse=True)
    return {'schema_version': 1, 'status': 'available', 'model_version': MODEL_VERSION,
            'dataset': 'COCO', 'threshold': THRESHOLD, 'max_detections': MAX_DETECTIONS,
            'image_width': width, 'image_height': height, 'coordinate_space': 'normalized_xyxy_raw_rgb',
            'objects': objects[:MAX_DETECTIONS], 'truncated': len(objects) > MAX_DETECTIONS}


def detect(model, data):
    image = decode_image(data)
    with torch.inference_mode():
        prediction = model([WEIGHTS.transforms()(image)])[0]
    return serialize_prediction(prediction, *image.size)
