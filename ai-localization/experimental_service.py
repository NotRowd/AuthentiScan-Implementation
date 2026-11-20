"""Explicitly opt-in prototype inference. A failed candidate is never release-approved."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import torch

from localizer_service import ROOT, SCOPE, decode_upright, make_server, pack_prediction
from supervised_localizer import ARCHITECTURE, REVISION, FeatureExtractor, MaskHead, sha

MODEL = 'supervised-dinov2s14-flux1dev-v1-experimental'
HEAD_SHA = 'a5568dc4839b10c72074e70978ffe435e66560e2f13d03d5a931e0277068abad'
REPORT_SHA = '74050e3fb242813511f28ac3ca8b353a1f53099718ea01b38641de3d8cb59ada'
OUTPUT = ROOT / 'runs/supervised-cpu-2026-10-10/training-output'


def load_candidate(output=OUTPUT):
    if sha(output / 'best-head.pt') != HEAD_SHA or sha(output / 'validation-report.json') != REPORT_SHA:
        raise ValueError('Experimental candidate artifacts changed; update the version and review before use')
    report = json.loads((output / 'validation-report.json').read_text())
    if (report.get('architecture') != ARCHITECTURE or report.get('head_sha256') != HEAD_SHA
            or report.get('status') != 'validation_gate_failed' or report.get('release_approved') is not False
            or report.get('threshold') != .97):
        raise ValueError('Experimental validation provenance mismatch')
    profile = dict(model_version=MODEL, head_sha256=HEAD_SHA, validation_sha256=REPORT_SHA,
                   usage_mode='experimental', validation_status='failed', release_approved=False,
                   threshold=report['threshold'], scope=SCOPE)
    fingerprint = hashlib.sha256(json.dumps(profile, sort_keys=True).encode()).hexdigest()
    return profile, fingerprint


def experimental_prediction(scores, threshold, size, digest, profile_hash):
    values = np.asarray(scores)
    if not np.isfinite(values).all() or values.min() < 0 or values.max() > 1:
        raise ValueError('Invalid experimental score range')
    result = pack_prediction(values, threshold, size, digest, profile_hash)
    result.update(model_version=MODEL, usage_mode='experimental', validation_status='failed',
                  release_approved=False, model_sha256=HEAD_SHA)
    # Preserve absolute scores for an explicitly unvalidated display preview.
    # Never stretch each image to 0..1 or replace the locked decision mask.
    result.update(score_scale=10000, score_grid=np.rint(values * 10000).astype(int).ravel().tolist())
    return result


class ExperimentalLocalizer:
    model_version = MODEL
    usage_mode = 'experimental'
    validation_status = 'failed'
    score_preview_version = 1

    def __init__(self, *, allow_failed_validation=False):
        if not allow_failed_validation:
            raise ValueError('Experimental use requires an explicit opt-in')
        self.profile, self.profile_hash = load_candidate()
        torch.set_num_threads(2)
        self.extractor = FeatureExtractor(ROOT / f'weights/hub/facebookresearch_dinov2_{REVISION}',
                                         ROOT / 'weights/hub/checkpoints/dinov2_vits14_pretrain.pth', 'cpu')
        self.model = MaskHead()
        self.model.load_state_dict(torch.load(OUTPUT / 'best-head.pt', map_location='cpu', weights_only=True), strict=True)
        self.model.eval().requires_grad_(False)

    @torch.inference_mode()
    def predict(self, payload):
        original = decode_upright(payload)  # Validate format, size and orientation before inference.
        features = torch.from_numpy(self.extractor(payload).astype(np.float32)).unsqueeze(0)
        scores = self.model(features).sigmoid().numpy()[0, 0]
        return experimental_prediction(scores, self.profile['threshold'], original.size,
                                       hashlib.sha256(payload).hexdigest(), self.profile_hash)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--experimental', action='store_true', required=True)
    parser.add_argument('--port', type=int, default=5004)
    args = parser.parse_args()
    engine = ExperimentalLocalizer(allow_failed_validation=args.experimental)
    print('Experimental localization loaded. VALIDATION FAILED; prototype only, not reliable manipulation evidence.', flush=True)
    make_server(args.port, engine).serve_forever()
