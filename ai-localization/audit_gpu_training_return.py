"""Read-only audit of Loyd's returned validation data; no retraining or test access."""
import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import zipfile
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def metrics(p, t, rows, cutoff):
    """Independent direct boolean-count implementation, not training's histogram code."""
    groups = {}
    for condition in ('authentic_control', 'segm_flux1dev', 'random_flux1dev'):
        indices = [i for i, row in enumerate(rows) if row['condition'] == condition]
        pred = p[indices].astype(np.float64) >= cutoff
        truth = t[indices].astype(bool)
        n = pred.sum((1, 2)); truth_n = truth.sum((1, 2))
        tp = (pred & truth).sum((1, 2))
        group = dict(images=len(indices), empty_masks=int((n == 0).sum()),
            images_with_highlights=int((n > 0).sum()), highlighted_area_mean=float(pred.mean()))
        if condition != 'authentic_control':
            group.update(dice=float(np.mean(2 * tp / (n + truth_n))),
                         iou=float(np.mean(tp / (n + truth_n - tp))))
        groups[condition] = group
    return groups


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Use a fresh audit output folder')
    required = {'STATUS.json', 'protocol.json', 'environment.json', 'history.json', 'stdout.log',
                'best-adapter.pt', 'validation-predictions.npz', 'validation-order.json',
                'validation-report.json', 'RETURN-SHA256.json'}
    with zipfile.ZipFile(args.archive) as bundle:
        entries = bundle.infolist()
        if len(entries) != len(required) or set(bundle.namelist()) != required:
            raise ValueError('Unexpected or duplicate ZIP entries')
        if sum(e.file_size for e in entries) > 300_000_000:
            raise ValueError('Return exceeds bounded audit size')
        ledger = json.loads(bundle.read('RETURN-SHA256.json'))
        if set(ledger['files']) != required - {'RETURN-SHA256.json'}:
            raise ValueError('Incomplete hash ledger')
        for name, digest in ledger['files'].items():
            if hashlib.sha256(bundle.read(name)).hexdigest() != digest:
                raise ValueError('Return checksum mismatch: ' + name)
        status, protocol, history, decision, rows = [json.loads(bundle.read(name)) for name in
            ('STATUS.json', 'protocol.json', 'history.json', 'validation-report.json', 'validation-order.json')]
        log = bundle.read('stdout.log').decode('utf-8')
        checkpoint_bytes = bundle.read('best-adapter.pt')
        with np.load(io.BytesIO(bundle.read('validation-predictions.npz')), allow_pickle=False) as arrays:
            p, t = arrays['probabilities'], arrays['targets']
    with zipfile.ZipFile(ROOT / 'handoff/AuthentiScan-SAFIRE-GPU-Training-Loyd-v1.zip') as outgoing:
        release_bytes = outgoing.read('RELEASE.json')
        release = json.loads(release_bytes)
        if hashlib.sha256(release_bytes).hexdigest() != protocol['package_sha256']:
            raise ValueError('Not our exported training package')
        expected_rows = [r for r in json.loads(outgoing.read('samples.json')) if r['split'] == 'validation']
        if rows != expected_rows:
            raise ValueError('Validation row/order mismatch')
    if p.shape != (120, 448, 448) or t.shape != p.shape or not np.isfinite(p).all():
        raise ValueError('Invalid prediction arrays')
    if p.min() < 0 or p.max() > 1 or not np.isin(t, [0, 1]).all():
        raise ValueError('Invalid scores/targets')
    data = ROOT / 'datasets/supervised-localization-v1'
    with (data / 'training-manifest.csv').open(newline='', encoding='utf-8') as stream:
        originals = {r['sample_id']: r for r in csv.DictReader(stream)}
    asset_ledger = json.loads((data / 'asset-sha256.json').read_text())
    for i, row in enumerate(rows):
        original = originals[row['sample_id']]
        for key in ('source_id', 'split', 'condition'):
            if row[key] != original[key]:
                raise ValueError('Source provenance mismatch')
        for key in ('image', 'mask'):
            if sha(data / original[key]) != asset_ledger[original[key]]:
                raise ValueError('Local prepared asset modified')
            if asset_ledger[original[key]] != release['files'][row[key]]:
                raise ValueError('Transferred asset differs from original')
        with Image.open(data / original['mask']) as mask:
            target = np.asarray(mask.convert('L')) // 255
        if not np.array_equal(target, t[i]):
            raise ValueError('Returned target differs from labeled mask')
    if [h['epoch'] for h in history] != list(range(1, 21)):
        raise ValueError('Incomplete epoch history')
    best = min(history, key=lambda h: h['validation_loss'])
    if best['epoch'] != decision['best_epoch'] or status['best_epoch'] != best['epoch']:
        raise ValueError('Wrong best epoch')
    if not np.isclose(best['validation_loss'], decision['best_validation_loss'], atol=1e-10, rtol=1e-10):
        raise ValueError('Best loss mismatch')
    if not np.isclose(best['validation_loss'], decision['repeated_validation_loss'], atol=1e-6):
        raise ValueError('Repeated best-checkpoint validation loss differs')
    if ledger['files']['best-adapter.pt'] != decision['best_checkpoint_sha256']:
        raise ValueError('Decision points to different checkpoint')
    import torch
    torch.set_num_threads(2)
    trained = torch.load(io.BytesIO(checkpoint_bytes), map_location='cpu', weights_only=True)
    del checkpoint_bytes
    if trained['identity'] != protocol or trained['epoch'] != best['epoch']:
        raise ValueError('Checkpoint identity/epoch mismatch')
    base_path = ROOT / 'weights/safire/safire.pth'
    if sha(base_path) != protocol['checkpoint_sha256']:
        raise ValueError('Pinned base differs')
    saved_base = torch.load(base_path, map_location='cpu', weights_only=True, mmap=True)
    base = {k.removeprefix('module.'): v for k, v in saved_base['model'].items()}
    def group(name):
        if name.startswith('image_encoder.adaptor'): return 'adapters'
        if name.startswith('image_encoder.hfp_'): return 'high_frequency'
        if name.startswith('mask_decoder.') and not name.startswith('mask_decoder.iou_prediction_head.'):
            return 'decoder'
        return None
    expected_names = {name for name in base if group(name) is not None}
    if set(trained['model']) != expected_names:
        raise ValueError('Unexpected trained tensor set')
    changes = {g: dict(tensors=0, changed_tensors=0, parameters=0, max_abs_delta=0.)
               for g in ('adapters', 'high_frequency', 'decoder')}
    for name, value in trained['model'].items():
        initial = base[name]
        if value.shape != initial.shape or value.dtype != initial.dtype or not torch.isfinite(value).all():
            raise ValueError('Invalid returned tensor')
        stats = changes[group(name)]
        stats['tensors'] += 1; stats['parameters'] += value.numel()
        stats['changed_tensors'] += int(not torch.equal(value, initial))
        stats['max_abs_delta'] = max(stats['max_abs_delta'], float((value - initial).abs().max()))
    del trained, base, saved_base
    print('Hashes, provenance, all 120 targets and best checkpoint verified.', flush=True)
    curves = []
    for item in decision['curve']:
        cutoff = item['threshold']
        groups = metrics(p, t, rows, cutoff)
        for condition, values in groups.items():
            for key, value in values.items():
                if not np.isclose(value, item['groups'][condition][key], atol=1e-10, rtol=1e-8):
                    raise ValueError('Metric failed independent reproduction')
        score = float(np.mean([groups[c]['dice'] for c in ('segm_flux1dev', 'random_flux1dev')]))
        if not np.isclose(score, item['edited_macro_dice'], atol=1e-10):
            raise ValueError('Aggregate mismatch')
        curves.append(dict(threshold=cutoff, groups=groups, edited_macro_dice=score))
    if len(curves) != 99 or not np.allclose([c['threshold'] for c in curves], np.arange(1, 100)/100):
        raise ValueError('Missing cutoff curve')
    admissible = [c for c in curves if c['groups']['authentic_control']['images_with_highlights'] <= 4
                  and c['groups']['authentic_control']['highlighted_area_mean'] <= .01]
    if admissible or decision['status'] != 'no_acceptable_validation_threshold':
        raise ValueError('Reported rejection does not reproduce')
    optimistic = max(curves, key=lambda c: (c['edited_macro_dice'], c['threshold']))
    events = [json.loads(line) for line in log.splitlines() if line.startswith('{')]
    for epoch in range(1, 21):
        steps = [e['step'] for e in events if e.get('stage') == 'training' and e.get('epoch') == epoch]
        if steps != list(range(0, 481, 20)):
            raise ValueError('Missing/duplicate logged training progress')
    report = dict(archive_sha256=sha(args.archive), return_hashes_verified=True,
        package_identity_matches=True, targets_match_source=True, checkpoint_identity_verified=True,
        all_99_cutoffs_independently_reproduced=True, best_epoch=best['epoch'],
        best_validation_loss=best['validation_loss'], epoch_seconds_total=sum(h['seconds'] for h in history),
        trainable_tensor_changes=changes, cutoff_099=curves[-1], cutoff_050=curves[49],
        best_overlap_ignoring_authentic_constraints=optimistic, acceptable_cutoffs=0,
        release_approved=False, test_data_opened=False,
        limitation='Audit of saved validation outputs, not independent inference replay or final-test accuracy.')
    args.output.mkdir(parents=True)
    (args.output / 'audit.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    os.environ.setdefault('MPLCONFIGDIR', str(args.output / 'mpl-cache'))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    for field, label in [('train_loss', 'Training'), ('validation_loss', 'Validation')]:
        axes[0].plot(range(1, 21), [h[field] for h in history], label=label)
    axes[0].axvline(best['epoch'], color='gray', linestyle=':', label='Selected epoch')
    axes[0].set(title='Loss improves on training, not validation', xlabel='Epoch', ylabel='Loss')
    axes[0].legend()
    axes[1].plot([c['threshold'] for c in curves], [c['edited_macro_dice'] for c in curves], label='Edited-mask overlap (Dice)')
    axes[1].plot([c['threshold'] for c in curves], [c['groups']['authentic_control']['images_with_highlights']/40 for c in curves], label='Authentic images falsely highlighted')
    axes[1].axhline(.1, color='red', linestyle=':', label='False-highlight limit')
    axes[1].set(title='No tested cutoff meets the limits', xlabel='Score cutoff', ylim=(0, 1.05))
    axes[1].legend(fontsize=8)
    fig.tight_layout(); fig.savefig(args.output / 'curves.png', dpi=140); plt.close(fig)
    # Fixed first three validation families, not chosen to favor either outcome.
    for family in range(3):
        fig, axes = plt.subplots(3, 5, figsize=(14, 8))
        for j in range(3):
            i = 3 * family + j
            row = rows[i]
            with Image.open(data / originals[row['sample_id']]['image']) as image:
                pixels = np.asarray(image.convert('RGB'))
            displays = [pixels, t[i], p[i], p[i].astype(float) >= .5, p[i].astype(float) >= .99]
            titles = [row['condition'], 'Known edited area', 'Model score, fixed 0-1', 'Mask at cutoff 0.50', 'Mask at cutoff 0.99']
            for ax, values, title in zip(axes[j], displays, titles):
                ax.imshow(values, **({} if values.ndim == 3 else dict(cmap='gray', vmin=0, vmax=1)))
                ax.set_title(title, fontsize=9); ax.axis('off')
        fig.suptitle(f"Validation family {rows[3*family]['source_id']} — diagnostic, not user-facing results")
        fig.tight_layout(); fig.savefig(args.output / f'family-{family+1}.png', dpi=110); plt.close(fig)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
