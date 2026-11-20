"""Build the small pinned two-arm pilot add-on; never launches a training job."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--rebuild', action='store_true', help='Replace only this builder\'s checksum-verified prior artifact')
    args = parser.parse_args()
    if args.output.exists() or args.output.with_suffix('.json').exists():
        if not args.rebuild or not args.output.is_file() or not args.output.with_suffix('.json').is_file():
            raise FileExistsError(args.output)
        previous = json.loads(args.output.with_suffix('.json').read_text())
        if previous.get('file') != str(args.output.resolve()) or previous.get('sha256') != hashlib.sha256(args.output.read_bytes()).hexdigest():
            raise ValueError('Existing artifact does not match builder metadata')
    source = ROOT / 'gpu-pilot'
    files = {n: (source / n).read_bytes() for n in ('pilot_support.py', 'run_pilot.py', 'START-HERE.md')}
    with zipfile.ZipFile(ROOT / 'handoff/AuthentiScan-SAFIRE-GPU-Training-Loyd-v1.zip') as archive:
        release = archive.read('RELEASE.json')
        digest = hashlib.sha256(release).hexdigest()
        if digest != '82deefed89bcb7bafc4003bff55336cf83331b3543d79825f7a077dd41774a7e':
            raise ValueError('Wrong base training package')
        files['THIRD-PARTY-NOTICES.md'] = archive.read('THIRD-PARTY-NOTICES.md')
    manifest = dict(purpose='safire-authentic-region-pilot-v1', base_release_sha256=digest,
        epochs_per_arm=2, steps_per_arm=960, arms=['A', 'B'], timeout_seconds=3600,
        region_weight=.5, training_images=480, validation_images=120, final_test_images=0,
        release_approved=False, new_downloads_required=False,
        files={n: hashlib.sha256(v).hexdigest() for n, v in files.items()})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.zip.partial')
    with zipfile.ZipFile(temporary, 'x', zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
        archive.writestr('PILOT.json', json.dumps(manifest, indent=2))
    with zipfile.ZipFile(temporary) as archive:
        if len(archive.namelist()) != 5 or set(archive.namelist()) != set(files) | {'PILOT.json'}:
            raise ValueError('Wrong package entries')
        for name, expected in manifest['files'].items():
            if hashlib.sha256(archive.read(name)).hexdigest() != expected:
                raise ValueError('ZIP verification failed')
    temporary.replace(args.output)
    metadata = dict(file=str(args.output.resolve()), bytes=args.output.stat().st_size,
        sha256=hashlib.sha256(args.output.read_bytes()).hexdigest(), verified=True,
        actual_gpu_pilot_executed=False)
    args.output.with_suffix('.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    main()
