"""Download one pinned Apache-2.0 model; no image upload or remote execution."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parent
REPO='HuggingFaceTB/SmolVLM-500M-Instruct'
REVISION='a7da5b986cb59b408707209984f360a5f4ad7e47'
WEIGHT_SHA='d05b567eeaf534e83d375551f068ed57b5f52d37c657197f644af5ef9db091a2'
MODEL=ROOT/'weights'/'smolvlm-500m'

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1<<20),b''):h.update(block)
    return h.hexdigest()

def prepare():
    with urllib.request.urlopen(f'https://huggingface.co/api/models/{REPO}/revision/{REVISION}?blobs=true',timeout=30) as r:
        meta=json.load(r)
    if meta['sha']!=REVISION or meta.get('cardData',{}).get('license')!='apache-2.0':raise ValueError('Model provenance mismatch')
    files=[f for f in meta['siblings'] if '/' not in f['rfilename'] and f['rfilename']!='.gitattributes']
    if sum(f['size'] for f in files)>1_100_000_000:raise ValueError('Download exceeds 1.1 GB cap')
    MODEL.mkdir(parents=True,exist_ok=True)
    records=[]
    for entry in files:
        name=entry['rfilename'];path=MODEL/name
        if Path(name).name!=name or Path(name).suffix not in ('.md','.json','.txt','.safetensors'):raise ValueError('Unexpected model file')
        def valid():
            if not path.is_file() or path.stat().st_size!=entry['size']:return False
            if 'lfs' in entry:return sha(path)==entry['lfs']['sha256']
            return hashlib.sha1(b'blob '+str(entry['size']).encode()+b'\0'+path.read_bytes()).hexdigest()==entry['blobId']
        if not valid():
            partial=path.with_suffix(path.suffix+'.partial')
            start=partial.stat().st_size if partial.exists() else 0
            if start>entry['size']:raise ValueError('Invalid partial download')
            if start<entry['size']:
                req=urllib.request.Request(f'https://huggingface.co/{REPO}/resolve/{REVISION}/{name}',headers={'Range':f'bytes={start}-'} if start else {})
                with urllib.request.urlopen(req,timeout=60) as response:
                    if start and (response.status!=206 or not response.headers.get('Content-Range','').startswith(f'bytes {start}-')):raise ValueError('Server did not honor resume')
                    with partial.open('ab' if start else 'wb') as out:
                        total=start;last=total
                        while True:
                            block=response.read(1<<20)
                            if not block:break
                            total+=len(block)
                            if total>entry['size']:raise ValueError('Oversized download')
                            out.write(block)
                            if total-last>=50_000_000:print(f'{name}: {total}/{entry["size"]} bytes',flush=True);last=total
            partial.replace(path)
            if not valid():raise ValueError(f'Checksum failed: {name}')
        records.append(dict(file=name,bytes=entry['size'],sha256=sha(path)))
        print(f'Verified {name}',flush=True)
    if sha(MODEL/'model.safetensors')!=WEIGHT_SHA:raise ValueError('Weight mismatch')
    (MODEL/'manifest.json').write_text(json.dumps(dict(repository=REPO,revision=REVISION,license='Apache-2.0',files=records),indent=2),encoding='utf-8')
    print('Model ready for offline loading.',flush=True)

if __name__=='__main__':prepare()
