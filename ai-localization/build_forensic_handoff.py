"""Build the bounded, documentation/source-only development handoff."""
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

base = Path(__file__).resolve().parent
templates = base / 'forensic-handoff'
name = 'AuthentiScan-Forensic-Localization-Handoff-Loyd-v2-2026-11-03'
output = base / 'handoff' / name
archive = output.with_suffix('.zip')
if output.exists() or archive.exists():
    raise SystemExit('Output exists; preserve it and choose a new version.')
sources = [
    'PILOT-RESULTS-2026-10-09.md',
    'REPLACEMENT-RECHECK-2026-10-27.md',
    'SAFIRE-GPU-RETURN-AUDIT-2026-10-22.md',
    'SAFIRE-PILOT-RETURN-AUDIT-2026-10-22.md',
    'FUSED-DIRECT-RESULTS-2026-10-26.md',
    'DETECTIVESAM-RESULTS-2026-10-27.md',
    'DETECTIVESAM-DIAGNOSTIC-RESULTS-2026-10-28.md',
    'DETECTIVESAM-BALANCED-RESULTS-2026-10-28.md',
    'DETECTIVESAM-DECODER-RESULTS-2026-10-28.md',
    'DETECTIVESAM-SUPERVISION-AND-DECODER-REVIEW-2026-10-28.md',
    'DETECTIVESAM-PAIRED-LEARNING-PLAN-2026-10-28.md',
    'CANDIDATE-SCREENING-2026-10-09.md',
    'GENERALIZATION-REVIEW-2026-10-22.md',
    'audit_detectivesam_decoder.py',
    'audit_detectivesam_diagnostic.py',
    'audit_detectivesam_balanced.py',
    'localizer_service.py',
    'localization.py',
    'experimental_service.py',
    'datasets/supervised-localization-v1/training-manifest.csv',
]
for relative in sources:
    if not (base / relative).is_file():
        raise SystemExit(f'Missing source: {relative}')
output.mkdir(parents=True)
for filename in ['START-HERE.md', 'DEVELOPMENT-PLAN.md', 'DELIVERY-CHECKLIST.md', 'PROMPT-FOR-LOYD.txt', 'verify_package.py']:
    shutil.copyfile(templates / filename, output / filename)
index = []
for relative in sources:
    source = base / relative
    target = output / 'reference' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    index.append({'original_path': str(source), 'package_path': target.relative_to(output).as_posix(),
                  'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
(output / 'SOURCE-INDEX.json').write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')
manifest = {p.relative_to(output).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(output.rglob('*')) if p.is_file()}
(output / 'SHA256.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
subprocess.run([sys.executable, str(output / 'verify_package.py')], check=True)
with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED) as bundle:
    for p in sorted(output.rglob('*')):
        if p.is_file():
            bundle.write(p, arcname=f'{name}/{p.relative_to(output).as_posix()}')
with zipfile.ZipFile(archive) as bundle:
    if bundle.testzip() is not None:
        raise SystemExit('ZIP CRC failed')
    expected_names = {f'{name}/{p}' for p in manifest} | {f'{name}/SHA256.json'}
    if set(bundle.namelist()) != expected_names:
        raise SystemExit('ZIP entries mismatch')
    for relative, digest in manifest.items():
        if hashlib.sha256(bundle.read(f'{name}/{relative}')).hexdigest() != digest:
            raise SystemExit(f'ZIP content mismatch: {relative}')
print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size,
                  'payloads': len(manifest), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}, indent=2))
