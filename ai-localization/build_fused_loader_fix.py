"""Build a small correction ZIP; reuse Loyd's existing weights and environment."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent


def main():
    output = ROOT / 'handoff/AuthentiScan-FUSED-Loader-Fix-v2.zip'
    original = ROOT / 'handoff/AuthentiScan-FUSED-Evaluation-Loyd-v1.zip'
    with zipfile.ZipFile(original) as z:
        old_bytes = z.read('RELEASE.json')
        release = json.loads(old_bytes)
        runner = z.read('run_evaluation.py').decode('utf-8').replace('evaluation-output', 'evaluation-output-v2')
        runner = runner.replace('release_approved=False, timeout_seconds=1800)', 'release_approved=False, timeout_seconds=1800, loader_revision=2)')
        guide = z.read('START-HERE.md').decode('utf-8').replace('evaluation-output', 'evaluation-output-v2')
    guide = ('# Loader correction v2 applied\n\nThe existing .venv and model weights are reused. '
             'Previous failed results remain in evaluation-output; the new run writes evaluation-output-v2. '
             'Do not recreate the environment if its documented versions are already installed.\n\n' + guide)
    payload = {'ai-localization/evaluate_fused_candidate.py': (ROOT / 'evaluate_fused_candidate.py').read_bytes(),
               'run_evaluation.py': runner.encode('utf-8'), 'START-HERE.md': guide.encode('utf-8')}
    replacement_hashes = {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}
    release['files'].update(replacement_hashes)
    release['loader_revision'] = 2
    release['supersedes_release_sha256'] = hashlib.sha256(old_bytes).hexdigest()
    new_bytes = json.dumps(release, indent=2).encode('utf-8')
    manifest = dict(replacements=replacement_hashes, new_release_sha256=hashlib.sha256(new_bytes).hexdigest())
    readme = '''# FUSED loader correction for Loyd

The first run stopped before any image inference because the evaluator rejected
legacy SOFAKE checkpoint configuration names. This correction explicitly handles
the reviewed names and preserves strict weight checks. No training or model download.

1. Keep the original extracted AuthentiScan-FUSED-Evaluation-Loyd-v1 folder and .venv.
2. Extract this small correction ZIP into a separate folder.
3. Stop any evaluation process, then run from this correction folder (adjust package path):

   py -3.11 apply_loader_fix.py --package "E:\\Download\\AuthentiScan-FUSED-Evaluation-Loyd-v1"

4. In the original package folder, use its existing environment:

   & '.\\.venv\\Scripts\\python.exe' verify_package.py
   & '.\\.venv\\Scripts\\python.exe' -u run_evaluation.py

Require at least 6 GiB free RAM. Keep the PC awake and launcher running. Run once;
the worker has a 30-minute limit. Do not change thresholds, resolution, precision,
use GPU, train, or deploy. Do not retry automatically.

Send evaluation-output-v2/Return-to-Kent-FUSED.zip, including if the run fails.
Old output is preserved; original changed files are in loader-fix-v2-backup.
The correction was checked against all 875 retained tensors of both checkpoints.
Full SOFAKE image inference has not yet run; detection quality is still unknown.
'''
    entries = {'apply_loader_fix.py': (ROOT / 'fused-handoff/apply_loader_fix.py').read_bytes(),
               'FIX.json': json.dumps(manifest, indent=2).encode('utf-8'),
               'START-HERE-FIX.md': readme.encode('utf-8')}
    entries.update({'payload/' + name: data for name, data in payload.items()})
    with zipfile.ZipFile(output, 'x', zipfile.ZIP_DEFLATED) as z:
        for name, data in entries.items(): z.writestr(name, data)
        z.writestr('SHA256.json', json.dumps({n: hashlib.sha256(d).hexdigest() for n, d in entries.items()}, indent=2))
    with zipfile.ZipFile(output) as z:
        assert z.testzip() is None
        for name, expected in json.loads(z.read('SHA256.json')).items():
            assert hashlib.sha256(z.read(name)).hexdigest() == expected
    print(json.dumps(dict(file=str(output), bytes=output.stat().st_size,
        sha256=hashlib.sha256(output.read_bytes()).hexdigest(), verified=True,
        new_release_sha256=manifest['new_release_sha256']), indent=2))


if __name__ == '__main__': main()
