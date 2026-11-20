"""Download pinned public candidate weights; never uploads image data."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import urllib.request

folder=Path(__file__).resolve().parent
plan=json.loads((folder/os.environ.get('MODEL_PLAN','gemma-evaluation.json')).read_text())
if shutil.disk_usage(folder).free < sum(item['bytes'] for item in plan['files']) + 1024**3:
    raise SystemExit('Insufficient disk headroom; download not started.')
for item in plan['files']:
    target=folder/item['name']
    if target.exists():
        raise SystemExit('Candidate file already exists; preserve it for inspection.')
    url=f"https://huggingface.co/{plan['repository']}/resolve/{plan['revision']}/{item['name']}"
    print('Downloading '+item['name'],flush=True)
    size=0;digest=hashlib.sha256()
    with urllib.request.urlopen(url,timeout=60) as response, target.with_suffix('.part').open('xb') as output:
        while block:=response.read(1024*1024):
            size+=len(block)
            if size>item['bytes']:
                raise ValueError('Unexpected download size')
            digest.update(block);output.write(block)
    if size!=item['bytes'] or digest.hexdigest()!=item['sha256']:
        raise ValueError('Candidate checksum mismatch; partial preserved.')
    target.with_suffix('.part').rename(target)
    print('Verified '+item['name'],flush=True)

