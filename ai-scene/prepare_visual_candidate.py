"""Fetch pinned public candidate assets; never change the running AI services."""
import hashlib
import json
from pathlib import Path
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
PLAN = json.loads((ROOT / 'visual-candidate.json').read_text(encoding='utf-8'))
DEST = ROOT / 'weights' / PLAN['candidate_id']


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def fetch(url, record):
    target = DEST / record['name']
    if target.exists():
        if target.stat().st_size != record['bytes'] or digest(target) != record['sha256']:
            raise ValueError('Existing asset failed verification; preserved for inspection')
        print('Verified existing: ' + target.name, flush=True)
        return target
    partial = target.with_suffix(target.suffix + '.part')
    start = partial.stat().st_size if partial.exists() else 0
    if start > record['bytes']:
        raise ValueError('Oversized partial file; preserved for inspection')
    if start < record['bytes']:
        headers = {'User-Agent': 'AuthentiScan-local-evaluation/1', 'Accept-Encoding': 'identity'}
        if start:
            headers['Range'] = f'bytes={start}-'
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=60) as response:
            if start:
                expected = f"bytes {start}-{record['bytes']-1}/{record['bytes']}"
                if response.status != 206 or response.headers.get('Content-Range') != expected:
                    raise ValueError('Resume response does not match the pinned asset')
            elif response.status != 200:
                raise ValueError('Unexpected download response')
            if int(response.headers.get('Content-Length', '-1')) != record['bytes'] - start:
                raise ValueError('Download size differs from publisher metadata')
            size = start
            last = time.monotonic()
            with partial.open('ab' if start else 'xb') as handle:
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > record['bytes']:
                        raise ValueError('Download exceeded pinned size')
                    handle.write(chunk)
                    if time.monotonic() - last > 5:
                        print(f'{target.name}: {size}/{record["bytes"]} bytes ({100*size/record["bytes"]:.1f}%)', flush=True)
                        last = time.monotonic()
        if size != record['bytes']:
            raise ValueError('Incomplete download; rerun to resume')
    if digest(partial) != record['sha256']:
        raise ValueError('Downloaded asset checksum mismatch; partial preserved')
    partial.rename(target)
    print('Downloaded and SHA-256 verified: ' + target.name, flush=True)
    return target


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for item in PLAN['files']:
        url = f'https://huggingface.co/{PLAN["repository"]}/resolve/{PLAN["revision"]}/{item["name"]}'
        fetch(url, item)
    runtime = PLAN['runtime']
    archive = fetch(f'https://github.com/{runtime["repository"]}/releases/download/{runtime["release"]}/{runtime["file"]}',
        dict(name=runtime['file'], bytes=runtime['bytes'], sha256=runtime['sha256']))
    destination = DEST / ('runtime-' + runtime['release'])
    if destination.exists():
        raise ValueError('Runtime directory already exists; do not overwrite it')
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        if sum(entry.file_size for entry in entries) > 200 * 1024 * 1024:
            raise ValueError('Unexpected runtime extraction size')
        for entry in entries:
            if not (destination / entry.filename).resolve().is_relative_to(destination.resolve()):
                raise ValueError('Unsafe archive entry')
            if (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Archive symlinks are forbidden')
        bundle.extractall(destination)
    result = dict(candidate_id=PLAN['candidate_id'], assets_verified=True,
        runtime_directory=str(destination), production_enabled=False)
    with (DEST / 'prepared.json').open('x', encoding='utf-8') as handle:
        json.dump(result, handle, indent=2)
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
