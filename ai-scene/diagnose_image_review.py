"""Reproduce one local review without Firebase writes or classifier calls.

Requires model port 5007 to be free; never adopts or stops an existing service.
Stores model text locally for debugging, not image bytes or authentication keys.
"""
import argparse
import hashlib
import json
from pathlib import Path
import threading
import time

from evaluate_visual_candidate import request_review, parse_review, CANDIDATE, REQUEST_VERSION
from qwen_service import runtime, prepare_image, QwenModel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Use a new output directory')
    payload = args.image.read_bytes()
    png = prepare_image(payload)
    args.output.mkdir(parents=True)
    report = dict(model=CANDIDATE, request_version=REQUEST_VERSION, input_sha256=hashlib.sha256(payload).hexdigest(),
                  completed=False, changes_saved_scan=False)
    stop = threading.Event()
    try:
        with runtime(stop):
            print('Isolated diagnostic model ready; no saved scan changes.', flush=True)
            start = time.monotonic()
            raw = request_review(png)
            report['seconds'] = time.monotonic()-start
            report['raw_response'] = raw
            report['parsed'] = parse_review(raw)
            model = QwenModel(infer=lambda _: raw)
            report['scene'] = model.predict(payload)
            report['features'] = model.features(payload)
            report['completed'] = True
    except Exception as error:
        # Parser/transport types are enough for terminal output. Keep raw model
        # text only in this explicitly requested local diagnostic report.
        report['error_type'] = type(error).__name__
        if isinstance(error, (ValueError, json.JSONDecodeError)):
            report['validation_error'] = str(error)
    finally:
        stop.set()
        (args.output/'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('completed', 'seconds', 'error_type', 'validation_error') if key in report}), flush=True)


if __name__ == '__main__':
    main()
