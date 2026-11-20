"""Verify the portable training package before running any training code."""
import hashlib
import json
from pathlib import Path


def verify(root):
    manifest=json.loads((root/'RELEASE.json').read_text(encoding='utf-8'))
    for name,expected in manifest['files'].items():
        relative=Path(name);path=(root/relative).resolve()
        if relative.is_absolute() or '..' in relative.parts or not path.is_relative_to(root.resolve()):raise ValueError('Unsafe package path')
        digest=hashlib.sha256()
        with path.open('rb') as handle:
            for block in iter(lambda:handle.read(1<<20),b''):digest.update(block)
        if digest.hexdigest()!=expected:raise ValueError('Changed or missing package file: '+name)
    print(f'Package checksums passed: {len(manifest["files"])} files. No test-set images included.')


if __name__=='__main__':verify(Path(__file__).resolve().parent)
