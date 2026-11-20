"""Review saved validation predictions, without changing the model or threshold."""
import argparse
import base64
import html
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

from supervised_localizer import ARCHITECTURE, operating_metrics, relative_file, sha, training_rows


def read_validation(data, returned, expected_architecture=ARCHITECTURE):
    rows = [r for r in training_rows(data) if r['split'] == 'validation']
    order = json.loads((returned / 'validation-sample-order.json').read_text())
    if order != [r['sample_id'] for r in rows]:
        raise ValueError('Validation prediction order mismatch')
    report = json.loads((returned / 'validation-report.json').read_text())
    if (report['architecture'] != expected_architecture or report['head_sha256'] != sha(returned / 'best-head.pt')
            or report['training_manifest_sha256'] != sha(data / 'training-manifest.csv')):
        raise ValueError('Validation provenance mismatch')
    with np.load(returned / 'validation-predictions.npz', allow_pickle=False) as archive:
        p, t = archive['probabilities'], archive['targets']
    if p.shape != (len(rows), 32, 32) or t.shape != p.shape:
        raise ValueError('Validation tensor shape mismatch')
    if not np.isfinite(p).all() or not np.isfinite(t).all() or min(p.min(), t.min()) < 0 or max(p.max(), t.max()) > 1:
        raise ValueError('Invalid validation tensors')
    threshold = report['threshold']
    if threshold is not None:
        if not np.isfinite(threshold) or not .01 <= threshold <= .99:
            raise ValueError('Invalid selected threshold')
        groups = operating_metrics(p, t, rows, threshold)
        if groups != report['groups']:
            raise ValueError('Reported metrics do not match saved predictions')
    else:
        groups = None
    return rows, report, p, t, groups


def png_uri(image):
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')


def candidate_overlay(original, mask, color):
    # Nearest-neighbor grid: no smoothing that suggests pixel-exact boundaries.
    alpha = Image.fromarray((mask.astype(np.uint8) * 130), mode='L').resize(original.size, Image.Resampling.NEAREST)
    layer = Image.new('RGBA', original.size, color)
    layer.putalpha(alpha)
    return Image.alpha_composite(original.convert('RGBA'), layer).convert('RGB')


def review(data, returned, output, expected_architecture=ARCHITECTURE):
    rows, report, p, t, groups = read_validation(data, returned, expected_architecture)
    output.mkdir(parents=True, exist_ok=False)
    summaries = {}
    for condition in sorted({r['condition'] for r in rows}):
        values = p[[i for i, row in enumerate(rows) if row['condition'] == condition]]
        summaries[condition] = dict(images=len(values), score_mean=float(values.mean()),
                                    image_max_score_mean=float(values.max(axis=(1, 2)).mean()),
                                    score_min=float(values.min()), score_max=float(values.max()))
    audit = dict(status=report['status'], threshold=report['threshold'], groups=groups,
                 score_summary=summaries, metrics_recomputed=True, threshold_retuned=False,
                 test_images_used=0, release_approved=False,
                 examples='First three validation source families in manifest order, not selected for appearance.')
    (output / 'review.json').write_text(json.dumps(audit, indent=2), encoding='utf-8')
    source_ids = list(dict.fromkeys(r['source_id'] for r in rows))[:3]
    hashes = json.loads((data / 'asset-sha256.json').read_text())
    cards = []
    for index, row in enumerate(rows):
        if row['source_id'] not in source_ids:
            continue
        path = relative_file(data, row['image'])
        if sha(path) != hashes[row['image']]:
            raise ValueError('Review image checksum mismatch')
        with Image.open(path) as image:
            rgba = ImageOps.exif_transpose(image).convert('RGBA')
            original = Image.alpha_composite(Image.new('RGBA', rgba.size, 'white'), rgba).convert('RGB')
            original = original.resize((448, 448), Image.Resampling.BICUBIC)
        truth = candidate_overlay(original, t[index] >= .5, (0, 180, 130, 255))
        predicted = (candidate_overlay(original, p[index] >= report['threshold'], (235, 0, 140, 255))
                     if report['threshold'] is not None else None)
        views = [('Original (model geometry)', original), ('Ground truth, pooled 32×32', truth)]
        if predicted is not None:
            views.append(('Predicted mask at selected threshold', predicted))
        comparison = Image.new('RGB', (448 * len(views), 492), 'white')
        draw = ImageDraw.Draw(comparison)
        for column, (label, image) in enumerate(views):
            comparison.paste(image, (448 * column, 44))
            draw.text((448 * column + 8, 8), label, fill='black')
            draw.text((448 * column + 8, 24), row['sample_id'], fill='black')
        comparison.save(output / f'comparison-{index:03d}.png')
        figures = ''.join(f'<figure><img src="{png_uri(image)}"><figcaption>{html.escape(label)}</figcaption></figure>'
                          for label, image in views)
        detail = ('No acceptable validation threshold; no binary prediction displayed.' if predicted is None
                  else f'Predicted area: {100 * (p[index] >= report["threshold"]).mean():.1f}%')
        cards.append(f'<section><h2>{html.escape(row["sample_id"])}</h2><p>{detail}</p><div class="grid">{figures}</div></section>')
    page = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Localization validation review</title>'
    page += '<style>body{font:16px system-ui;max-width:1400px;margin:24px auto;padding:16px;background:#f3f7fb;color:#123}section{background:white;padding:20px;margin:20px 0;border:1px solid #ccd}h1{font-size:28px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0}img{width:100%}pre{overflow:auto;white-space:pre-wrap}figcaption{padding:8px;font-weight:bold}</style>'
    page += f'<h1>Research localization — {html.escape(report["status"])}</h1>'
    page += '<p>Actual saved validation predictions. Not deployed. Green = ground truth; magenta = predicted candidate cells. A coarse mask is not proof or an exact edited boundary. These are validation examples, not final-test results.</p>'
    page += '<details><summary>Verified metrics and score ranges</summary><pre>' + html.escape(json.dumps(audit, indent=2)) + '</pre></details>'
    page += ''.join(cards) + '</html>'
    (output / 'index.html').write_text(page, encoding='utf-8')
    print(json.dumps(audit, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('data', 'returned', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--architecture', choices=(ARCHITECTURE, 'dinov2s14-standardized-delta-paired-v2'),
                        default=ARCHITECTURE, help='Explicit expected research architecture; does not authorize deployment.')
    args = parser.parse_args()
    review(args.data, args.returned, args.output, args.architecture)
