"""Allowlisted, checksummed three-image feasibility handoff; no sealed-test data."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request
import zipfile
from evaluate_safire import ROOT,SOURCE,REVISION,PATCH_FILE,PATCH_HASH,WEIGHT_HASH,sha,tgif_development_records,checked_path


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if args.output.exists():raise FileExistsError(args.output)
    if subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip()!=REVISION:
        raise ValueError('Source revision changed')
    changes=subprocess.check_output(['git','-C',str(SOURCE),'diff','HEAD','--name-only'],text=True).splitlines()
    if changes!=[PATCH_FILE] or sha(SOURCE/PATCH_FILE)!=PATCH_HASH:raise ValueError('Unexpected source modifications')
    weight=ROOT/'weights/safire/safire.pth'
    if sha(weight)!=WEIGHT_HASH:raise ValueError('Checkpoint hash mismatch')
    root=ROOT/'gpu-feasibility'
    files={name:root/name for name in ('verify_package.py','gpu_model.py','run_gpu_check.py',
                                     'requirements.txt','START-HERE.md','THIRD-PARTY-NOTICES.md')}
    files['safire.pth']=weight
    files['vendor/SAFIRE/README.md']=SOURCE/'README.md'
    files['vendor/SAFIRE/networks/safire_model.py']=SOURCE/'networks/safire_model.py'
    for path in (SOURCE/'segment_anything').rglob('*.py'):
        files['vendor/SAFIRE/'+path.relative_to(SOURCE).as_posix()]=path
    data,records=tgif_development_records()
    samples=[]
    for record in records:
        item=dict(sample_id=record['id'],source_id='tgif2-724',split='train')
        for source_key,hash_key,target_key in [('image','input_sha256','image'),('truth','truth_sha256','mask')]:
            asset=checked_path(data,record[source_key],record[hash_key])
            name=f'data/{record["id"]}-{target_key}.png'
            files[name]=asset;item[target_key]=name
        samples.append(item)
    # Small, fixed official license resources only; no user data sent.
    url='https://raw.githubusercontent.com/facebookresearch/segment-anything/main/LICENSE'
    with urllib.request.urlopen(url,timeout=30) as response:license_text=response.read(100001)
    if len(license_text)>100000 or b'Apache License' not in license_text or b'Version 2.0' not in license_text:
        raise ValueError('Unexpected license response')
    extra={'licenses/SAM-APACHE-2.0.txt':license_text,
           'samples.json':json.dumps(samples,indent=2).encode('utf-8')}
    for name in files:
        if any(part in name.lower() for part in ('/test/','/validation/','.secrets','.git/','credentials')):
            raise ValueError('Out-of-scope package file')
    release=dict(purpose='safire-adapter-gpu-feasibility-v1',source_revision=REVISION,
        checkpoint_sha256=WEIGHT_HASH,training_images=3,validation_images=0,test_images=0,
        release_approved=False,files={})
    args.output.parent.mkdir(parents=True,exist_ok=True)
    raw_total=0
    with zipfile.ZipFile(args.output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=3) as bundle:
        for name,path in sorted(files.items()):
            raw_total+=path.stat().st_size
            if raw_total>500_000_000:raise ValueError('Package exceeds declared size budget')
            release['files'][name]=sha(path)
            bundle.write(path,name)
        for name,payload in extra.items():
            release['files'][name]=hashlib.sha256(payload).hexdigest()
            bundle.writestr(name,payload)
        bundle.writestr('RELEASE.json',json.dumps(release,indent=2))
    # Verify decompressed bytes, not merely the ZIP file's CRC metadata.
    with zipfile.ZipFile(args.output) as bundle:
        if set(bundle.namelist())!=set(release['files'])|{'RELEASE.json'}:raise ValueError('ZIP member mismatch')
        for name,digest in release['files'].items():
            actual=hashlib.sha256()
            with bundle.open(name) as stream:
                for block in iter(lambda:stream.read(1024*1024),b''):actual.update(block)
            if actual.hexdigest()!=digest:raise ValueError('Packaged hash mismatch')
    metadata=dict(file=args.output.name,bytes=args.output.stat().st_size,sha256=sha(args.output),
        entries=len(release['files'])+1,training_images=3,validation_images=0,test_images=0,
        decompressed_hashes_verified=True,gpu_execution_verified=False)
    args.output.with_suffix('.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    print(json.dumps(metadata,indent=2))


if __name__=='__main__':main()
