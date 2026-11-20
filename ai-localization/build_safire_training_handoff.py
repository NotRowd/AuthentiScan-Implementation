"""Build a source-disjoint 480/120 GPU training handoff; exclude final-test data."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'gpu-training'))
from verify_package import sha, safe_file, validate_rows

BASE_SHA = '24025512399d56a564f9c895c30534837555aa8d7352606a69172b9827a6311a'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError(args.output)
    base = ROOT / 'handoff/AuthentiScan-SAFIRE-GPU-Feasibility-Loyd-v1.zip'
    if sha(base) != BASE_SHA:
        raise ValueError('Feasibility base archive mismatch')
    data = ROOT / 'datasets/supervised-localization-v1'
    with (data / 'training-manifest.csv').open(newline='', encoding='utf-8') as stream:
        original_rows = list(csv.DictReader(stream))
    validate_rows(original_rows, {'train': 480, 'validation': 120})
    # Check IDs only; never open any sealed-test image/mask.
    with (data / 'sealed-test-manifest.csv').open(newline='', encoding='utf-8') as stream:
        sealed_sources = {r['source_id'] for r in csv.DictReader(stream)}
    if sealed_sources & {r['source_id'] for r in original_rows}:
        raise ValueError('Final-test source overlap')
    ledger = json.loads((data / 'asset-sha256.json').read_text())
    files, rows, image_owners = {}, [], {}
    from PIL import Image
    import numpy as np
    for original in original_rows:
        row = dict(original)
        for key in ('image', 'mask'):
            asset = safe_file(data, original[key])
            digest = sha(asset)
            if digest != ledger[original[key]]:
                raise ValueError('Prepared dataset hash changed')
            with Image.open(asset) as image:
                if image.size != (448, 448) or image.getexif().get(274, 1) != 1:
                    raise ValueError('Unexpected prepared geometry')
                if key == 'mask':
                    mask = np.asarray(image.convert('L'))
                    if not np.isin(mask, [0, 255]).all():
                        raise ValueError('Nonbinary mask')
                    if (original['condition'] == 'authentic_control') != (not mask.any()):
                        raise ValueError('Mask/condition mismatch')
            if key == 'image' and image_owners.setdefault(digest, row['split']) != row['split']:
                raise ValueError('Duplicate image across splits')
            name = f'data/{original["sample_id"]}-{key}.png'
            files[name] = asset
            row[key] = name
        rows.append(row)
    source = ROOT / 'gpu-training'
    for name in ('verify_package.py', 'training_support.py', 'train_gpu.py', 'TRAINING-PLAN.md', 'START-HERE.md'):
        files[name] = source / name
    extras = {'samples.json': json.dumps(rows, indent=2).encode('utf-8')}
    with zipfile.ZipFile(base) as archive:
        old_release = json.loads(archive.read('RELEASE.json'))
        for name, digest in old_release['files'].items():
            payload = archive.read(name)
            if hashlib.sha256(payload).hexdigest() != digest:
                raise ValueError('Base archive content mismatch')
            if name.startswith(('vendor/', 'licenses/')) or name in ('safire.pth', 'gpu_model.py', 'requirements.txt'):
                extras[name] = payload
        notices = archive.read('THIRD-PARTY-NOTICES.md').decode('utf-8')
    notices = notices.replace('Private academic feasibility handoff', 'Private academic GPU-training handoff')
    notices = notices.replace('## Three TGIF2 prepared training examples', '## TGIF2 prepared training and validation examples')
    notices = notices.replace('Dataset source ID tgif2-724 and original condition identifiers are retained in',
        'Dataset source IDs and original condition identifiers are retained in')
    notices = notices.replace('No validation/final-test images included.',
        '480 training images and 120 validation images included. No final-test data included.')
    extras['THIRD-PARTY-NOTICES.md'] = notices.encode('utf-8')
    release = dict(purpose='safire-adapter-gpu-training-v1',
        source_revision=old_release['source_revision'], checkpoint_sha256=old_release['checkpoint_sha256'],
        feasibility_zip_sha256=BASE_SHA, training_images=480, validation_images=120, test_images=0,
        original_training_manifest_sha256=sha(data / 'training-manifest.csv'),
        source_disjoint=True, release_approved=False, files={})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=3) as archive:
        for name, path in sorted(files.items()):
            if '/test/' in name or 'sealed-test' in name:
                raise ValueError('Forbidden final-test entry')
            release['files'][name] = sha(path)
            archive.write(path, name)
        for name, payload in sorted(extras.items()):
            release['files'][name] = hashlib.sha256(payload).hexdigest()
            archive.writestr(name, payload)
        archive.writestr('RELEASE.json', json.dumps(release, indent=2))
    with zipfile.ZipFile(args.output) as archive:
        if set(archive.namelist()) != set(release['files']) | {'RELEASE.json'}:
            raise ValueError('Unexpected archive members')
        for name, digest in release['files'].items():
            actual = hashlib.sha256()
            with archive.open(name) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    actual.update(block)
            if actual.hexdigest() != digest:
                raise ValueError('Decompressed hash mismatch: ' + name)
    metadata = dict(file=args.output.name, bytes=args.output.stat().st_size, sha256=sha(args.output),
        entries=len(release['files']) + 1, training_images=480, validation_images=120, test_images=0,
        decompressed_hashes_verified=True, full_gpu_training_executed=False)
    args.output.with_suffix('.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    main()
