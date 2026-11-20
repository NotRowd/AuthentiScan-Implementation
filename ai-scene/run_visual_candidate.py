"""Bounded, authenticated, CPU-only development evaluation; never deploys."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time
import urllib.request
import zipfile

from prepare_visual_candidate import PLAN, DEST, digest
from evaluate_visual_candidate import (CANDIDATE, ROOT, PROMPT, REVIEW_SCHEMA, REQUEST_VERSION, NoRedirect,
    select_input, image_payload, request_review, parse_review)

SAMPLES = (None, 'train-724-authentic-control', 'train-724-segm_flux1dev', 'train-724-random_flux1dev')


def verify_assets():
    for record in PLAN['files']:
        file = DEST / record['name']
        if file.stat().st_size != record['bytes'] or digest(file) != record['sha256']:
            raise ValueError('Candidate model checksum mismatch')
    runtime = PLAN['runtime']
    archive = DEST / runtime['file']
    if digest(archive) != runtime['sha256']:
        raise ValueError('Runtime archive checksum mismatch')
    directory = DEST / ('runtime-' + runtime['release'])
    with zipfile.ZipFile(archive) as bundle:
        for record in bundle.infolist():
            if record.is_dir():
                continue
            file = (directory / record.filename).resolve()
            if not file.is_relative_to(directory.resolve()) or digest(file) != hashlib.sha256(bundle.read(record)).hexdigest():
                raise ValueError('Extracted runtime checksum mismatch')
    return directory / 'llama-server.exe'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New directory for local development reports')
    parser.add_argument('--cohort', choices=['development', 'whoops-screen'], default='development')
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Use a new output directory; old evidence is never overwritten')
    if args.cohort == 'development':
        inputs = [select_input(sample) for sample in SAMPLES]
    else:
        data_root = ROOT / 'datasets/whoops-screen-v1'
        manifest = json.loads((data_root / 'manifest.json').read_text(encoding='utf-8'))
        from prepare_whoops_screen import IDS
        if tuple(row['image_id'] for row in manifest['samples']) != IDS:
            raise ValueError('Unexpected screening cohort')
        inputs = []
        for row in manifest['samples']:
            path = (data_root / row['image']).resolve()
            if not path.is_relative_to(data_root.resolve()) or digest(path) != row['sha256']:
                raise ValueError('Screening image failed integrity check')
            inputs.append((path, row['sample_id'], row['image_id']))
    exe = verify_assets()
    with socket.socket() as check:
        check.bind(('127.0.0.1', 5007))
    args.output.mkdir(parents=True)
    key = secrets.token_urlsafe(32)
    env = {**os.environ, 'LLAMA_API_KEY': key}
    os.environ['AUTHENTISCAN_CANDIDATE_KEY'] = key
    command = [str(exe), '-m', str(DEST / PLAN['files'][0]['name']),
        '--mmproj', str(DEST / PLAN['files'][1]['name']), '--host', '127.0.0.1',
        '--port', '5007', '--alias', CANDIDATE, '--ctx-size', '4096', '--parallel', '1',
        '--threads', '2', '--threads-batch', '2', '--batch-size', '256', '--ubatch-size', '128',
        '--n-gpu-layers', '0', '--no-mmproj-offload', '--no-webui',
        '--cors-origins', 'https://authentiscan.invalid', '--no-cors-credentials', '--timeout', '360']
    reports = []
    with (args.output / 'runtime.log').open('x', encoding='utf-8') as log:
        process = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            deadline = time.monotonic() + 60
            while True:
                if process.poll() is not None:
                    raise RuntimeError('Candidate server exited; inspect local runtime.log')
                try:
                    req = urllib.request.Request('http://127.0.0.1:5007/health', headers={'Authorization': 'Bearer ' + key})
                    with opener.open(req, timeout=2) as response:
                        if response.status == 200:
                            break
                except OSError:
                    pass
                if time.monotonic() >= deadline:
                    raise TimeoutError('Candidate server did not become ready')
                time.sleep(.5)
            print('Authenticated candidate ready on CPU. No production services changed.', flush=True)
            for path, sample_id, source in inputs:
                original, png = image_payload(path)
                report = dict(candidate=CANDIDATE, request_version=REQUEST_VERSION, response_schema=REVIEW_SCHEMA, sample_id=sample_id, source_id=source,
                    input_sha256=hashlib.sha256(original).hexdigest(), prompt=PROMPT, split=args.cohort,
                    accuracy_validated=False, production_enabled=False, classifier_reason=False,
                    human_review_required=True, completed=False)
                started = time.monotonic()
                print('Evaluating ' + sample_id, flush=True)
                try:
                    raw = request_review(png)
                    report['raw_response'] = raw
                    report['parsed'] = parse_review(raw)
                    report['completed'] = True
                except Exception as error:
                    report['failure_type'] = type(error).__name__
                report['seconds'] = time.monotonic() - started
                with (args.output / (sample_id + '.json')).open('x', encoding='utf-8') as handle:
                    json.dump(report, handle, indent=2)
                reports.append({key: report[key] for key in ('sample_id', 'completed', 'seconds')})
                print(json.dumps(reports[-1]), flush=True)
                if report.get('failure_type') in ('TimeoutError', 'URLError'):
                    break  # Do not queue more CPU work behind a timed-out request.
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait(timeout=5)
            os.environ.pop('AUTHENTISCAN_CANDIDATE_KEY', None)
    with (args.output / 'summary.json').open('x', encoding='utf-8') as handle:
        json.dump(dict(candidate=CANDIDATE, samples=reports, accuracy_validated=False,
            deployment_approved=False, requires_human_review=True), handle, indent=2)


if __name__ == '__main__':
    main()
