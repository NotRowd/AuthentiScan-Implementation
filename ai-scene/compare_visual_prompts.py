"""Six bounded local requests, same model/settings, no automatic promotion.

Development regression examples only. Never opens sealed localization test data,
updates saved scans, charges credits, or sends images outside loopback.
"""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import threading
import time

from evaluate_visual_candidate import PROMPT, REQUEST_VERSION, CANDIDATE, request_review, parse_review
from qwen_service import runtime, prepare_image
from visual_prompt_candidate import PROMPT_CANDIDATE, VERSION

ROOT = Path(__file__).resolve().parent


def free_memory_bytes():
    class Memory(ctypes.Structure):
        _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong)] + [
            (name, ctypes.c_ulonglong) for name in ('total', 'available', 'total_page',
                'available_page', 'total_virtual', 'available_virtual', 'extended')]
    if os.name != 'nt':
        raise RuntimeError('This bounded runner requires the Windows memory check')
    memory = Memory()
    memory.length = ctypes.sizeof(memory)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
        raise RuntimeError('Could not check available memory')
    return memory.available


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--classroom', type=Path, required=True)
    parser.add_argument('--road', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Use a new output directory')
    available = free_memory_bytes()
    if available < 4 * 1024**3:
        raise RuntimeError(f'At least 4 GiB free RAM required; available {available / 1024**3:.2f} GiB')
    cases = [
        ('classroom', args.classroom,
         'Describe a classroom with seated people and foreground face. Do not guess lanyard text. Eye blur or sideways gaze alone is not a concern.'),
        ('road', args.road,
         'Describe a person in a swimming pose appearing to intersect the roadway, with splashing water. Flag this visible surface relationship if assessable; do not assert how it was created.'),
        ('logo', ROOT.parent / 'firebase-local/src/assets/logo.png',
         'Recognize a stylized shield/logo. No realistic eye/body or photographic lighting assessment; artwork alone is not a concern.')]
    # Freeze expectations and input hashes before any model response is seen.
    inputs = []
    for name, path, expectation in cases:
        payload = path.read_bytes()
        inputs.append((name, prepare_image(payload), dict(sample=name,
            input_sha256=hashlib.sha256(payload).hexdigest(), human_expectation=expectation)))
    args.output.mkdir(parents=True)
    plan = dict(model=CANDIDATE, free_memory_bytes=available, development_only=True,
        production_changed=False, accuracy_validated=False,
        variants={REQUEST_VERSION: PROMPT, VERSION: PROMPT_CANDIDATE},
        cases=[entry[2] for entry in inputs])
    (args.output / 'plan.json').write_text(json.dumps(plan, indent=2), encoding='utf-8')
    stop = threading.Event()
    results = []
    try:
        with runtime(stop):
            for name, png, case in inputs:
                for version, prompt in plan['variants'].items():
                    print(f'Reviewing {name}: {version}', flush=True)
                    report = dict(**case, prompt_version=version, completed=False)
                    start = time.monotonic()
                    try:
                        raw = request_review(png, prompt=prompt)
                        report['raw_response'] = raw
                        report['parsed'] = parse_review(raw)
                        report['completed'] = True
                    except Exception as error:
                        report['error_type'] = type(error).__name__
                        raise
                    finally:
                        report['seconds'] = round(time.monotonic() - start, 2)
                        (args.output / f'{name}-{version}.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
                        results.append({key: report[key] for key in ('sample', 'prompt_version', 'completed', 'seconds')})
                        print(json.dumps(results[-1]), flush=True)
    finally:
        stop.set()
        (args.output / 'summary.json').write_text(json.dumps(dict(results=results,
            human_review_required=True, deployment_approved=False, accuracy_validated=False), indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
