"""Download official pretrained weights once, with TorchVision hash verification."""
import hashlib
import json
import torch
from model import WEIGHTS, MODEL_DIR, CHECKPOINT, load_detector

if __name__ == '__main__':
    torch.hub.set_dir(str(MODEL_DIR))
    WEIGHTS.get_state_dict(progress=True, check_hash=True)
    load_detector()
    print(json.dumps({'ready': True, 'weights': CHECKPOINT.name, 'sha256': hashlib.sha256(CHECKPOINT.read_bytes()).hexdigest()}))
