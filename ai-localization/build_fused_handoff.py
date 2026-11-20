"""Build a streaming, self-contained nine-case FUSED evaluation ZIP for Loyd."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import zipfile
from evaluate_fused_candidate import ROOT, DATA, CANDIDATE, selected_rows, verify_assets, digest
from prepare_fused_candidate import COMMIT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() or args.output.with_suffix('.json').exists():
        raise FileExistsError('Preserve existing package; choose a new name')
    verify_assets('sofake')
    rows = selected_rows()
    disk_files = {}
    for name in ('START-HERE.md', 'THIRD-PARTY-NOTICES.md', 'requirements.txt', 'verify_package.py', 'run_evaluation.py'):
        disk_files[name] = ROOT / 'fused-handoff' / name
    for name in ('evaluate_fused_candidate.py', 'prepare_fused_candidate.py', 'fused_platform.py'):
        disk_files['ai-localization/' + name] = ROOT / name
    disk_files['process_lifecycle.py'] = ROOT.parent / 'ai-scene/process_lifecycle.py'
    for name in ('assets.json', f'FUSED-{COMMIT}.zip', 'fused_sofake.pth', 'model.safetensors'):
        disk_files['ai-localization/candidates/fused-v1/' + name] = CANDIDATE / name
    # Exact source archive entries only; never include local caches or environments.
    with zipfile.ZipFile(CANDIDATE / f'FUSED-{COMMIT}.zip') as source:
        for item in source.infolist():
            if not item.is_dir():
                relative = Path(*Path(item.filename).parts[1:])
                disk_files['ai-localization/candidates/fused-v1/source/' + relative.as_posix()] = CANDIDATE / 'source' / relative
    data_prefix = 'ai-localization/datasets/supervised-localization-v1/'
    hashes = {}
    for row in rows:
        for field in ('image', 'mask'):
            relative = row[field]
            disk_files[data_prefix + relative] = DATA / relative
            hashes[relative] = digest(DATA / relative)
    csv_text = io.StringIO(newline='')
    writer = csv.DictWriter(csv_text, fieldnames=list(rows[0]))
    writer.writeheader(); writer.writerows(rows)
    memory_files = {
        data_prefix + 'training-manifest.csv': csv_text.getvalue().encode('utf-8'),
        data_prefix + 'asset-sha256.json': json.dumps(hashes, indent=2).encode('utf-8'),
    }
    release = dict(purpose='fused-sofake-nine-image-cpu-evaluation-v1', source_commit=COMMIT,
        samples=[row['sample_id'] for row in rows], inference_only=True, device='cpu',
        precision='float32', threshold=.5, release_approved=False, timeout_seconds=1800,
        files={name: digest(path) for name, path in disk_files.items()})
    release['files'].update({name: hashlib.sha256(payload).hexdigest() for name, payload in memory_files.items()})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    partial = args.output.with_suffix('.zip.partial')
    print(f'Packaging {len(release["files"])} verified files; large weights streamed from disk.', flush=True)
    with zipfile.ZipFile(partial, 'x', zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as bundle:
        for name, path in disk_files.items():
            print('Adding ' + name, flush=True)
            bundle.write(path, name)
        for name, payload in memory_files.items():
            bundle.writestr(name, payload)
        bundle.writestr('RELEASE.json', json.dumps(release, indent=2))
    print('Verifying every compressed entry...', flush=True)
    with zipfile.ZipFile(partial) as bundle:
        if len(bundle.namelist()) != len(release['files']) + 1:
            raise ValueError('Unexpected archive entries')
        for name, expected in release['files'].items():
            with bundle.open(name) as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() != expected:
                    raise ValueError('ZIP integrity failure: ' + name)
        release_hash = hashlib.sha256(bundle.read('RELEASE.json')).hexdigest()
    partial.rename(args.output)
    metadata = dict(file=str(args.output.resolve()), bytes=args.output.stat().st_size,
        sha256=digest(args.output), release_sha256=release_hash, verified=True,
        files=len(release['files']), images=9, masks=9, inference_executed=False,
        trained=False, release_approved=False)
    with args.output.with_suffix('.json').open('x', encoding='utf-8') as handle:
        json.dump(metadata, handle, indent=2)
    print(json.dumps(metadata, indent=2), flush=True)


if __name__ == '__main__':
    main()
