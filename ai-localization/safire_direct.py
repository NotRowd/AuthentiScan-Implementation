"""Isolated prompt-free SAFIRE decoder adaptation; never a production model."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from torch import nn
from torch.nn import functional as F

from evaluate_safire import ROOT, checked_path, load_model, sha
from supervised_localizer import training_rows, operating_metrics

VERSION = 'safire-frozen-forensic-encoder-direct-decoder-v1'
DATA = ROOT / 'datasets/supervised-localization-v1'
CONDITIONS = {'authentic_control', 'segm_flux1dev', 'random_flux1dev'}
SEED = 20261021


def verified_rows(data=DATA):
    rows = training_rows(data)
    hashes = json.loads((data / 'asset-sha256.json').read_text())
    families = {}
    for row in rows:
        family = families.setdefault(row['source_id'], set())
        if row['condition'] in family or row['condition'] not in CONDITIONS:
            raise ValueError('Duplicate or unsupported condition')
        family.add(row['condition'])
        for key in ('image', 'mask'):
            checked_path(data, row[key], hashes[row[key]])
    if any(group != CONDITIONS for group in families.values()):
        raise ValueError('Incomplete source family')
    return rows, hashes


def image_input(path):
    import cv2
    with Image.open(path) as image:
        if image.getexif().get(274, 1) != 1:
            raise ValueError('Unsupported EXIF orientation')
        pixels = cv2.resize(np.asarray(image.convert('RGB')), (1024, 1024))
    return torch.from_numpy(pixels.copy()).permute(2, 0, 1).unsqueeze(0).float()


def target_mask(path):
    with Image.open(path) as image:
        value = np.asarray(image.convert('L'))
    if value.shape != (448, 448) or not np.isin(value, [0, 255]).all():
        raise ValueError('Expected prepared 448-square binary mask')
    return torch.from_numpy(value.copy()).float().div(255).unsqueeze(0).unsqueeze(0)


class DirectDecoder(nn.Module):
    """No user prompts, classifier labels or reference images enter inference."""
    def __init__(self, model):
        super().__init__()
        self.decoder = model.mask_decoder
        self.decoder.requires_grad_(True)
        # Quality head is not supervised and must not be exposed as confidence.
        self.decoder.iou_prediction_head.requires_grad_(False)
        with torch.no_grad():
            sparse, dense = model.prompt_encoder(points=None, boxes=None, masks=None)
            pe = model.prompt_encoder.get_dense_pe()
        self.register_buffer('sparse', sparse.clone())
        self.register_buffer('dense', dense.clone())
        self.register_buffer('pe', pe.clone())

    def forward(self, features):
        if features.ndim != 4 or tuple(features.shape[1:]) != (256, 64, 64):
            raise ValueError('Unexpected forensic feature shape')
        batch = features.shape[0]
        logits, _ = self.decoder(image_embeddings=features, image_pe=self.pe,
            sparse_prompt_embeddings=self.sparse.expand(batch, -1, -1),
            dense_prompt_embeddings=self.dense.expand(batch, -1, -1, -1),
            multimask_output=False)
        return logits


def prepare_model():
    model = load_model().requires_grad_(False)
    direct = DirectDecoder(model)
    return model, direct


def extract(model, path):
    # no_grad, not inference_mode: cached features later participate in autograd.
    with torch.no_grad():
        result = model.image_encoder(model.preprocess(image_input(path)))
    if result.shape != (1, 256, 64, 64) or not torch.isfinite(result).all():
        raise ValueError('Invalid forensic embeddings')
    return result.detach()


def direct_loss(logits, target):
    """Equal-image BCE plus edited-only Dice; authentic images penalize positives."""
    if logits.ndim != 4 or target.ndim != 4 or logits.shape[:2] != target.shape[:2]:
        raise ValueError('Mask shape mismatch')
    logits = F.interpolate(logits, size=target.shape[-2:], mode='bilinear', align_corners=False)
    if not torch.isfinite(logits).all() or not torch.isfinite(target).all():
        raise ValueError('Nonfinite loss inputs')
    if target.min() < 0 or target.max() > 1:
        raise ValueError('Invalid target range')
    bce = F.binary_cross_entropy_with_logits(logits, target)
    p, t = logits.sigmoid().flatten(1), target.flatten(1)
    edited = t.sum(1) > 0
    dice = 1 - (2 * (p*t).sum(1) + 1e-6) / (p.sum(1) + t.sum(1) + 1e-6)
    return bce + (dice[edited].mean() if edited.any() else logits.sum()*0)


def choose_threshold(probabilities, targets, rows):
    p, t = np.asarray(probabilities), np.asarray(targets)
    if (not rows or any(r['split'] != 'validation' for r in rows)
        or {r['condition'] for r in rows} != CONDITIONS
        or p.shape != (len(rows), 448, 448) or t.shape != p.shape
        or not np.isfinite(p).all() or not np.isfinite(t).all()
        or p.min() < 0 or p.max() > 1 or not np.isin(t, [0, 1]).all()):
        raise ValueError('Invalid validation inputs')
    choices = []
    for cutoff in np.linspace(.01, .99, 99):
        groups = operating_metrics(p, t, rows, float(cutoff))
        control = groups['authentic_control']
        if (control['images_with_highlights'] / control['images'] <= .1
                and control['highlighted_area_mean'] <= .01):
            score = float(np.mean([groups[c]['dice'] for c in CONDITIONS - {'authentic_control'}]))
            choices.append((score, float(cutoff), groups))
    if not choices:
        return dict(status='no_acceptable_validation_threshold', release_approved=False)
    score, cutoff, groups = max(choices, key=lambda v: (v[0], v[1]))
    passed = all(groups[c]['dice'] >= .5 for c in CONDITIONS - {'authentic_control'})
    return dict(status='validation_gate_passed_needs_fresh_test' if passed else 'validation_gate_failed',
        threshold=cutoff, edited_macro_dice=score, groups=groups, release_approved=False)
