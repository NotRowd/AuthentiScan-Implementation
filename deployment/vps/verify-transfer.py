"""Verify the private package after upload, without loading models or credentials."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
records = json.loads((root / 'TRANSFER-MANIFEST.json').read_text())['files']
for entry in records:
    path = (root / entry['path']).resolve()
    if not path.is_relative_to(root) or path.is_symlink() or not path.is_file():
        raise SystemExit('Missing or unsafe path: ' + entry['path'])
    with path.open('rb') as stream:
        checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
    if path.stat().st_size != entry['bytes'] or checksum != entry['sha256']:
        raise SystemExit('Transfer verification failed: ' + entry['path'])
print(f'All {len(records)} deployment files verified. Model quality and Linux runtime checks are separate.')
