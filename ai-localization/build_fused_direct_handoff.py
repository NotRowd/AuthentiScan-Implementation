"""Package a fixed direct-source input comparison, without model weights."""
import hashlib
import json
from pathlib import Path
import zipfile
from evaluate_fused_candidate import ROOT, DATA, selected_rows, digest


def main():
    review=ROOT/'runs/fused-failure-review-2026-10-26-r3'
    baseline=ROOT/'runs/loyd-fused-return-v2-2026-10-26'
    original=ROOT/'handoff/AuthentiScan-FUSED-Evaluation-Loyd-v1.zip'
    entries={}
    inputs={}
    for row in selected_rows():
        sample=row['sample_id']; native=review/'native-assets'/(sample+'.png')
        entries['images/'+sample+'.png']=native.read_bytes()
        inputs[sample]=dict(native_sha256=digest(native),prepared_image_sha256=digest(DATA/row['image']),mask_sha256=digest(DATA/row['mask']))
    entries['INPUTS.json']=json.dumps(inputs,indent=2).encode()
    entries['BASELINE-SHA256.json']=(baseline/'SHA256.json').read_bytes()
    entries['direct_source_worker.py']=(ROOT/'fused-handoff/direct_source_worker.py').read_bytes()
    entries['verify_package.py']=(ROOT/'fused-handoff/verify_direct_source.py').read_bytes()
    with zipfile.ZipFile(original) as z:
        entries['process_lifecycle.py']=z.read('process_lifecycle.py')
        entries['THIRD-PARTY-NOTICES.md']=z.read('THIRD-PARTY-NOTICES.md')
        runner=z.read('run_evaluation.py').decode()
    runner=runner.replace('import json','import argparse\nimport json',1)
    runner=runner.replace("    output = ROOT / 'evaluation-output'", "    parser = argparse.ArgumentParser()\n    parser.add_argument('--package', type=Path, required=True)\n    args = parser.parse_args()\n    package = args.package.resolve()\n    output = ROOT / 'evaluation-output'")
    runner=runner.replace("purpose='fused-sofake-nine-image-cpu-evaluation-v1'", "purpose='fused-direct-source-comparison-v1'")
    runner=runner.replace('identity, release = verify()', 'identity, release = verify(package)')
    runner=runner.replace("str(ROOT / 'ai-localization/evaluate_fused_candidate.py')", "str(ROOT / 'direct_source_worker.py')")
    runner=runner.replace("'--require-author-runtime', '--checkpoint', 'sofake', '--output'", "'--package', str(package), '--output'")
    runner=runner.replace('Return-to-Kent-FUSED.zip','Return-to-Kent-FUSED-Direct.zip')
    entries['run_comparison.py']=runner.encode()
    entries['START-HERE.md']=b'''# FUSED direct-source comparison (no training)

Purpose: check whether the earlier 448x448 preprocessing contributed to failure.
Only the input path changes: original-size RGB -> 512, instead of ->448 ->512.
Same nine images, SOFAKE weights, CPU float32, threshold 0.5 and 448 scoring masks.
This cannot prove general accuracy. No deployment, threshold tuning or training.

Extract this ZIP into a NEW folder alongside the existing corrected FUSED v1
folder. Keep the existing .venv and evaluation-output-v2 intact. No downloads.
Need 6 GiB free RAM. Keep the computer awake and the launcher running.

In PowerShell inside this NEW comparison folder (adjust original package path):

& 'E:\\Download\\AuthentiScan-FUSED-Evaluation-Loyd-v1\\.venv\\Scripts\\python.exe' -u run_comparison.py --package 'E:\\Download\\AuthentiScan-FUSED-Evaluation-Loyd-v1'

Run once. The launcher verifies both packages and the exact previous results,
uses one worker with a 30-minute limit, and refuses an existing output folder.
Do not change settings, start duplicates, lower memory guards, retry automatically,
use GPU, modify AuthentiScan/Grad-CAM, or install additional dependencies.

Send evaluation-output/Return-to-Kent-FUSED-Direct.zip even if the run fails.
Progress: evaluation-output/results/RESULT.json; logs: evaluation-output/*.log.

Decision fixed before this run: inspect whether BOTH edit-group means reach Dice
0.50 and all three original controls avoid highlights, with mean original area
<=1%. Otherwise do not advance this unchanged checkpoint to larger validation.
These small-sample checks are necessary but not sufficient for release. Passing
only permits planning independent validation and publication-license review.
Do not tune a new threshold or select a checkpoint after seeing these results.
'''
    release=dict(purpose='fused-direct-source-comparison-v1',release_approved=False,
        baseline_archive_sha256='0945c5fb39747ace0e88a7b6e2c4ac0cad139c53fb70291573f229e5439086d7',
        input_only_change=True,files={name:hashlib.sha256(data).hexdigest() for name,data in entries.items()})
    output=ROOT/'handoff/AuthentiScan-FUSED-Direct-Source-Loyd-v1.zip'
    with zipfile.ZipFile(output,'x',zipfile.ZIP_DEFLATED) as z:
        for name,data in entries.items(): z.writestr(name,data)
        z.writestr('RELEASE.json',json.dumps(release,indent=2))
    with zipfile.ZipFile(output) as z:
        assert len(z.namelist())==len(entries)+1
        for name,expected in release['files'].items():
            assert hashlib.sha256(z.read(name)).hexdigest()==expected
        for name in entries:
            if name.endswith('.py'): compile(z.read(name),name,'exec')
    metadata=dict(file=str(output),bytes=output.stat().st_size,sha256=digest(output),verified=True,model_run=False)
    with output.with_suffix('.json').open('x') as f: json.dump(metadata,f,indent=2)
    print(json.dumps(metadata,indent=2))


if __name__=='__main__': main()
