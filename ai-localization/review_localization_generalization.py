"""Offline train/development review. No model execution or sealed-test access."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
RETURN_SHA = '1eb5ba164ae9ff7e310001f773db64974c1d18e42823ce768a661adeb0d429e1'


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def summary(values):
    x = np.asarray(values, dtype=float)
    if not len(x) or not np.isfinite(x).all():
        raise ValueError('Invalid measurements')
    return dict(count=len(x), mean=float(x.mean()), median=float(np.median(x)),
                minimum=float(x.min()), maximum=float(x.max()))


def paired_response(edited, control, target):
    """Same-coordinate comparison is a diagnostic only, not a product predictor."""
    e, c = np.asarray(edited, dtype=float), np.asarray(control, dtype=float)
    t = np.asarray(target, dtype=bool)
    if e.shape != c.shape or e.shape != t.shape or not t.any() or t.all():
        raise ValueError('Need aligned partial-edit arrays')
    if not np.isfinite(e).all() or not np.isfinite(c).all():
        raise ValueError('Nonfinite scores')
    if e.min() < 0 or e.max() > 1 or c.min() < 0 or c.max() > 1:
        raise ValueError('Scores must be on the saved 0-1 scale')
    def dice(p):
        b = p >= .5
        return float(2 * (b & t).sum() / (b.sum() + t.sum()))
    return dict(edited_inside_score=float(e[t].mean()), control_same_region_score=float(c[t].mean()),
                inside_score_lift=float((e[t] - c[t]).mean()),
                outside_absolute_score_change=float(np.abs(e[~t] - c[~t]).mean()),
                edited_dice_at_050=dice(e),
                control_overlap_with_edit_location_at_050=dice(c))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Use a fresh output folder')
    if sha(args.archive) != RETURN_SHA:
        raise ValueError('Use the previously verified training return archive')
    data = ROOT / 'datasets/supervised-localization-v1'
    with (data / 'training-manifest.csv').open(newline='', encoding='utf-8') as stream:
        rows = list(csv.DictReader(stream))
    if {r['split'] for r in rows} != {'train', 'validation'}:
        raise ValueError('Only train and development validation allowed')
    if len(rows) != 600 or len({r['sample_id'] for r in rows}) != 600:
        raise ValueError('Unexpected cohort')
    ledger = json.loads((data / 'asset-sha256.json').read_text())
    sources = {s: {r['source_id'] for r in rows if r['split'] == s} for s in ('train', 'validation')}
    if sources['train'] & sources['validation']:
        raise ValueError('Source leakage')
    images, masks, owners = {}, {}, {}
    for r in rows:
        for key in ('image', 'mask'):
            path = (data / r[key]).resolve()
            if not path.is_relative_to(data.resolve()) or sha(path) != ledger[r[key]]:
                raise ValueError('Asset path/hash mismatch')
        digest = ledger[r['image']]
        if owners.setdefault(digest, r['split']) != r['split']:
            raise ValueError('Identical image across splits')
        with Image.open(data / r['image']) as im:
            image = np.asarray(im.convert('RGB')).copy()
        with Image.open(data / r['mask']) as im:
            mask = np.asarray(im.convert('L')).copy()
        if image.shape != (448, 448, 3) or mask.shape != (448, 448) or not np.isin(mask, [0, 255]).all():
            raise ValueError('Unexpected image/mask format')
        images[r['sample_id']], masks[r['sample_id']] = image, mask > 0
    controls = {(r['split'], r['source_id']): r for r in rows if r['condition'] == 'authentic_control'}
    records = []
    for r in rows:
        mask = masks[r['sample_id']]
        if r['condition'] == 'authentic_control':
            if mask.any():
                raise ValueError('Nonempty authentic target')
            continue
        if not mask.any() or mask.all():
            raise ValueError('Not a partial edit')
        control = controls[(r['split'], r['source_id'])]
        delta = np.abs(images[r['sample_id']].astype(float) - images[control['sample_id']].astype(float)).mean(2)
        records.append(dict(sample_id=r['sample_id'], split=r['split'], condition=r['condition'],
                            target_fraction=float(mask.mean()),
                            rgb_change_inside=float(delta[mask].mean()),
                            rgb_change_outside=float(delta[~mask].mean())))
    del images
    with zipfile.ZipFile(args.archive) as bundle:
        order = json.loads(bundle.read('validation-order.json'))
        with np.load(io.BytesIO(bundle.read('validation-predictions.npz')), allow_pickle=False) as arrays:
            p, t = arrays['probabilities'], arrays['targets']
    if p.shape != (120, 448, 448) or t.shape != p.shape:
        raise ValueError('Invalid prediction shape')
    validation_ids = {r['sample_id'] for r in rows if r['split'] == 'validation'}
    if len(order) != 120 or {r['sample_id'] for r in order} != validation_ids:
        raise ValueError('Wrong prediction cohort')
    control_indices = {r['source_id']: i for i, r in enumerate(order) if r['condition'] == 'authentic_control'}
    paired = []
    for i, r in enumerate(order):
        if not np.array_equal(t[i], masks[r['sample_id']]):
            raise ValueError('Saved target alignment mismatch')
        if r['condition'] != 'authentic_control':
            paired.append(dict(sample_id=r['sample_id'], condition=r['condition'],
                **paired_response(p[i], p[control_indices[r['source_id']]], t[i])))
    groups = {}
    for split in ('train', 'validation'):
        for condition in ('segm_flux1dev', 'random_flux1dev'):
            selected = [r for r in records if r['split'] == split and r['condition'] == condition]
            groups[split + '/' + condition] = {
                k: summary([r[k] for r in selected]) for k in
                ('target_fraction', 'rgb_change_inside', 'rgb_change_outside')}
            groups[split + '/' + condition]['inside_change_exceeds_outside_count'] = sum(
                r['rgb_change_inside'] > r['rgb_change_outside'] for r in selected)
    response = {}
    for condition in ('segm_flux1dev', 'random_flux1dev'):
        selected = [r for r in paired if r['condition'] == condition]
        response[condition] = {k: summary([r[k] for r in selected]) for k in selected[0] if k not in ('sample_id', 'condition')}
        response[condition]['nonpositive_inside_lift_count'] = sum(r['inside_score_lift'] <= 0 for r in selected)
    report = dict(archive_sha256=RETURN_SHA, source_counts={s: len(v) for s, v in sources.items()},
        train_validation_image_mask_hashes_verified=True, source_and_exact_image_disjoint=True,
        dataset_groups=groups, paired_validation_response=response,
        test_data_opened=False, model_executed=False, release_approved=False,
        limitation='Same-source pairs used only for offline diagnosis. User input remains one image. These are development results, not final-test accuracy.')
    args.output.mkdir(parents=True)
    for name, values in [('dataset-measurements.csv', records), ('paired-response.csv', paired)]:
        with (args.output / name).open('w', newline='', encoding='utf-8') as stream:
            writer = csv.DictWriter(stream, fieldnames=list(values[0]))
            writer.writeheader(); writer.writerows(values)
    (args.output / 'review.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
