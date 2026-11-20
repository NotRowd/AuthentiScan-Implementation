"""Audit Loyd's v2 nine-image SOFAKE return without running the model."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile
import numpy as np
from PIL import Image
from evaluate_fused_candidate import DATA, ROOT, SOFAKE, digest, metrics, selected_rows


def audit(archive, output):
    cohort = selected_rows()
    ids = {row['sample_id'] for row in cohort}
    expected = {'LAUNCHER.json', 'stdout.log', 'stderr.log', 'results/RESULT.json'}
    expected.update('results/' + sample + suffix for sample in ids for suffix in ('.npz', '.png'))
    with zipfile.ZipFile(ROOT / 'handoff/AuthentiScan-FUSED-Loader-Fix-v2.zip') as fix:
        release_hash = json.loads(fix.read('FIX.json'))['new_release_sha256']
    with zipfile.ZipFile(archive) as bundle:
        assert len(bundle.namelist()) == len(set(bundle.namelist()))
        assert set(bundle.namelist()) == expected | {'SHA256.json'}
        assert sum(i.file_size for i in bundle.infolist()) < 200 * 1024**2
        hashes = json.loads(bundle.read('SHA256.json'))
        assert set(hashes) == expected
        payload = {name: bundle.read(name) for name in expected}
        for name, data in payload.items():
            assert hashlib.sha256(data).hexdigest() == hashes[name], name
        launcher = json.loads(payload['LAUNCHER.json'])
        report = json.loads(payload['results/RESULT.json'])
        assert launcher['release_sha256'] == release_hash
        assert launcher['completed'] is True and launcher['exit_code'] == 0
        assert launcher['loader_revision'] == 2 and launcher['release_approved'] is False
        assert report['stage'] == 'development_screen_complete' and report['threshold'] == .5
        assert report['checkpoint'] == 'sofake' and report['release_approved'] is False
        assert report['source_commit'] == 'e8580ebad33decf0787a96133af4fafee640e024'
        runtime = report['runtime']
        assert runtime['checkpoint_sha256'] == SOFAKE[2]
        assert runtime['device'] == 'cpu' and runtime['precision'] == 'float32'
        for key in ('author_inference_versions', 'backbone_strict_load', 'retained_weights_exact'):
            assert runtime[key] is True
        assert len(report['rows']) == 9 and {r['sample_id'] for r in report['rows']} == ids
        rows = []
        for entry in cohort:
            sample = entry['sample_id']
            stored = next(row for row in report['rows'] if row['sample_id'] == sample)
            assert stored['condition'] == entry['condition']
            assert stored['image_sha256'] == digest(DATA / entry['image'])
            assert stored['mask_sha256'] == digest(DATA / entry['mask'])
            with Image.open(DATA / entry['mask']) as im:
                truth = np.asarray(im.convert('L'))
            with Image.open(DATA / entry['image']) as im:
                original = np.asarray(im.convert('RGB')).astype(np.float32)
            with np.load(io.BytesIO(payload['results/' + sample + '.npz']), allow_pickle=False) as maps:
                assert set(maps.files) == {'scores', 'native_scores', 'upstream_scores', 'truth'}
                assert np.array_equal(maps['truth'], truth)
                scores, native, upstream = maps['scores'], maps['native_scores'], maps['upstream_scores']
                assert native.shape == (512, 512) and np.isfinite(native).all()
                assert native.min() >= 0 and native.max() <= 1
                recomputed_upstream = np.asarray(Image.fromarray((native * 255).astype(np.uint8)).resize(
                    (truth.shape[1], truth.shape[0]), Image.Resampling.BILINEAR)).astype(np.float32) / 255
                assert np.array_equal(upstream, recomputed_upstream)
                current = metrics(scores, truth // 255)
                author = metrics(upstream, truth // 255)
                for recorded, recalculated in ((stored, current), (stored['upstream_postprocess'], author)):
                    for key, value in recalculated.items():
                        assert recorded[key] is None if value is None else np.isclose(value, recorded[key], rtol=0, atol=1e-9)
                alpha = (scores >= .5)[..., None] * .45
                overlay = (original * (1-alpha) + np.array([255, 50, 140]) * alpha).astype(np.uint8)
                with Image.open(io.BytesIO(payload['results/' + sample + '.png'])) as im:
                    assert np.array_equal(np.asarray(im.convert('RGB')), overlay)
                rows.append(dict(sample_id=sample, condition=entry['condition'], seconds=stored['seconds'],
                    current=current, upstream=author))
        groups = {}
        for condition in sorted({row['condition'] for row in rows}):
            group = [row for row in rows if row['condition'] == condition]
            groups[condition] = {}
            for variant in ('current', 'upstream'):
                values = [row[variant] for row in group]
                dice = [r['dice'] for r in values if r['dice'] is not None]
                groups[condition][variant] = dict(images=len(values),
                    images_highlighted=sum(r['highlighted_fraction'] > 0 for r in values),
                    mean_highlighted_fraction=float(np.mean([r['highlighted_fraction'] for r in values])),
                    mean_dice=float(np.mean(dice)) if dice else None)
        result = dict(archive_sha256=digest(archive), payloads_verified=len(expected),
            package_release_matches=True, metrics_recomputed=True, overlays_verified=True,
            scope='Nine development cases from three source families; not population accuracy or release validation',
            release_approved=False, total_forward_seconds=sum(row['seconds'] for row in rows), groups=groups, rows=rows)
        output.mkdir(parents=True, exist_ok=False)
        for name, data in payload.items():
            path = output / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        (output / 'SHA256.json').write_bytes(bundle.read('SHA256.json'))
        (output / 'AUDIT.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.archive, args.output)
    print(json.dumps({key: value for key, value in result.items() if key != 'rows'}, indent=2))
