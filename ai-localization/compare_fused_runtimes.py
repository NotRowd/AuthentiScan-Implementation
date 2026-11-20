"""Verify saved nine-case runtime comparisons; never runs or promotes a model."""
import argparse
import json
from pathlib import Path
import numpy as np
from evaluate_fused_candidate import selected_rows, metrics


def audit(baseline, candidate):
    expected = selected_rows()
    expected_ids = {row['sample_id'] for row in expected}
    reports = [json.loads((directory / 'RESULT.json').read_text(encoding='utf-8'))
               for directory in (baseline, candidate)]
    for report in reports:
        if report['stage'] != 'development_screen_complete' or report['threshold'] != .5 or report['release_approved'] is not False:
            raise ValueError('Incomplete or changed evaluation')
        if len(report['rows']) != 9 or {r['sample_id'] for r in report['rows']} != expected_ids:
            raise ValueError('Wrong comparison cohort')
    if reports[0]['source_commit'] != reports[1]['source_commit']:
        raise ValueError('Source changed between runs')
    if reports[0].get('checkpoint', 'opensdi') != reports[1].get('checkpoint', 'opensdi'):
        raise ValueError('Checkpoint changed between runtime comparison runs')
    if reports[1]['runtime']['author_inference_versions'] is not True:
        raise ValueError('Candidate did not check author inference versions')
    rows = []
    for row in expected:
        sample = row['sample_id']
        a = next(r for r in reports[0]['rows'] if r['sample_id'] == sample)
        b = next(r for r in reports[1]['rows'] if r['sample_id'] == sample)
        if any(a[key] != b[key] for key in ('image_sha256', 'mask_sha256', 'condition')):
            raise ValueError('Input identity changed')
        with np.load(baseline / (sample + '.npz'), allow_pickle=False) as old, np.load(candidate / (sample + '.npz'), allow_pickle=False) as new:
            if not np.array_equal(old['truth'], new['truth']):
                raise ValueError('Different masks')
            truth = new['truth'] // 255
            for stored, scores in ((a, old['scores']), (b, new['scores']), (b['upstream_postprocess'], new['upstream_scores'])):
                actual = metrics(scores, truth)
                for key, value in actual.items():
                    if value is None:
                        if stored[key] is not None:
                            raise ValueError('Authentic Dice should be null')
                    elif not np.isclose(value, stored[key], rtol=0, atol=1e-9):
                        raise ValueError('Recorded metric does not match saved map')
            rows.append(dict(sample_id=sample, condition=row['condition'],
                max_score_difference=float(np.max(np.abs(old['scores']-new['scores']))),
                mask_disagreement=float(np.mean((old['scores'] >= .5) != (new['scores'] >= .5))),
                baseline=metrics(old['scores'], truth), current=metrics(new['scores'], truth),
                upstream=metrics(new['upstream_scores'], truth)))
    groups = {}
    for condition in sorted({row['condition'] for row in rows}):
        selected = [row for row in rows if row['condition'] == condition]
        groups[condition] = {}
        for variant in ('baseline', 'current', 'upstream'):
            dice = [r[variant]['dice'] for r in selected if r[variant]['dice'] is not None]
            groups[condition][variant] = dict(n=len(selected), mean_dice=float(np.mean(dice)) if dice else None,
                images_highlighted=sum(r[variant]['highlighted_fraction'] > 0 for r in selected),
                mean_highlighted_fraction=float(np.mean([r[variant]['highlighted_fraction'] for r in selected])))
    return dict(scope='Fixed development screen; not release validation', release_approved=False,
        runtimes=[report['runtime'] for report in reports], groups=groups, rows=rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True, type=Path)
    parser.add_argument('--candidate', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    result = audit(args.baseline, args.candidate)
    with args.output.open('x', encoding='utf-8') as handle:
        json.dump(result, handle, indent=2)
    print(json.dumps(result['groups'], indent=2))


if __name__ == '__main__':
    main()
