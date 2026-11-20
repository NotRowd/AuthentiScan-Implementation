"""Independent saved-output audit; no returned code execution, inference or training."""
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


def digest(stream):
    h = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        h.update(chunk)
    return h.hexdigest()


def file_sha(path):
    with path.open('rb') as stream:
        return digest(stream)


def metrics(scores, targets, rows):
    """Per-image pixel counts, independent of the pilot's metric helpers."""
    if (scores.shape != targets.shape or scores.ndim != 3 or len(rows) != len(scores)
            or not np.isfinite(scores).all() or scores.min() < 0 or scores.max() > 1
            or not np.isin(targets, [0, 1]).all()):
        raise ValueError('Invalid saved arrays')
    controls = {r['source_id']: i for i, r in enumerate(rows) if r['condition'] == 'authentic_control'}
    records = []
    for i, row in enumerate(rows):
        truth = targets[i].astype(bool)
        selected = scores[i] >= .5
        if (row['condition'] == 'authentic_control') != (not truth.any()):
            raise ValueError('Target/condition mismatch')
        record = dict(sample_id=row['sample_id'], condition=row['condition'],
                      highlighted=int(selected.sum()), area=float(selected.mean()))
        if truth.any():
            record['dice'] = 2 * int(np.count_nonzero(selected & truth)) / (int(selected.sum()) + int(truth.sum()))
            record['lift'] = float((scores[i].astype(float) - scores[controls[row['source_id']]])[truth].mean())
        records.append(record)
    groups = {}
    for condition in ('authentic_control', 'segm_flux1dev', 'random_flux1dev'):
        items = [r for r in records if r['condition'] == condition]
        group = dict(images=len(items), images_with_highlights=sum(r['highlighted'] > 0 for r in items),
                     highlighted_area_mean=float(np.mean([r['area'] for r in items])))
        if condition != 'authentic_control':
            group.update(dice=float(np.mean([r['dice'] for r in items])),
                         mean_inside_score_lift=float(np.mean([r['lift'] for r in items])),
                         nonpositive_inside_lift_count=sum(r['lift'] <= 0 for r in items))
        groups[condition] = group
    return groups, records


def group(name):
    if name.startswith('image_encoder.adaptor'): return 'adapters'
    if name.startswith('image_encoder.hfp_'): return 'high_frequency'
    if name.startswith('mask_decoder.') and not name.startswith('mask_decoder.iou_prediction_head.'): return 'decoder'
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists(): raise FileExistsError(args.output)
    names = {'RESULT.json', 'samples.json', 'regions.json', 'stdout.log', 'stderr.log'}
    names |= {f'{arm}/{name}' for arm in ('A', 'B') for name in
              ('history.json', 'epoch-0.npz', 'epoch-1.npz', 'epoch-2.npz', 'endpoint-adapter.pt')}
    with zipfile.ZipFile(ROOT / 'handoff/AuthentiScan-SAFIRE-Pilot-Loyd-v1.zip') as outgoing:
        pilot_sha = hashlib.sha256(outgoing.read('PILOT.json')).hexdigest()
    with zipfile.ZipFile(ROOT / 'handoff/AuthentiScan-SAFIRE-GPU-Training-Loyd-v1.zip') as outgoing:
        base_release = outgoing.read('RELEASE.json')
        base_sha = hashlib.sha256(base_release).hexdigest()
        release = json.loads(base_release)
        expected_rows = json.loads(outgoing.read('samples.json'))
    data = ROOT / 'datasets/supervised-localization-v1'
    with (data / 'training-manifest.csv').open(newline='', encoding='utf-8') as stream:
        local_rows = {r['sample_id']: r for r in csv.DictReader(stream)}
    masks = {}
    for row in expected_rows:
        local = local_rows[row['sample_id']]
        for key in ('source_id', 'condition', 'split'):
            if row[key] != local[key]: raise ValueError('Local provenance mismatch')
        for key in ('image', 'mask'):
            if file_sha(data / local[key]) != release['files'][row[key]]:
                raise ValueError('Transferred/local asset mismatch')
        with Image.open(data / local['mask']) as image:
            pixels = np.asarray(image.convert('L'))
        if pixels.shape != (448, 448) or not np.isin(pixels, [0, 255]).all():
            raise ValueError('Invalid labeled mask')
        masks[row['sample_id']] = pixels > 0
    union = {}
    for row in expected_rows:
        if row['split'] == 'train' and row['condition'] != 'authentic_control':
            source = row['source_id']
            union[source] = union.get(source, np.zeros((448, 448), bool)) | masks[row['sample_id']]
    validation = [r for r in expected_rows if r['split'] == 'validation']
    expected_targets = np.asarray([masks[r['sample_id']] for r in validation])
    computed, per_image, checkpoint_changes = {}, [], {}
    with zipfile.ZipFile(args.archive) as archive:
        entries = archive.infolist()
        if len(entries) != len(names) + 1 or set(archive.namelist()) != names | {'RETURN-SHA256.json'}:
            raise ValueError('Unexpected/duplicate return entry')
        if sum(e.file_size for e in entries) > 800_000_000:
            raise ValueError('Return exceeds audit size bound')
        ledger = json.loads(archive.read('RETURN-SHA256.json'))
        if set(ledger['files']) != names: raise ValueError('Incomplete hash ledger')
        for name, expected in ledger['files'].items():
            with archive.open(name) as stream:
                if digest(stream) != expected: raise ValueError('Checksum mismatch: ' + name)
        print('All 15 returned payload hashes verified.', flush=True)
        result = json.loads(archive.read('RESULT.json'))
        if (result['base_release_sha256'] != base_sha or result['pilot_release_sha256'] != pilot_sha
                or result['epochs_per_arm'] != 2 or result['region_weight'] != .5
                or result['release_approved'] is not False or result['final_test_evaluated'] is not False
                or result['status'] != 'completed'):
            raise ValueError('Unexpected protocol or completion')
        if json.loads(archive.read('samples.json')) != expected_rows: raise ValueError('Row/order mismatch')
        expected_regions = {s: dict(pixels=int(m.sum()), sha256=hashlib.sha256(m.tobytes()).hexdigest()) for s, m in union.items()}
        if json.loads(archive.read('regions.json')) != expected_regions: raise ValueError('Training-only union mismatch')
        log = archive.read('stdout.log').decode('utf-8')
        events = [json.loads(line) for line in log.splitlines() if line.startswith('{')]
        baseline = None
        previews = {}
        for arm in ('A', 'B'):
            history = json.loads(archive.read(f'{arm}/history.json'))
            if [h['epoch'] for h in history] != [0, 1, 2]: raise ValueError('Incomplete history')
            if result['arms'][arm]['steps_completed'] != 960: raise ValueError('Wrong step count')
            for epoch in (1, 2):
                steps = [e['step'] for e in events if e.get('arm') == arm and e.get('epoch') == epoch and 'step' in e]
                if steps != list(range(20, 481, 20)): raise ValueError('Incomplete/duplicate logged steps')
            computed[arm] = []
            for epoch in (0, 1, 2):
                # NPZ inner ZIP is bounded before array decompression.
                payload = archive.read(f'{arm}/epoch-{epoch}.npz')
                with zipfile.ZipFile(io.BytesIO(payload)) as inner:
                    if set(inner.namelist()) != {'probabilities.npy', 'targets.npy'} or len(inner.infolist()) != 2 or sum(e.file_size for e in inner.infolist()) > 130_000_000:
                        raise ValueError('Invalid prediction payload')
                with np.load(io.BytesIO(payload), allow_pickle=False) as arrays:
                    p, t = arrays['probabilities'], arrays['targets']
                del payload
                if p.shape != (120, 448, 448) or not np.array_equal(t, expected_targets):
                    raise ValueError('Prediction shape/target/order mismatch')
                values, records = metrics(p, t, validation)
                for condition, fields in values.items():
                    for key, value in fields.items():
                        if not np.isclose(value, history[epoch]['groups'][condition][key], rtol=1e-9, atol=1e-10):
                            raise ValueError('Independent metric mismatch')
                if history[epoch]['fixed_cutoff'] != .5: raise ValueError('Cutoff changed')
                if epoch in (0, 2) and history[epoch] != result['arms'][arm]['baseline' if epoch == 0 else 'endpoint']:
                    raise ValueError('Result/history mismatch')
                if epoch == 0:
                    if baseline is None: baseline = p.copy()
                    elif not np.array_equal(baseline, p): raise ValueError('Baseline arrays differ')
                if epoch == 2:
                    previews[arm] = p[:9].copy()
                    per_image.extend(dict(arm=arm, **r) for r in records)
                computed[arm].append(dict(epoch=epoch, groups=values))
                del p, t
                print(f'{arm} epoch {epoch}: all targets and independent metrics verified.', flush=True)
        del baseline
        import torch
        torch.set_num_threads(2)
        weight_path = ROOT / 'weights/safire/safire.pth'
        if file_sha(weight_path) != release['checkpoint_sha256']: raise ValueError('Wrong pretrained checkpoint')
        saved = torch.load(weight_path, weights_only=True, mmap=True, map_location='cpu')
        initial = {k.removeprefix('module.'): v for k, v in saved['model'].items() if group(k.removeprefix('module.'))}
        initial_hash = hashlib.sha256()
        for name, value in sorted(initial.items()):
            initial_hash.update(name.encode()); initial_hash.update(str(value.shape).encode())
            initial_hash.update(value.contiguous().numpy().tobytes())
        for arm in ('A', 'B'):
            state = torch.load(io.BytesIO(archive.read(f'{arm}/endpoint-adapter.pt')), weights_only=True, map_location='cpu')
            if (state['arm'] != arm or state['epochs'] != 2 or state['pilot_release_sha256'] != pilot_sha
                    or state['release_approved'] is not False or set(state['model']) != set(initial)
                    or state['initial_state_sha256'] != initial_hash.hexdigest()
                    or result['arms'][arm]['initial_state_sha256'] != initial_hash.hexdigest()):
                raise ValueError('Endpoint identity/initialization mismatch')
            changes = dict(adapters=0, high_frequency=0, decoder=0)
            for name, value in state['model'].items():
                original = initial[name]
                if value.shape != original.shape or value.dtype != original.dtype or not torch.isfinite(value).all():
                    raise ValueError('Invalid checkpoint tensor')
                changes[group(name)] += int(not torch.equal(value, original))
            if not all(changes.values()): raise ValueError('Unchanged intended group')
            checkpoint_changes[arm] = changes
            del state
        del initial, saved
        stderr_empty = not archive.read('stderr.log')
    a, b = computed['A'][-1]['groups'], computed['B'][-1]['groups']
    deltas = {c: b[c]['dice'] - a[c]['dice'] for c in ('segm_flux1dev', 'random_flux1dev')}
    passed = (all(d >= .03 - 1e-12 for d in deltas.values())
        and b['authentic_control']['images_with_highlights'] <= a['authentic_control']['images_with_highlights']
        and b['authentic_control']['highlighted_area_mean'] <= a['authentic_control']['highlighted_area_mean'])
    if passed or result['comparison']['status'] != 'directional_screen_not_reached':
        raise ValueError('Unexpected comparison decision')
    for c, d in deltas.items():
        if not np.isclose(d, result['comparison']['dice_changes'][c], atol=1e-12): raise ValueError('Delta mismatch')
    report = dict(archive_sha256=file_sha(args.archive), all_15_payload_hashes_verified=True,
        package_identities_match=True, all_600_asset_pairs_verified=True,
        all_160_training_regions_verified=True, all_six_prediction_targets_and_metrics_verified=True,
        identical_saved_baselines=True, initial_trainable_state_matches_pinned_base=True,
        checkpoint_changed_tensor_counts=checkpoint_changes, stderr_empty=stderr_empty,
        arms=computed, endpoint_dice_changes=deltas, directional_screen_passed=False,
        decision='Do not extend or deploy this loss modification on the basis of this pilot.',
        release_approved=False, final_test_opened=False, inference_replayed=False,
        limitation='Saved-output audit on a reused development cohort, not independent GPU replay or final-test accuracy.')
    args.output.mkdir(parents=True)
    (args.output / 'audit.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    with (args.output / 'per-image-endpoints.csv').open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=['arm', 'sample_id', 'condition', 'highlighted', 'area', 'dice', 'lift'])
        writer.writeheader(); writer.writerows(per_image)
    import os
    os.environ.setdefault('MPLCONFIGDIR', str(args.output / 'mpl-cache'))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    for family in range(3):
        fig, axes = plt.subplots(3, 4, figsize=(11, 8))
        for j in range(3):
            index = family * 3 + j
            row = validation[index]
            with Image.open(data / local_rows[row['sample_id']]['image']) as im:
                image = np.asarray(im.convert('RGB'))
            displays = [image, expected_targets[index], previews['A'][index] >= .5, previews['B'][index] >= .5]
            for ax, values, title in zip(axes[j], displays, [row['condition'], 'Known edit mask', 'Arm A, cutoff 0.50', 'Arm B, cutoff 0.50']):
                ax.imshow(values, **({} if values.ndim == 3 else dict(cmap='gray', vmin=0, vmax=1)))
                ax.set_title(title, fontsize=9); ax.axis('off')
        fig.suptitle(f"Fixed validation family {validation[family * 3]['source_id']} — not product results")
        fig.tight_layout(); fig.savefig(args.output / f'family-{family+1}.png', dpi=110); plt.close(fig)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
