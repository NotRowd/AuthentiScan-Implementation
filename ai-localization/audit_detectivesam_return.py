"""Audit returned numerical evidence without loading a detector or running code from ZIP."""
import hashlib
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent


def sha(data):
    return hashlib.sha256(data).hexdigest()


def audit():
    archive = Path('D:/Downloads/Return-to-Kent-DetectiveSAM.zip')
    package = ROOT / 'handoff/AuthentiScan-DetectiveSAM-Evaluation-Loyd-v1.zip'
    output = ROOT / 'runs/loyd-detectivesam-return-2026-10-27'
    with zipfile.ZipFile(package) as p, zipfile.ZipFile(archive) as z:
        release = p.read('RELEASE.json')
        cases = json.loads(p.read('CASES.json'))
        expected = {'LAUNCHER.json', 'results/RESULT.json', 'stdout.log', 'stderr.log'}
        expected.update('results/' + c['sample_id'] + ext for c in cases for ext in ('.npz', '.png'))
        assert len(z.namelist()) == len(set(z.namelist()))
        assert set(z.namelist()) == expected | {'SHA256.json'}
        assert sum(i.file_size for i in z.infolist()) < 200 * 1024**2
        hashes = json.loads(z.read('SHA256.json'))
        assert set(hashes) == expected
        payload = {n: z.read(n) for n in expected}
        assert all(sha(payload[n]) == hashes[n] for n in expected)
        launcher = json.loads(payload['LAUNCHER.json'])
        report = json.loads(payload['results/RESULT.json'])
        assert launcher['release_sha256'] == sha(release)
        assert launcher['completed'] and launcher['exit_code'] == 0
        assert not launcher['release_approved'] and not report['release_approved']
        assert report['completed'] and report['threshold'] == .5 and not report['source_reference_used']
        assert len(report['rows']) == 9
        assert {r['sample_id'] for r in report['rows']} == {c['sample_id'] for c in cases}
        measured = []
        panels = []
        for case in cases:
            sample = case['sample_id']
            row = next(r for r in report['rows'] if r['sample_id'] == sample)
            assert row['condition'] == case['condition']
            image_bytes, mask_bytes = p.read(case['image']), p.read(case['mask'])
            assert sha(image_bytes) == case['image_sha256'] and sha(mask_bytes) == case['mask_sha256']
            with Image.open(io.BytesIO(mask_bytes)) as im:
                truth = np.asarray(im.convert('L')) > 127
            with Image.open(io.BytesIO(image_bytes)) as im:
                original = np.asarray(im.convert('RGB').resize((448, 448))).copy()
            with np.load(io.BytesIO(payload['results/' + sample + '.npz']), allow_pickle=False) as arrays:
                assert set(arrays.files) == {'scores', 'truth', 'native_scores'}
                scores, native = arrays['scores'], arrays['native_scores']
                assert np.array_equal(truth, arrays['truth'])
                assert scores.shape == (448, 448) and native.shape == (512, 512)
                assert all(np.isfinite(a).all() and a.min() >= 0 and a.max() <= 1 for a in (scores, native))
                # Independently check half-pixel bilinear 512 -> 448, without importing Torch.
                coords = (np.arange(448) + .5) * (512 / 448) - .5
                lo = np.floor(coords).astype(int); hi = lo + 1; w = coords - lo
                horizontal = native[:, lo] * (1-w) + native[:, hi] * w
                resized = horizontal[lo, :] * (1-w[:, None]) + horizontal[hi, :] * w[:, None]
                assert np.allclose(scores, resized, atol=5e-5, rtol=0)
                pred = scores > .5
                tp = int((pred & truth).sum()); total = int(pred.sum() + truth.sum())
                values = dict(highlighted_fraction=float(pred.mean()),
                              dice=2*tp/total if truth.any() else None,
                              iou=tp/(total-tp) if truth.any() else None)
                for key, value in values.items():
                    assert row[key] is None if value is None else np.isclose(row[key], value, atol=1e-10, rtol=0)
                overlay = original.copy()
                overlay[pred] = (overlay[pred]*.55 + np.array([230, 0, 150])*.45).astype(np.uint8)
                with Image.open(io.BytesIO(payload['results/' + sample + '.png'])) as im:
                    assert np.array_equal(overlay, np.asarray(im.convert('RGB')))
                measured.append(dict(sample_id=sample, condition=case['condition'], seconds=row['seconds'], **values))
                panels.append((sample, original, truth, pred, values))
        groups = {}
        for condition in ('authentic_control', 'segm_flux1dev', 'random_flux1dev'):
            rows = [r for r in measured if r['condition'] == condition]
            groups[condition] = dict(images=len(rows), images_with_highlights=sum(r['highlighted_fraction'] > 0 for r in rows),
                mean_highlighted_fraction=float(np.mean([r['highlighted_fraction'] for r in rows])),
                mean_dice=float(np.mean([r['dice'] for r in rows])) if condition != 'authentic_control' else None)
            for key, value in groups[condition].items():
                stored = report['groups'][condition][key]
                assert stored is None if value is None else np.isclose(stored, value, atol=1e-10, rtol=0)
        passed = (groups['authentic_control']['images_with_highlights'] == 0
                  and groups['authentic_control']['mean_highlighted_fraction'] <= .01
                  and all(groups[c]['mean_dice'] >= .5 for c in ('segm_flux1dev', 'random_flux1dev')))
        assert passed == report['screen_passed']
        result = dict(archive_sha256=sha(archive.read_bytes()), payloads_verified=len(expected),
                      release_identity_verified=True, metrics_recomputed=True, masks_verified=True,
                      resize_verified=True, overlays_verified=True, screen_passed=passed, release_approved=False,
                      mean_forward_seconds=float(np.mean([r['seconds'] for r in measured])),
                      scope='Nine development images, three source families; not population accuracy', groups=groups, rows=measured)
        output.mkdir(parents=True, exist_ok=False)
        for name, data in payload.items():
            target = output / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
        (output / 'SHA256.json').write_bytes(z.read('SHA256.json'))
        (output / 'AUDIT.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(9, 3, figsize=(10, 27))
    for i, (sample, original, truth, pred, values) in enumerate(panels):
        for ax, data, title in zip(axes[i], (original, truth, pred),
                                   (sample, 'Known edit mask', 'Predicted mask at 0.50')):
            ax.imshow(data, cmap='gray', vmin=0, vmax=1 if data.ndim == 2 else 255)
            ax.set_title(title, fontsize=9); ax.axis('off')
        axes[i, 2].set_xlabel(f"Highlighted {values['highlighted_fraction']:.1%}; Dice {values['dice'] if values['dice'] is None else round(values['dice'], 3)}")
    fig.suptitle('DetectiveSAM development audit: white = edited / predicted region\nAuthentic controls have empty known masks. Screen FAILED.', fontsize=13)
    fig.tight_layout(rect=(0, 0, 1, .975))
    fig.savefig(output / 'MASK-COMPARISON.png', dpi=120); plt.close(fig)
    print(json.dumps({k:v for k,v in result.items() if k != 'rows'}, indent=2))


if __name__ == '__main__':
    audit()
