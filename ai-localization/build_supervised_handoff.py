"""Create one checksummed training ZIP, deliberately excluding held-out assets."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parent
REVISION='7764ea0f912e53c92e82eb78a2a1631e92725fc8'


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--data',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();data=args.data.resolve();output=args.output.resolve()
    if output.exists():raise FileExistsError(output)
    with (data/'training-manifest.csv').open(newline='') as handle:rows=list(csv.DictReader(handle))
    if len(rows)!=600 or any(r['split'] not in {'train','validation'} for r in rows):raise ValueError('Expected exactly 600 train/validation images')
    names={r[field] for r in rows for field in ['image','mask']}
    hashes=json.loads((data/'asset-sha256.json').read_text())
    files={f'data/{name}':data/name for name in names}
    for name in ['training-manifest.csv','protocol.json','manifest.json']:files['data/'+name]=data/name
    for name in ['supervised_localizer.py','train_supervised_localization.py','run_loyd_localization.py','verify_localization_package.py']:files[name]=ROOT/name
    files['START-HERE.md']=ROOT/'SUPERVISED-START-HERE.md'
    files['dinov2_vits14_pretrain.pth']=ROOT/'weights/hub/checkpoints/dinov2_vits14_pretrain.pth'
    source=ROOT/f'weights/hub/facebookresearch_dinov2_{REVISION}'
    for path in source.rglob('*'):
        if path.is_file() and (path.suffix=='.py' or path.name in {'LICENSE','NOTICE'}) and '__pycache__' not in path.parts:
            files['encoder-source/'+path.relative_to(source).as_posix()]=path
    if 'encoder-source/LICENSE' not in files:raise FileNotFoundError('Encoder license is required')
    output.parent.mkdir(parents=True,exist_ok=True);release={};raw_bytes=0
    with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=3) as archive:
        for name,path in sorted(files.items()):
            if '/test/' in name or '..' in Path(name).parts:raise ValueError('Held-out or unsafe package path')
            content=path.read_bytes();digest=hashlib.sha256(content).hexdigest();raw_bytes+=len(content)
            if raw_bytes>2_000_000_000:raise ValueError('Handoff exceeds bounded package size')
            if name.startswith('data/assets/') and digest!=hashes[name[5:]]:raise ValueError('Dataset asset changed')
            archive.writestr(name,content);release[name]=digest
        extra=json.dumps({name:hashes[name] for name in sorted(names)},indent=2).encode()
        archive.writestr('data/asset-sha256.json',extra);release['data/asset-sha256.json']=hashlib.sha256(extra).hexdigest()
        manifest=dict(schema_version=1,experiment='supervised-localization-v1',training_images=480,validation_images=120,
          held_out_images_included=0,production_approved=False,files=release)
        archive.writestr('RELEASE.json',json.dumps(manifest,indent=2))
    with zipfile.ZipFile(output) as archive:
        if archive.testzip():raise ValueError('ZIP integrity failure')
    digest=hashlib.sha256()
    with output.open('rb') as handle:
        for block in iter(lambda:handle.read(1<<20),b''):digest.update(block)
    record=dict(zip=output.name,bytes=output.stat().st_size,sha256=digest.hexdigest(),files=len(release)+1,
      training_images=480,validation_images=120,test_images=0,zip_crc_verified=True)
    output.with_suffix('.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
    print(json.dumps(record,indent=2))


if __name__=='__main__':main()
