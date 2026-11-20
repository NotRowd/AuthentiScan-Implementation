"""Small checksummed add-on; reuse the exact full training package, no new dataset."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError(args.output)
    source = ROOT / 'gpu-diagnostic'
    names = ('diagnostic_support.py', 'run_diagnostic.py', 'START-HERE.md')
    files = {name: (source / name).read_bytes() for name in names}
    base = ROOT / 'handoff/AuthentiScan-SAFIRE-GPU-Training-Loyd-v1.zip'
    with zipfile.ZipFile(base) as archive:
        release = archive.read('RELEASE.json')
        if hashlib.sha256(release).hexdigest() != '82deefed89bcb7bafc4003bff55336cf83331b3543d79825f7a077dd41774a7e':
            raise ValueError('Unexpected base package')
        files['THIRD-PARTY-NOTICES.md'] = archive.read('THIRD-PARTY-NOTICES.md')
    manifest = dict(purpose='safire-six-image-learning-diagnostic-v1',
        base_release_sha256=hashlib.sha256(release).hexdigest(), training_images_used=6,
        validation_images_evaluated=0, test_images_evaluated=0, max_steps=600, timeout_seconds=1800,
        new_model_or_data_download=False, release_approved=False,
        files={name: hashlib.sha256(payload).hexdigest() for name, payload in files.items()})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, 'x', zipfile.ZIP_DEFLATED) as archive:
        for name, payload in files.items():
            archive.writestr(name, payload)
        archive.writestr('DIAGNOSTIC.json', json.dumps(manifest, indent=2))
    with zipfile.ZipFile(args.output) as archive:
        if len(archive.namelist()) != len(files) + 1:
            raise ValueError('Wrong entry count')
        for name, digest in manifest['files'].items():
            if hashlib.sha256(archive.read(name)).hexdigest() != digest:
                raise ValueError('Archive checksum mismatch')
    metadata = dict(file=args.output.name, bytes=args.output.stat().st_size,
        sha256=hashlib.sha256(args.output.read_bytes()).hexdigest(), verified=True,
        actual_gpu_diagnostic_executed=False)
    args.output.with_suffix('.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    main()
