"""Local-only development screen. Never uploads images or writes scan records."""
import argparse
import json
from pathlib import Path
import threading
import time
from qwen_service import QwenModel, runtime
from evaluate_visual_candidate import request_review

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--image', type=Path, action='append', help='Explicit local development image; never uploaded')
args = parser.parse_args()
destination = args.output
destination.mkdir()
cases = args.image or [root.parent / 'firebase-local/src/assets/logo.png'] + [
    root / 'runs/loyd-visual-return-2026-10-27/images' / name
    for name in ('fence-original.png', 'fence-edited.png')]
stop = threading.Event()
results = []
with runtime(stop):
    print('Private CPU model ready. No production services changed.', flush=True)
    def capture(png):
        raw = request_review(png)
        (destination / 'last-response.json').write_text(raw, encoding='utf-8')
        return raw
    model = QwenModel(capture)
    for image in cases:
        start = time.monotonic()
        print('Reviewing ' + image.name, flush=True)
        try:
            result = model.features(image.read_bytes())
            row = dict(image=image.name, seconds=round(time.monotonic()-start, 2), review=result,
                       accuracy_validated=False)
        except Exception as error:
            row = dict(image=image.name, error=type(error).__name__, message=str(error),
                       cause=str(error.__cause__) if error.__cause__ else None)
        results.append(row)
        (destination / 'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
        print(json.dumps(row), flush=True)
        if 'error' in row:
            raise SystemExit('Review failed; no automatic rerun.')
