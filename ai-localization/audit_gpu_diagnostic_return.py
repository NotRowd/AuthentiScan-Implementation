"""Audit saved six-image diagnostic outputs; never train, deploy or read test data."""
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


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def measure(p, t, rows):
    if (p.shape != (6, 448, 448) or t.shape != p.shape or not np.isfinite(p).all()
            or p.min() < 0 or p.max() > 1 or not np.isin(t, [0, 1]).all()):
        raise ValueError('Invalid saved predictions')
    result = []
    for scores, target, row in zip(p, t, rows, strict=True):
        truth = target.astype(bool); pred = scores >= .5
        n, total = int(truth.sum()), int(pred.sum() + truth.sum())
        if (row['condition'] == 'authentic_control') != (n == 0):
            raise ValueError('Condition/mask mismatch')
        result.append(dict(sample_id=row['sample_id'], condition=row['condition'],
            dice=float(2 * (pred & truth).sum() / total) if n else None,
            highlighted_area=float(pred.mean()), truth_area=float(truth.mean()),
            mean_inside_score=float(scores[truth].mean()) if n else None,
            mean_outside_score=float(scores[~truth].mean())))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists(): raise ValueError('Use a fresh audit folder')
    expected = {'RESULT.json', 'history.json', 'samples.json', 'baseline.npz',
                'latest-predictions.npz', 'stdout.log', 'stderr.log', 'RETURN-SHA256.json'}
    with zipfile.ZipFile(args.archive) as archive:
        if set(archive.namelist()) != expected or len(archive.namelist()) != len(expected):
            raise ValueError('Unexpected/duplicate archive entries')
        if sum(e.file_size for e in archive.infolist()) > 30_000_000:
            raise ValueError('Diagnostic exceeds audit size bound')
        payloads = {n: archive.read(n) for n in expected}
    ledger = json.loads(payloads['RETURN-SHA256.json'])
    if set(ledger['files']) != expected - {'RETURN-SHA256.json'}: raise ValueError('Wrong ledger')
    for name, value in ledger['files'].items():
        if digest(payloads[name]) != value: raise ValueError('Checksum mismatch: ' + name)
    report = json.loads(payloads['RESULT.json'])
    history = json.loads(payloads['history.json']); rows = json.loads(payloads['samples.json'])
    with zipfile.ZipFile(ROOT / 'handoff/AuthentiScan-SAFIRE-Diagnostic-Loyd-v1.zip') as outgoing:
        if digest(outgoing.read('DIAGNOSTIC.json')) != report['diagnostic_release_sha256']:
            raise ValueError('Different diagnostic package')
    with zipfile.ZipFile(ROOT / 'handoff/AuthentiScan-SAFIRE-GPU-Training-Loyd-v1.zip') as outgoing:
        if digest(outgoing.read('RELEASE.json')) != report['base_release_sha256']:
            raise ValueError('Different base training package')
        released = json.loads(outgoing.read('RELEASE.json'))
        expected_rows = [r for r in json.loads(outgoing.read('samples.json'))
                         if r['split'] == 'train' and r['source_id'] in ('tgif2-724', 'tgif2-5992')]
        if rows != expected_rows or len(rows) != 6: raise ValueError('Wrong diagnostic cohort/order')
    if [h['step'] for h in history] != list(range(0, 601, 60)):
        raise ValueError('Incomplete diagnostic history')
    if report['baseline'] != history[0] or report['latest'] != history[-1]:
        raise ValueError('Result/history mismatch')
    if report['steps_completed'] != 600 or report['release_approved'] is not False:
        raise ValueError('Unexpected completion/release state')
    arrays = {}
    for name in ('baseline.npz', 'latest-predictions.npz'):
        with np.load(io.BytesIO(payloads[name]), allow_pickle=False) as saved:
            arrays[name] = (saved['probabilities'], saved['targets'])
    baseline, target = arrays['baseline.npz']; final, final_target = arrays['latest-predictions.npz']
    if not np.array_equal(target, final_target): raise ValueError('Targets changed during diagnostic')
    data = ROOT / 'datasets/supervised-localization-v1'
    with (data / 'training-manifest.csv').open(newline='', encoding='utf-8') as stream:
        originals = {r['sample_id']: r for r in csv.DictReader(stream)}
    pixels = []
    for i, row in enumerate(rows):
        original = originals[row['sample_id']]
        if original['split'] != 'train': raise ValueError('Not training data')
        for key in ('image', 'mask'):
            raw = (data / original[key]).read_bytes()
            if digest(raw) != released['files'][row[key]]: raise ValueError('Original asset mismatch')
        with Image.open(data / original['mask']) as image:
            if not np.array_equal(np.asarray(image.convert('L')) // 255, target[i]):
                raise ValueError('Saved target differs from original mask')
        with Image.open(data / original['image']) as image:
            pixels.append(np.asarray(image.convert('RGB')))
    for label, scores, saved in [('baseline', baseline, history[0]), ('final', final, history[-1])]:
        calculated = measure(scores, target, rows)
        for actual, declared in zip(calculated, saved['samples'], strict=True):
            for key, value in actual.items():
                if isinstance(value, float):
                    if not np.isclose(value, declared[key], atol=1e-10, rtol=1e-7):
                        raise ValueError(f'{label} metric mismatch: {key}')
                elif value != declared[key]: raise ValueError('Sample metadata mismatch')
    final_metrics = measure(final, target, rows)
    passed = all(m['highlighted_area'] <= .001 if m['dice'] is None else m['dice'] >= .9 for m in final_metrics)
    if passed != report['latest']['learning_check_passed']: raise ValueError('Fit decision mismatch')
    result = dict(archive_sha256=digest(args.archive.read_bytes()), all_return_hashes_verified=True,
        both_package_identities_match=True, all_six_targets_match_original=True,
        baseline_and_final_metrics_independently_reproduced=True, steps_completed=600,
        training_seconds=report['elapsed_training_seconds'], baseline_loss=history[0]['mean_loss'],
        final_loss=history[-1]['mean_loss'], samples=final_metrics,
        edited_macro_dice=float(np.mean([m['dice'] for m in final_metrics if m['dice'] is not None])),
        fixed_fit_criteria_met=passed, generalization_evaluated=False, release_approved=False,
        limitations='Saved training-output audit only; no inference replay, no checkpoint was returned, no unseen-image test.')
    args.output.mkdir(parents=True)
    (args.output / 'audit.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    os.environ.setdefault('MPLCONFIGDIR', str(ROOT / 'runs/safire-gpu-return-audit-2026-10-22/mpl-cache'))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    for family in range(2):
        fig, axes = plt.subplots(3, 4, figsize=(12, 9))
        for j in range(3):
            i = family * 3 + j
            displays = [pixels[i], target[i], baseline[i] >= .5, final[i] >= .5]
            titles = [rows[i]['condition'], 'Known edited mask', 'Before: cutoff 0.50', 'After 600 steps: cutoff 0.50']
            for ax, value, title in zip(axes[j], displays, titles):
                ax.imshow(value, **({} if value.ndim == 3 else dict(cmap='gray', vmin=0, vmax=1)))
                ax.set_title(title, fontsize=9); ax.axis('off')
        fig.suptitle(f"TRAINING images only: {rows[family*3]['source_id']} — not accuracy on new images")
        fig.tight_layout(); fig.savefig(args.output / f'family-{family+1}.png', dpi=115); plt.close(fig)
    fig, axes = plt.subplots(1, 2, figsize=(11, 4))
    axes[0].plot([h['step'] for h in history], [h['mean_loss'] for h in history])
    axes[0].set(title='Loss on the same six training images', xlabel='Optimizer step', ylabel='Loss', yscale='log')
    for i in (1, 2, 4, 5):
        axes[1].plot([h['step'] for h in history], [h['samples'][i]['dice'] for h in history], label=rows[i]['sample_id'].removeprefix('train-'))
    axes[1].axhline(.9, color='gray', linestyle=':')
    axes[1].set(title='Edited-mask overlap on training examples', xlabel='Optimizer step', ylabel='Dice', ylim=(0, 1.02))
    axes[1].legend(fontsize=7); fig.tight_layout(); fig.savefig(args.output / 'learning-curves.png', dpi=130); plt.close(fig)
    print(json.dumps(result, indent=2))


if __name__ == '__main__': main()
