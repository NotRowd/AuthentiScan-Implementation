"""Prepare a private, secret-free VPS transfer directory; never deploy or purchase."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'firebase-local'
TEMPLATES = ROOT / 'deployment/vps'


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def copy(source, target):
    if source.is_symlink() or not source.is_file():
        raise ValueError(f'Missing or linked source: {source.name}')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    if sha(source) != sha(target):
        raise ValueError('Copy verification failed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--localizer', type=Path, required=True)
    args = parser.parse_args()
    kit = args.localizer.resolve()
    manifest = json.loads((kit / 'SHA256.json').read_text())
    for name, checksum in manifest.items():
        path = (kit / name).resolve()
        if not path.is_relative_to(kit) or sha(path) != checksum:
            raise ValueError(f'Localizer kit verification failed: {name}')
    weight = kit / 'weights/mesorch_p-118.pth'
    if sha(weight) != 'efa61592f2c783698a8760c2d3e48dc58c1b4890c50dbcdc166b24425a197674':
        raise ValueError('Localizer checkpoint verification failed')
    # Reuse the existing allowlisted API/classifier context and AI-lock checks.
    subprocess.run([sys.executable, str(ROOT / 'deployment/prepare-contexts.py')], check=True)
    prepared = max((p for p in (ROOT / 'deployment/prepared').iterdir() if not p.name.startswith('vps-')), key=lambda p: p.name)
    output = ROOT / 'deployment/prepared' / ('vps-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    output.mkdir()
    for label in ('api', 'classifier'):
        shutil.copytree(prepared / label, output / label)
    for name in ('compose.yaml', '.env.example', 'runtime.env.example', 'README.md', 'check-services.mjs', 'verify-transfer.py'):
        copy(TEMPLATES / name, output / name)
    web = output / 'web'
    for name in ('package.json', 'package-lock.json', 'index.html', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js'):
        copy(WEB / name, web / name)
    for folder in ('src', 'shared', 'public'):
        if (WEB / folder).exists():
            for path in (WEB / folder).rglob('*'):
                if path.is_file():
                    copy(path, web / path.relative_to(WEB))
    copy(TEMPLATES / 'web.Dockerfile', web / 'Dockerfile')
    copy(TEMPLATES / 'Caddyfile', web / 'Caddyfile')
    local = output / 'localizer'
    for name in manifest:
        if name.startswith('vendor/') or name in ('engine.py', 'service.py', 'get_weights.py', 'weight_compat.py', 'evidence/EXTRA-KEYS-AUDIT.json', 'CHECKPOINT-TERMS.md', 'PROVENANCE.md', 'CPU-RESULTS.md'):
            copy(kit / name, local / name)
    copy(weight, local / 'weights/mesorch_p-118.pth')
    (local / 'windows_memory.py').write_text('"""Linux peak resident memory; model computation unchanged."""\nimport resource\ndef peak_working_set_bytes():\n    return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024)\n')
    copy(TEMPLATES / 'localizer.Dockerfile', local / 'Dockerfile')
    visual = output / 'visual'
    for name in ('qwen_service.py', 'run_visual_candidate.py', 'prepare_visual_candidate.py', 'evaluate_visual_candidate.py', 'scene_service.py', 'prepare_model.py', 'process_lifecycle.py', 'visual_errors.py', 'visual-candidate.json'):
        copy(ROOT / 'ai-scene' / name, visual / name)
    plan = json.loads((visual / 'visual-candidate.json').read_text())
    for record in plan['files']:
        relative = Path('weights') / plan['candidate_id'] / record['name']
        source = ROOT / 'ai-scene' / relative
        if source.stat().st_size != record['bytes'] or sha(source) != record['sha256']:
            raise ValueError('Visual checkpoint verification failed')
        copy(source, visual / relative)
    copy(TEMPLATES / 'visual_linux.py', visual / 'visual_linux.py')
    copy(TEMPLATES / 'visual.Dockerfile', visual / 'Dockerfile')
    secret = re.compile(rb'-----BEGIN (?:RSA )?PRIVATE KEY-----|(?:sk_(?:test|live)_|whsk_)[A-Za-z0-9]{12,}')
    entries = []
    for path in sorted(output.rglob('*')):
        if not path.is_file():
            continue
        if path.suffix in ('.js', '.jsx', '.mjs', '.py', '.json', '.env', '.html') and secret.search(path.read_bytes()):
            raise ValueError('Potential embedded secret; do not transfer prepared folder')
        entries.append({'path': path.relative_to(output).as_posix(), 'bytes': path.stat().st_size, 'sha256': sha(path)})
    (output / 'TRANSFER-MANIFEST.json').write_text(json.dumps({'deployed': False, 'linux_runtime_tested': False, 'files': entries}, indent=2))
    print(f'Private VPS package prepared: {output}')
    print(f'{len(entries)} files; {sum(e["bytes"] for e in entries)/1024**3:.2f} GiB. Credentials excluded. Linux build/test pending.')


if __name__ == '__main__':
    main()
