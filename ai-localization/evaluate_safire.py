"""Isolated SAFIRE development screen. Never updates application results."""
import argparse
import ctypes
import csv
import gc
import hashlib
import json
from pathlib import Path
import random
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'vendor/SAFIRE'
REVISION = 'ec2af6af8c789fb6359493a3e352f89c6fd8107f'
PATCH_FILE = 'segment_anything/modeling/image_encoder_with_adaptor.py'
PATCH_HASH = '7165f8e0d11003ad359e25c934df94325d5d4c3aad9c324eee835dc5f29ec471'
WEIGHT_HASH = '65bdf6880380162d57f77d71b3fd367c3f16aebca316f942a821da16e9225b12'
DATA = ROOT / 'datasets/opensdi-pilot-v1'


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def free_memory():
    class Memory(ctypes.Structure):
        _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong)] + [
            (name, ctypes.c_ulonglong) for name in ('total', 'available', 'page_total',
                'page_available', 'virtual_total', 'virtual_available', 'extended')]
    info = Memory()
    info.length = ctypes.sizeof(info)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(info)):
        raise RuntimeError('Cannot check available RAM')
    return info.available


def checked_path(root, relative, digest):
    root = Path(root).resolve()
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or not path.is_file() or sha(path) != digest:
        raise ValueError('Missing, unsafe or mismatched image/mask')
    return path


def select_records(records, per_group):
    if not 1 <= per_group <= 20:
        raise ValueError('Screen size must be between 1 and 20 per group')
    selected = []
    for group in ('partial', 'authentic', 'full'):
        members = [r for r in records if r['group'] == group]
        if len(members) < per_group:
            raise ValueError('Missing screening group')
        selected.extend(members[:per_group])
    if len({r['id'] for r in selected}) != len(selected):
        raise ValueError('Duplicate sample IDs')
    return selected


def tgif_development_records():
    """Fixed first training source only; never open validation or sealed test images."""
    root = ROOT / 'datasets/supervised-localization-v1'
    with (root / 'training-manifest.csv').open(newline='', encoding='utf-8') as handle:
        rows = [r for r in csv.DictReader(handle) if r['split'] == 'train']
    if not rows:
        raise ValueError('No training cohort')
    source = rows[0]['source_id']
    hashes = json.loads((root / 'asset-sha256.json').read_text())
    selected = []
    for condition in ('authentic_control', 'segm_flux1dev', 'random_flux1dev'):
        matches = [r for r in rows if r['source_id'] == source and r['condition'] == condition]
        if len(matches) != 1:
            raise ValueError('Incomplete fixed development source')
        item = matches[0]
        selected.append(dict(id=item['sample_id'], generator=item['generator'],
            group='authentic' if condition == 'authentic_control' else 'partial',
            image=item['image'], truth=item['mask'],
            input_sha256=hashes[item['image']], truth_sha256=hashes[item['mask']]))
    return root, selected


def load_model():
    import torch
    if subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip() != REVISION:
        raise ValueError('Unexpected SAFIRE revision')
    changed = subprocess.check_output(['git', '-C', str(SOURCE), 'diff', 'HEAD', '--name-only'], text=True).splitlines()
    if changed != [PATCH_FILE] or sha(SOURCE / PATCH_FILE) != PATCH_HASH:
        raise ValueError('Unexpected upstream modifications')
    weights = ROOT / 'weights/safire/safire.pth'
    if sha(weights) != WEIGHT_HASH:
        raise ValueError('Checkpoint mismatch')
    sys.path.insert(0, str(SOURCE))
    from segment_anything import sam_model_registry
    from networks.safire_model import AdaptorSAM
    torch.set_num_threads(2)
    torch.manual_seed(20261021)
    # Empty constructor checkpoint prevents upstream torch.load/download calls.
    # The complete fine-tuned checkpoint below must populate EVERY model key.
    base = sam_model_registry['vit_b_adaptor'](checkpoint='')
    model = AdaptorSAM(base.image_encoder, base.mask_decoder, base.prompt_encoder).cpu()
    checkpoint = torch.load(weights, map_location='cpu', weights_only=True, mmap=True)
    state = {key.removeprefix('module.'): value for key, value in checkpoint['model'].items()}
    if len(state) != len(checkpoint['model']):
        raise ValueError('Duplicate checkpoint keys')
    model.load_state_dict(state, strict=True)
    del checkpoint, state, base
    return model.eval()


def infer(model, image):
    import cv2
    import numpy as np
    import torch
    from networks.safire_predictor_binary import SafirePredictor
    # Match upstream CoreDataset default: resize the whole image to 1024 square.
    # Never crop to ground truth or to a classifier/Grad-CAM region.
    resized = cv2.resize(np.asarray(image.convert('RGB')), (1024, 1024))
    np.random.seed(20261021)
    random.seed(20261021)
    torch.manual_seed(20261021)
    predictor = SafirePredictor(model, points_per_side=16, points_per_batch=4,
        pred_iou_thresh=0, stability_score_thresh=0.0, box_nms_thresh=0.0)
    start = time.monotonic()
    with torch.inference_mode():
        annotations, raw, indices = predictor.safire_predict(resized)
    raw = np.asarray(raw, dtype=np.float32)
    if raw.shape != (1024, 1024) or not np.isfinite(raw).all() or raw.min() < 0 or raw.max() > 1:
        raise ValueError('Invalid forensic score map')
    # Map the scores back through the same whole-image resize, not min/max scaling.
    aligned = cv2.resize(raw, image.size, interpolation=cv2.INTER_LINEAR)
    info = dict(seconds=time.monotonic()-start, proposal_count=len(annotations),
                selected_indices=[int(i) for i in indices],
                empty_proposals=sum(int(a['area'] == 0) for a in annotations),
                nonfinite_proposal_features=sum(int(not torch.isfinite(a['avg_feat']).all())
                                               for a in annotations))
    predictor.predictor.reset_image()
    return aligned, raw, info


def main():
    import numpy as np
    from PIL import Image
    from localization import pixel_metrics, overlay
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--per-group', type=int, default=2)
    parser.add_argument('--cohort', choices=('opensdi', 'tgif-train'), default='opensdi')
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Use a new output directory')
    if free_memory() < 4 * 1024**3:
        raise RuntimeError('Need at least 4 GiB free RAM; stop application AI services first')
    if args.cohort == 'tgif-train':
        data_root, records = tgif_development_records()
    else:
        data_root = DATA
        records = select_records(json.loads((DATA / 'manifest.json').read_text()), args.per_group)
    # Validate all inputs before loading the model. Ground truth never enters infer().
    for row in records:
        checked_path(data_root, row['image'], row['input_sha256'])
        checked_path(data_root, row['truth'], row['truth_sha256'])
    args.output.mkdir(parents=True)
    report = dict(candidate='SAFIRE CPU screen', source_revision=REVISION,
        checkpoint_sha256=WEIGHT_HASH, cpu_patch_sha256=PATCH_HASH,
        threshold=0.5, points_per_side=16, points_per_batch=4, seed=20261021,
        preprocessing='upstream OpenCV 1024-square resize; scores bilinearly restored',
        cohort=args.cohort, release_approved=False,
        scope='Inspected development data, not release validation',
        rows=[])
    report_file = args.output / 'results.json'
    report_file.write_text(json.dumps(report, indent=2), encoding='utf-8')
    model = load_model()
    print('SAFIRE loaded strictly on CPU; app services unchanged.', flush=True)
    for item in records:
        row = {key: item[key] for key in ('id', 'generator', 'group', 'input_sha256')}
        print('Evaluating ' + item['id'], flush=True)
        try:
            if free_memory() < 3 * 1024**3:
                raise RuntimeError('Insufficient free RAM for next image')
            with Image.open(checked_path(data_root, item['image'], item['input_sha256'])) as source:
                if source.getexif().get(274, 1) != 1:
                    raise ValueError('Orientation requires separate review')
                image = source.convert('RGB')
            scores, raw, info = infer(model, image)
            folder = args.output / item['id']
            folder.mkdir()
            np.savez_compressed(folder/'scores.npz', scores=scores, native=raw)
            overlay(image, scores, 0.5).save(folder/'overlay.png')
            with Image.open(checked_path(data_root, item['truth'], item['truth_sha256'])) as source:
                truth = np.asarray(source.convert('L'))
            if not np.isin(truth, [0, 255]).all():
                raise ValueError('Non-binary ground truth')
            metrics = pixel_metrics(scores, truth//255, 0.5)
            if item['group'] == 'authentic':
                metrics['dice'] = metrics['iou'] = None
            row.update(status='ok', metrics=metrics, **info)
        except Exception as error:
            row.update(status='failed', error=f'{type(error).__name__}: {error}')
        report['rows'].append(row)
        report_file.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(row), flush=True)
        gc.collect()
    if any(r['status'] != 'ok' for r in report['rows']):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
