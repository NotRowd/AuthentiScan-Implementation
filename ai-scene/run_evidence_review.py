"""Six existing regression images, baseline plus second pass, no deployment.

Development evidence only, not independent accuracy validation. No new downloads.
"""
import argparse
import hashlib
import json
from pathlib import Path
import threading
import time

from compare_visual_prompts import free_memory_bytes
from evaluate_visual_candidate import PROMPT, REQUEST_VERSION, CANDIDATE, request_review, parse_review
from evidence_review_candidate import (VERSION, PROMPT as CHECK_PROMPT,
    claims_for, schema_for, request_check, parse_check, apply_check)
from qwen_service import runtime, prepare_image

ROOT = Path(__file__).resolve().parent


def prepare_cases(classroom, road):
    saved = ROOT / 'runs/loyd-visual-return-2026-10-27/images'
    cases = [
        ('classroom', classroom, 'Seated people in a room and a foreground face. No guessed text, camera-lens edge, or concern based only on sideways gaze/blur.'),
        ('road', road, 'Person in a swimming pose appearing to intersect the road, with splashing water. Retain the observable arm/road relationship if assessable; no invented visible sun, lighting mismatch or hand defect.'),
        ('logo', saved / 'project-logo.png', 'Stylized shield/logo with magnifier. No invented camera, anatomical or photographic anomaly.'),
        ('sheep', saved / 'sheep-original.png', 'Sheep in an outdoor setting. No invented eye defect or a concern justified only by occlusion.'),
        ('fence', saved / 'fence-original.png', 'Fence and a red sign in an outdoor setting. No invented visible inconsistency.'),
        ('fence-edited', saved / 'fence-edited.png', 'Fence with red sign and bent black symbol. Do not confidently identify an unsupported left-pointing arrow; plausible edited content need not be flagged.')]
    expected = {'classroom': 'c5c48ad3a754acf0dbf60c9fb8b2095d1285230453f3b8793259228821c3ef0a',
                'road': 'a93b1216a5e91d035d148c12eaa0f452365773d3aaeeac78b64c0a106468d55b'}
    prepared = []
    for name, path, expectation in cases:
        payload = path.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        if name in expected and digest != expected[name]:
            raise ValueError('Previously reviewed regression image changed: ' + name)
        prepared.append((prepare_image(payload), dict(sample=name, input_sha256=digest,
            input_path=str(path.resolve()), human_expectation=expectation)))
    return prepared


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--classroom', type=Path, required=True)
    parser.add_argument('--road', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists(): raise ValueError('Use a new output directory')
    available = free_memory_bytes()
    if available < 4 * 1024**3:
        raise RuntimeError(f'At least 4 GiB free RAM needed; available {available / 1024**3:.2f}')
    cases = prepare_cases(args.classroom, args.road)
    args.output.mkdir(parents=True)
    plan = dict(model=CANDIDATE, baseline_version=REQUEST_VERSION, candidate_version=VERSION,
        baseline_prompt=PROMPT, check_prompt=CHECK_PROMPT, free_memory_bytes=available,
        cases=[case for _, case in cases], max_model_requests=12, development_only=True,
        production_changed=False, accuracy_validated=False,
        acceptance='Manual review required: reduce unsupported claims, no additional false claims, retain road/arm concern, no falsely clean replacements. All-abstention fails usefulness. Passing this reused six-case screen only permits broader evaluation.')
    (args.output / 'plan.json').write_text(json.dumps(plan, indent=2), encoding='utf-8')
    stop = threading.Event()
    summaries = []
    try:
        with runtime(stop):
            for png, case in cases:
                started = time.monotonic()
                report = dict(**case, completed=False)
                print('Reviewing ' + case['sample'], flush=True)
                try:
                    raw = request_review(png)
                    report['baseline_raw'] = raw
                    baseline = parse_review(raw)
                    report['baseline'] = baseline
                    report['baseline_seconds'] = round(time.monotonic() - started, 2)
                    claims = claims_for(baseline)
                    report['check_schema'] = schema_for(claims)
                    check_raw = request_check(png, claims)
                    report['check_raw'] = check_raw
                    checks = parse_check(check_raw, claims)
                    report['checks'] = checks
                    report['candidate'] = apply_check(baseline, checks)
                    report['completed'] = True
                except Exception as error:
                    report['error_type'] = type(error).__name__
                    raise
                finally:
                    report['total_seconds'] = round(time.monotonic() - started, 2)
                    (args.output / (case['sample'] + '.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')
                    summary = {key: report[key] for key in ('sample', 'completed', 'total_seconds')}
                    summaries.append(summary)
                    print(json.dumps(summary), flush=True)
    finally:
        stop.set()
        (args.output / 'summary.json').write_text(json.dumps(dict(results=summaries,
            human_review_required=True, accuracy_validated=False, deployment_approved=False), indent=2), encoding='utf-8')


if __name__ == '__main__': main()
