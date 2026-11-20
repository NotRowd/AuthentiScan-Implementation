"""Isolated FUSED CPU smoke screen on nine fixed development images.

No retraining, threshold search, production mutation, network, or sealed test data.
This is a compatibility/development screen, not a release accuracy certificate.
"""
import argparse
import csv
import hashlib
import inspect
import json
import os
from pathlib import Path
import socket
import sys
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
CANDIDATE = ROOT / 'candidates/fused-v1'
DATA = ROOT / 'datasets/supervised-localization-v1'
SOURCES = ('tgif2-724', 'tgif2-5992', 'tgif2-11122')
SOFAKE = ('fused_sofake.pth', 319861822, '0f9273ba9d48b1a6de0d2b602c7a26cdd3624967f465ff0683668ef9c4359ad3')


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def verify_assets(checkpoint='opensdi'):
    from prepare_fused_candidate import ASSETS, COMMIT, SOURCE_SHA256
    manifest = json.loads((CANDIDATE / 'assets.json').read_text(encoding='utf-8'))
    if manifest['source_commit'] != COMMIT:
        raise ValueError('Unexpected source revision')
    if digest(CANDIDATE / f'FUSED-{COMMIT}.zip') != SOURCE_SHA256:
        raise ValueError('Source archive checksum mismatch')
    # Anchor source to the pinned downloaded archive, not editable manifest hashes.
    import zipfile
    with zipfile.ZipFile(CANDIDATE / f'FUSED-{COMMIT}.zip') as archive:
        for item in archive.infolist():
            if item.is_dir():
                continue
            relative = Path(*Path(item.filename).parts[1:])
            target = (CANDIDATE / 'source' / relative).resolve()
            if not target.is_relative_to((CANDIDATE / 'source').resolve()):
                raise ValueError('Unsafe source path')
            if digest(target) != hashlib.sha256(archive.read(item)).hexdigest():
                raise ValueError('Upstream source modified: ' + str(relative))
    for name, _, _, size, sha in ASSETS:
        if checkpoint == 'sofake' and name == 'fused_opensdi.pth':
            continue
        path = CANDIDATE / name
        if path.stat().st_size != size or digest(path) != sha:
            raise ValueError('Model integrity mismatch: ' + name)
    if checkpoint == 'sofake':
        path = CANDIDATE / SOFAKE[0]
        if path.stat().st_size != SOFAKE[1] or digest(path) != SOFAKE[2]:
            raise ValueError('Multi-generator checkpoint integrity mismatch')
    return manifest


def memory_guard(minimum_gib):
    from fused_platform import free_memory_bytes
    available = free_memory_bytes() / 1024**3
    if available < minimum_gib:
        raise RuntimeError(f'Need {minimum_gib} GiB free RAM, have {available:.2f}')
    return available


def offline(*args, **kwargs):
    raise RuntimeError('Network access is disabled in FUSED evaluation')


def reviewed_config(saved, allowed, checkpoint):
    """Accept only the reviewed legacy fields of the hash-pinned checkpoints."""
    ignored = {key: value for key, value in saved.items() if key not in allowed}
    expected = {'_target_': 'fused.model.model.FUSED', 'enable_seg': True,
        'fusion_mode': 'self_attn', 'moe_before_sa': True,
        'seg_decoder_mode': 'joint', 'convnext_input_size': 512}
    kwargs = {key: value for key, value in saved.items() if key in allowed}
    if checkpoint == 'sofake':
        # SOFAKE uses older names. The published implementation has eight query
        # latents, MHA pooling, final attention pooling and no global mask bias.
        # Explicitly bind the query count instead of relying on its default.
        expected.update(attention_branches=8, pooling='mha',
                        final_pooling='attn', seg_global_bias=False)
        if 'num_latents' in saved:
            raise ValueError('Unexpected duplicate SOFAKE query-count setting')
        kwargs['num_latents'] = 8
    elif checkpoint != 'opensdi':
        raise ValueError('Unknown checkpoint')
    if ignored != expected or saved.get('pretrained_path', 'missing') is not None:
        raise ValueError('Unreviewed checkpoint architecture settings: ' + repr(ignored))
    return kwargs, ignored


def load_model(require_author_runtime=False, checkpoint='opensdi'):
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    if not require_author_runtime:
        sys.path.insert(0, str(CANDIDATE / 'runtime-packages'))
    sys.path.insert(0, str(CANDIDATE / 'source'))
    import torch
    import timm
    import torchvision
    import numpy
    import PIL
    from safetensors.torch import load_file
    from fused.model.model import FUSED
    if timm.__version__ != '1.0.24':
        raise RuntimeError('Wrong isolated timm version')
    versions = dict(torch=torch.__version__, torchvision=torchvision.__version__,
        timm=timm.__version__, numpy=numpy.__version__, pillow=PIL.__version__)
    if require_author_runtime:
        expected = dict(torch='2.9.1', torchvision='0.24.1', timm='1.0.24', numpy='1.26.4', pillow='12.1.0')
        if any(versions[key].split('+')[0] != value for key, value in expected.items()):
            raise RuntimeError('Author inference dependency version mismatch: ' + str(versions))
    torch.set_num_threads(4)
    weight_file = CANDIDATE / ('fused_opensdi.pth' if checkpoint == 'opensdi' else SOFAKE[0])
    if checkpoint == 'sofake' and (weight_file.stat().st_size != SOFAKE[1] or digest(weight_file) != SOFAKE[2]):
        raise ValueError('Multi-generator checkpoint integrity mismatch')
    raw = torch.load(weight_file, map_location='cpu', weights_only=True, mmap=True)
    saved = raw['cfg']['model']
    allowed = set(inspect.signature(FUSED.__init__).parameters) - {'self'}
    constructor_config, ignored_config = reviewed_config(saved, allowed, checkpoint)
    create = timm.create_model
    def local_backbone(name, **kwargs):
        if name != 'convnext_xxlarge.clip_laion2b_soup' or kwargs != {'pretrained': True, 'num_classes': 0}:
            raise ValueError('Unexpected backbone request')
        # Meta construction avoids a second 3.4 GB allocation. All retained tensors
        # are assigned from the exact safetensors checkpoint with strict checking.
        with torch.device('meta'):
            backbone = create(name, pretrained=False, num_classes=0)
        state = load_file(str(CANDIDATE / 'model.safetensors'), device='cpu')
        for key in ('head.fc.weight', 'head.fc.bias'):
            state.pop(key, None)  # Same unused classifier removal as timm num_classes=0.
        backbone.load_state_dict(state, strict=True, assign=True)
        if any(value.is_meta for value in backbone.state_dict().values()):
            raise ValueError('Uninitialized backbone tensor')
        return backbone
    with patch.object(timm, 'create_model', local_backbone):
        model = FUSED(**constructor_config)
    state = raw['state_dict']
    # Upstream load_fused reports/ignores extras. Allow only these observed keys;
    # the published forward uses joint_seg_decoder, not the old 1x1 seg_bridge.
    # This discrepancy remains explicit; no paper-reproduction claim is made.
    unused = {key for key in state if key not in model.state_dict()}
    expected_unused = {'dinov2_mean': (1, 3, 1, 1), 'dinov2_std': (1, 3, 1, 1),
        'seg_bridge.weight': (1, 512, 1, 1), 'seg_bridge.bias': (1,)}
    if unused != set(expected_unused) or any(tuple(state[key].shape) != shape for key, shape in expected_unused.items()):
        raise ValueError('Unexpected unused checkpoint tensors: ' + str(unused))
    result = model.load_state_dict({k: v for k, v in state.items() if k not in unused}, strict=False)
    if result.unexpected_keys or any(not key.startswith('convnext.') for key in result.missing_keys):
        raise ValueError('Required FUSED weights missing')
    if set(result.missing_keys) != {k for k in model.state_dict() if k.startswith('convnext.')}:
        raise ValueError('Unexpected backbone checkpoint overlap')
    # Verify every retained FUSED tensor equals the official checkpoint after load.
    loaded = model.state_dict()
    for key, value in state.items():
        if key not in unused and not torch.equal(loaded[key], value):
            raise ValueError('Loaded tensor differs: ' + key)
    return model.eval(), dict(**versions,
        checkpoint=weight_file.name, checkpoint_sha256=digest(weight_file),
        device='cpu', precision='float32', ignored_config=ignored_config,
        explicit_num_latents=constructor_config.get('num_latents'),
        unused_checkpoint_tensors=sorted(unused), backbone_strict_load=True,
        retained_weights_exact=True, author_inference_versions=require_author_runtime,
        note='CPU development screen, not a reproduction of the paper benchmark. Training dependencies are not used.')


def selected_rows():
    hashes = json.loads((DATA / 'asset-sha256.json').read_text(encoding='utf-8'))
    with (DATA / 'training-manifest.csv').open(newline='', encoding='utf-8') as handle:
        rows = [row for row in csv.DictReader(handle) if row['source_id'] in SOURCES and row['split'] == 'train']
    if len(rows) != 9 or {r['source_id'] for r in rows} != set(SOURCES):
        raise ValueError('Fixed development cohort missing')
    for source in SOURCES:
        if {r['condition'] for r in rows if r['source_id'] == source} != {'authentic_control', 'segm_flux1dev', 'random_flux1dev'}:
            raise ValueError('Missing development condition')
    for row in rows:
        for field in ('image', 'mask'):
            path = (DATA / row[field]).resolve()
            if not path.is_relative_to((DATA / 'assets/train').resolve()) or not path.is_file():
                raise ValueError('Not a permitted training asset')
            if digest(path) != hashes.get(row[field]):
                raise ValueError('Development asset checksum mismatch')
    return rows


def metrics(scores, truth):
    import numpy as np
    if scores.shape != truth.shape or not np.isfinite(scores).all() or scores.min() < 0 or scores.max() > 1:
        raise ValueError('Invalid scores')
    if not np.isin(truth, [0, 1]).all():
        raise ValueError('Invalid mask')
    predicted = scores >= .5
    intersection = int((predicted & truth.astype(bool)).sum())
    p, t = int(predicted.sum()), int(truth.sum())
    return dict(highlighted_fraction=p / predicted.size,
        dice=2 * intersection / (p + t) if t else None,
        iou=intersection / (p + t - intersection) if t else None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--require-author-runtime', action='store_true')
    parser.add_argument('--checkpoint', choices=['opensdi', 'sofake'], default='opensdi')
    parser.add_argument('--compare-with', type=Path, help='Previous fixed nine-case screen; read-only comparison')
    args = parser.parse_args()
    if args.checkpoint != 'opensdi' and args.compare_with:
        raise ValueError('Runtime comparison must keep the checkpoint fixed')
    if args.output.exists():
        raise ValueError('Use a new output directory')
    available = memory_guard(6)
    manifest = verify_assets(args.checkpoint)
    rows = selected_rows()
    args.output.mkdir(parents=True)
    report = dict(stage='loading', release_approved=False, threshold=.5,
        checkpoint=args.checkpoint,
        source_commit=manifest['source_commit'], initial_free_gib=available,
        scope='Nine development cases, no threshold tuning or deployment', rows=[])
    def save():
        (args.output / 'RESULT.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    save()
    try:
        # Deny network even if a dependency ignores HF offline mode.
        with patch.object(socket.socket, 'connect', offline), patch.object(socket, 'create_connection', offline):
            model, report['runtime'] = load_model(args.require_author_runtime, args.checkpoint)
            import numpy as np
            import torch
            from PIL import Image
            from torchvision import transforms
            transform = transforms.Compose([transforms.Resize([512, 512]), transforms.ToTensor(),
                transforms.Normalize([.485, .456, .406], [.229, .224, .225])])
            for row in rows:
                memory_guard(1)
                report['stage'] = 'inference'
                report['current_sample'] = row['sample_id']
                save()
                print('Evaluating ' + row['sample_id'], flush=True)
                with Image.open(DATA / row['image']) as source:
                    image = source.convert('RGB')
                with Image.open(DATA / row['mask']) as source:
                    truth = np.asarray(source.convert('L'))
                if not np.isin(truth, [0, 255]).all():
                    raise ValueError('Mask not binary')
                start = time.monotonic()
                with torch.inference_mode():
                    output = model(transform(image).unsqueeze(0))
                    native_scores = output['logits'].sigmoid()[0, 0].numpy()
                    scores = torch.nn.functional.interpolate(output['logits'].sigmoid(),
                        size=truth.shape, mode='bilinear', align_corners=False)[0, 0].numpy()
                result = dict(sample_id=row['sample_id'], condition=row['condition'], seconds=time.monotonic()-start,
                    image_sha256=digest(DATA / row['image']), mask_sha256=digest(DATA / row['mask']), **metrics(scores, truth // 255))
                # Also reproduce authors' PNG quantization + PIL resizing path;
                # this is separate from our floating-point metric path.
                upstream_scores = np.asarray(Image.fromarray((native_scores * 255).astype(np.uint8)).resize(
                    image.size, Image.Resampling.BILINEAR)).astype(np.float32) / 255
                result['upstream_postprocess'] = metrics(upstream_scores, truth // 255)
                if args.compare_with:
                    baseline_report = json.loads((args.compare_with / 'RESULT.json').read_text(encoding='utf-8'))
                    matches = [r for r in baseline_report['rows'] if r['sample_id'] == row['sample_id']]
                    if len(matches) != 1 or matches[0]['image_sha256'] != result['image_sha256'] or matches[0]['mask_sha256'] != result['mask_sha256']:
                        raise ValueError('Baseline input identity mismatch')
                    with np.load(args.compare_with / (row['sample_id'] + '.npz'), allow_pickle=False) as baseline:
                        if not np.array_equal(baseline['truth'], truth) or baseline['scores'].shape != scores.shape:
                            raise ValueError('Baseline shape/ground truth mismatch')
                        result['baseline_max_score_difference'] = float(np.max(np.abs(scores - baseline['scores'])))
                        result['baseline_mask_disagreement'] = float(np.mean((scores >= .5) != (baseline['scores'] >= .5)))
                np.savez_compressed(args.output / (row['sample_id'] + '.npz'), scores=scores, native_scores=native_scores, upstream_scores=upstream_scores, truth=truth)
                # Exact model mask, no smoothing, stretching, object-mask substitution.
                original = np.asarray(image).astype(np.float32)
                alpha = (scores >= .5)[..., None] * .45
                overlay = original * (1-alpha) + np.array([255, 50, 140]) * alpha
                Image.fromarray(overlay.astype(np.uint8)).save(args.output / (row['sample_id'] + '.png'))
                report['rows'].append(result)
                save()
                print(json.dumps(result), flush=True)
            report['stage'] = 'development_screen_complete'
    except Exception as error:
        report['stage'] = 'failed'
        report['error'] = f'{type(error).__name__}: {error}'
        raise
    finally:
        save()


if __name__ == '__main__':
    main()
