"""Kent's explicit CPU run: resumable feature cache, train, then gated fresh test.

Never enables production. Leaves the existing Loyd handoff ZIP untouched.
"""
import argparse
import ctypes
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
REVISION = '7764ea0f912e53c92e82eb78a2a1631e92725fc8'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    args = parser.parse_args()
    run = args.run.resolve()
    if not run.is_relative_to(ROOT / 'runs'):
        raise ValueError('Run directory must be inside ai-localization/runs')
    run.mkdir(parents=True, exist_ok=True)
    if (run / 'training-output').exists():
        raise FileExistsError('Existing training output: preserve it and review before resuming')
    if shutil.disk_usage(run).free < 2_000_000_000:
        raise RuntimeError('At least 2 GB free required for the feature cache and reports')
    started = time.monotonic()

    def status(stage, **extra):
        value = dict(stage=stage, pid=os.getpid(), device='cpu', production_enabled=False,
                     updated_utc=datetime.now(timezone.utc).isoformat(),
                     elapsed_seconds=time.monotonic() - started, **extra)
        temporary = run / 'status.partial'
        temporary.write_text(json.dumps(value, indent=2), encoding='utf-8')
        temporary.replace(run / 'status.json')
        print(json.dumps(value), flush=True)

    def stage(name, script, arguments):
        status(name)
        with (run / f'{name}.log').open('a', encoding='utf-8') as log:
            result = subprocess.run([sys.executable, '-u', str(ROOT / script), *map(str, arguments)],
                                    cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError(f'{name} failed with exit {result.returncode}; see {name}.log')

    data = ROOT / 'datasets/supervised-localization-v1'
    source = ROOT / f'weights/hub/facebookresearch_dinov2_{REVISION}'
    checkpoint = ROOT / 'weights/hub/checkpoints/dinov2_vits14_pretrain.pth'
    cache = run / 'feature-cache'
    output = run / 'training-output'
    awake = False
    try:
        if os.name == 'nt':
            # Request system-awake only while this process works; do not keep the display on.
            awake = bool(ctypes.windll.kernel32.SetThreadExecutionState(0x80000001))
        status('starting', sleep_prevention_requested=awake)
        stage('feature-cache', 'train_supervised_localization.py',
              ['cache', '--device', 'cpu', '--data', data, '--cache', cache,
               '--source', source, '--checkpoint', checkpoint])
        stage('training', 'train_supervised_localization.py',
              ['train', '--device', 'cpu', '--data', data, '--cache', cache, '--output', output])
        report = json.loads((output / 'validation-report.json').read_text())
        if report['status'] != 'validation_gate_passed_needs_fresh_test':
            status('validation_failed_not_deployed', training_complete=True, test_evaluated=False,
                   validation_status=report['status'])
            return
        stage('fresh-test', 'evaluate_supervised_return.py',
              ['--data', data, '--returned', output, '--source', source, '--checkpoint', checkpoint,
               '--device', 'cpu', '--output', run / 'fresh-test'])
        test = json.loads((run / 'fresh-test/test-report.json').read_text())
        status('evaluation_complete_needs_review', training_complete=True, test_evaluated=True,
               test_status=test['status'])
    except BaseException as error:
        status('failed', error=str(error))
        raise
    finally:
        if awake:
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)


if __name__ == '__main__':
    main()
