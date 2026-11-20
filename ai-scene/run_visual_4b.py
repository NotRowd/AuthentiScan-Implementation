"""Isolated 4B single-pass comparison using existing images, prompt and runtime.

No downloads, app changes, training or automatic promotion. Refuses low memory
or an occupied port. Stops only its owned process, including on timeout/failure.
"""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import threading
import time
import urllib.request

import evaluate_visual_candidate as evaluation
from compare_visual_prompts import free_memory_bytes
from prepare_visual_candidate import digest
from process_lifecycle import protect_process_tree
from run_evidence_review import prepare_cases
from run_visual_candidate import verify_assets

ROOT = Path(__file__).resolve().parent
MINIMUM_RAM = 6 * 1024**3


def require_memory():
    available = free_memory_bytes()
    if available < MINIMUM_RAM:
        raise RuntimeError(f'At least 6 GiB free RAM required; available {available / 1024**3:.2f} GiB. No model started.')
    return available


def verify_candidate(plan):
    directory = ROOT / 'weights' / plan['candidate_id']
    for record in plan['files']:
        path = directory / record['name']
        if path.stat().st_size != record['bytes'] or digest(path) != record['sha256']:
            raise ValueError('Candidate checksum mismatch: ' + record['name'])
    return directory


def memory_sample(pid):
    """Windows process working set and OS lifetime peak; not total system usage."""
    class Counters(ctypes.Structure):
        _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD)] + [
            (name, ctypes.c_size_t) for name in ('PeakWorkingSetSize', 'WorkingSetSize',
                'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage',
                'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage')]
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    psapi = ctypes.WinDLL('psapi', use_last_error=True)
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
    handle = kernel.OpenProcess(0x0400 | 0x0010, False, pid)
    if not handle:
        return {'available': False}
    try:
        counters = Counters()
        counters.cb = ctypes.sizeof(counters)
        if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
            return {'available': False}
        return {'available': True, 'working_set_bytes': counters.WorkingSetSize,
                'lifetime_peak_working_set_bytes': counters.PeakWorkingSetSize}
    finally:
        kernel.CloseHandle(handle)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--classroom', type=Path, default=Path('C:/Users/kenta/OneDrive/Pictures/Saved Pictures/bleebahblee.jpg'))
    parser.add_argument('--road', type=Path, default=Path('C:/Users/kenta/OneDrive/Pictures/Saved Pictures/asdasdas.jpg'))
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Output already exists; preserve previous results')
    require_memory()
    plan = json.loads((ROOT / 'visual-4b-assessment.json').read_text(encoding='utf-8'))
    directory = verify_candidate(plan)
    exe = verify_assets()
    cases = prepare_cases(args.classroom, args.road)
    previous = ROOT / 'runs/evidence-review-2026-11-04'
    # Compare exactly the same bytes against the previously recorded 2B baseline.
    baseline_hashes = {}
    for _, case in cases:
        path = previous / (case['sample'] + '.json')
        baseline = json.loads(path.read_text(encoding='utf-8'))
        if baseline['input_sha256'] != case['input_sha256']:
            raise ValueError('Baseline input changed: ' + case['sample'])
        baseline_hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    available = require_memory()
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 5007))
    args.output.mkdir(parents=True)
    frozen = dict(candidate=plan, baseline_report_hashes=baseline_hashes,
        prompt=evaluation.PROMPT, prompt_version=evaluation.REQUEST_VERSION,
        schema=evaluation.REVIEW_SCHEMA, temperature=0, max_tokens=700,
        context_size=4096, maximum_image_edge=768, free_ram_bytes=available,
        cases=[case for _, case in cases], maximum_requests=6, worker_timeout_seconds=1800,
        human_review_required=True, production_changed=False, deployment_approved=False,
        acceptance='Preserve useful road/arm scene observation; avoid unsupported text, objects, anatomy, and blur/occlusion-only concerns. All abstention fails usefulness. Reused six-case screen only; broader independent evaluation required.')
    (args.output / 'plan.json').write_text(json.dumps(frozen, indent=2), encoding='utf-8')
    # Only this isolated interpreter changes its request alias; no module/file used
    # by the running app is edited. Reuse the exact existing request transport.
    previous_alias = evaluation.CANDIDATE
    evaluation.CANDIDATE = plan['candidate_id']
    previous_key = os.environ.get('AUTHENTISCAN_CANDIDATE_KEY')
    key = secrets.token_urlsafe(32)
    os.environ['AUTHENTISCAN_CANDIDATE_KEY'] = key
    command = [str(exe), '-m', str(directory / plan['files'][0]['name']),
        '--mmproj', str(directory / plan['files'][1]['name']), '--host', '127.0.0.1',
        '--port', '5007', '--alias', plan['candidate_id'], '--ctx-size', '4096',
        '--parallel', '1', '--threads', '2', '--threads-batch', '2', '--batch-size', '256',
        '--ubatch-size', '128', '--n-gpu-layers', '0', '--no-mmproj-offload', '--no-webui',
        '--cors-origins', 'https://authentiscan.invalid', '--no-cors-credentials', '--timeout', '300']
    process = None
    timer = None
    rows = []
    started = time.monotonic()
    summary = dict(candidate=plan['candidate_id'], completed=False, production_changed=False,
                   accuracy_validated=False, deployment_approved=False)
    try:
        protect_process_tree()
        with (args.output / 'runtime.log').open('x', encoding='utf-8') as log:
            process = subprocess.Popen(command, env={**os.environ, 'LLAMA_API_KEY': key},
                stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            def timeout():
                if process.poll() is None:
                    process.terminate()
            timer = threading.Timer(1800, timeout)
            timer.daemon = True
            timer.start()
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), evaluation.NoRedirect())
            deadline = time.monotonic() + 120
            while True:
                if process.poll() is not None:
                    raise RuntimeError('Runtime exited during loading; see runtime.log')
                try:
                    req = urllib.request.Request('http://127.0.0.1:5007/health', headers={'Authorization': 'Bearer ' + key})
                    with opener.open(req, timeout=2) as response:
                        if response.status == 200:
                            break
                except OSError:
                    pass
                if time.monotonic() > deadline:
                    raise TimeoutError('Model load exceeded 120 seconds')
                time.sleep(.5)
            summary['load_seconds'] = round(time.monotonic() - started, 2)
            print('4B model ready on CPU; starting six-image comparison.', flush=True)
            for png, case in cases:
                report = dict(**case, completed=False)
                case_start = time.monotonic()
                print('Reviewing ' + case['sample'], flush=True)
                try:
                    raw = evaluation.request_review(png)
                    report['raw_response'] = raw
                    report['parsed'] = evaluation.parse_review(raw)
                    report['completed'] = True
                except Exception as error:
                    report['failure_type'] = type(error).__name__
                    raise
                finally:
                    report['seconds'] = round(time.monotonic() - case_start, 2)
                    report['memory'] = memory_sample(process.pid)
                    report['free_ram_bytes'] = free_memory_bytes()
                    (args.output / (case['sample'] + '.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')
                    rows.append({k: report[k] for k in ('sample', 'completed', 'seconds', 'memory', 'free_ram_bytes')})
                    print(json.dumps(rows[-1]), flush=True)
            summary['completed'] = True
    except Exception as error:
        summary['failure_type'] = type(error).__name__
        raise
    finally:
        if timer:
            timer.cancel()
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        evaluation.CANDIDATE = previous_alias
        if previous_key is None:
            os.environ.pop('AUTHENTISCAN_CANDIDATE_KEY', None)
        else:
            os.environ['AUTHENTISCAN_CANDIDATE_KEY'] = previous_key
        summary.update(results=rows, total_seconds=round(time.monotonic() - started, 2),
            free_ram_after_bytes=free_memory_bytes(), owned_runtime_stopped=process is None or process.poll() is not None)
        (args.output / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
