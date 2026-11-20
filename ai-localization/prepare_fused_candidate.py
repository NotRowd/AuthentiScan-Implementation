"""Download only the approved, revision-pinned FUSED evaluation assets.

Does not install packages, import upstream code, run inference, or change the app.
Partial downloads are preserved; completed assets require exact official hashes.
"""
import hashlib
import json
from pathlib import Path
import shutil
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent / 'candidates/fused-v1'
COMMIT = 'e8580ebad33decf0787a96133af4fafee640e024'
SOURCE_SHA256 = 'bf5dd67d101410db7406ac0d9237ea10ff5dcf387b2071282fa438e1a5012827'
ASSETS = [
    ('fused_opensdi.pth', 'aonuzhdin/FUSED', 'b7dfe0cb2d2f8fc8fd9e6ebea5f7185cfa8e1af7', 319859039,
     '7e527d49080a773641cf96915b4b3fa12d571c5b87f35c527f13ab82f148364c'),
    ('model.safetensors', 'timm/convnext_xxlarge.clip_laion2b_soup', 'f25f8c3fd36fa4dc604e47abbd204d815e50a0b9', 3386218152,
     '1ddf6dbc7f0753fc4dfec5db5fa474acfd1ac6f67f466d6a976780c30b3a1b23'),
]


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def download(url, path, expected_size=None, expected_hash=None):
    if path.exists():
        if expected_size is not None and (path.stat().st_size != expected_size or digest(path) != expected_hash):
            raise ValueError('Existing asset does not match; preserved for inspection: ' + path.name)
        return
    partial = path.with_suffix(path.suffix + '.partial')
    if partial.exists():
        raise ValueError('Partial download exists; inspect before retrying: ' + str(partial))
    request = urllib.request.Request(url, headers={'User-Agent': 'AuthentiScan-local-evaluation/1'})
    total = 0
    last = time.monotonic()
    with urllib.request.urlopen(request, timeout=90) as response, partial.open('xb') as output:
        while block := response.read(4 * 1024 * 1024):
            total += len(block)
            if total > (expected_size if expected_size is not None else 20 * 1024**2):
                raise ValueError('Download exceeds expected size')
            output.write(block)
            if time.monotonic() - last >= 15:
                print(f'{path.name}: {total / 1024**2:.0f} MiB received', flush=True)
                last = time.monotonic()
    if expected_size is not None and (total != expected_size or digest(partial) != expected_hash):
        raise ValueError('Downloaded asset integrity failed; partial preserved')
    partial.rename(path)
    print(f'Verified/downloaded {path.name}', flush=True)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(ROOT).free < 8 * 1024**3:
        raise RuntimeError('At least 8 GiB free disk space required')
    archive = ROOT / f'FUSED-{COMMIT}.zip'
    download(f'https://codeload.github.com/AntonNuzhdin/FUSED/zip/{COMMIT}', archive, 1276373, SOURCE_SHA256)
    files = []
    with zipfile.ZipFile(archive) as bundle:
        for entry in bundle.infolist():
            if entry.is_dir():
                continue
            relative = Path(entry.filename)
            if relative.parts[0] != 'FUSED-' + COMMIT or '..' in relative.parts or relative.is_absolute():
                raise ValueError('Unsafe source archive path')
            relative = Path(*relative.parts[1:])
            target = ROOT / 'source' / relative
            if not target.resolve().is_relative_to((ROOT / 'source').resolve()):
                raise ValueError('Source path escapes candidate')
            data = bundle.read(entry)
            sha = hashlib.sha256(data).hexdigest()
            if target.exists():
                if digest(target) != sha:
                    raise ValueError('Source differs from archive; refusing overwrite')
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as output:
                    output.write(data)
            files.append(dict(path=str(relative), sha256=sha))
    # No automatic source execution. Review before using the model constructor.
    for name, repo, revision, size, sha in ASSETS:
        download(f'https://huggingface.co/{repo}/resolve/{revision}/{name}?download=true', ROOT / name, size, sha)
    manifest = dict(source_commit=COMMIT, archive_sha256=digest(archive), source_files=files,
        assets=[dict(name=n, repository=r, revision=v, bytes=b, sha256=h) for n,r,v,b,h in ASSETS],
        approved_for='isolated evaluation only', deployment_approved=False,
        license_note='HF checkpoint metadata: MIT; backbone metadata: Apache-2.0. GitHub source license not declared; publication permission unresolved.')
    manifest_path = ROOT / 'assets.json'
    if not manifest_path.exists():
        with manifest_path.open('x', encoding='utf-8') as handle:
            json.dump(manifest, handle, indent=2)
    print('Assets verified. No inference, training, installation or deployment performed.', flush=True)


if __name__ == '__main__':
    main()
