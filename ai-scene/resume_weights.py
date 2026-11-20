"""Bounded parallel HTTP ranges for the single pinned weight file; no image uploads."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
import threading
import time
import urllib.request
from prepare_model import MODEL, REPO, REVISION, WEIGHT_SHA, sha

SIZE=1_015_025_832
CHUNK=4*1024*1024
URL=f'https://huggingface.co/{REPO}/resolve/{REVISION}/model.safetensors?download=true'

def main():
    partial=MODEL/'model.safetensors.partial'
    target=MODEL/'model.safetensors.ranged'
    journal=MODEL/'ranges.json'
    if (MODEL/'model.safetensors').exists() and sha(MODEL/'model.safetensors')==WEIGHT_SHA:
        print('Weights already verified.');return
    if not journal.exists():
        if target.exists():raise ValueError('Untracked range file; inspect before resuming')
        start=partial.stat().st_size if partial.exists() else 0
        if not 0<=start<=SIZE:raise ValueError('Invalid partial length')
        if partial.exists():partial.rename(target)
        else:target.touch()
        state={'revision':REVISION,'prefix':start,'completed':[]}
        journal.write_text(json.dumps(state))
    else:state=json.loads(journal.read_text())
    if state['revision']!=REVISION:raise ValueError('Wrong download revision')
    with target.open('r+b') as f:f.truncate(SIZE)
    lock=threading.Lock()
    tasks=[(start,min(start+CHUNK,SIZE)-1) for start in range(state['prefix'],SIZE,CHUNK) if start not in state['completed']]
    workers=max(1,min(12,int(os.environ.get('SCENE_DOWNLOAD_WORKERS','6'))))
    print(f'Resuming {len(tasks)} bounded ranges with {workers} connections.',flush=True)
    def transfer(span):
        start,end=span
        for attempt in range(4):
            try:
                data=bytearray()
                for offset in range(start,end+1,512*1024):
                    last=min(end,offset+512*1024-1)
                    request=urllib.request.Request(URL,headers={'Range':f'bytes={offset}-{last}'})
                    with urllib.request.urlopen(request,timeout=30) as response:
                        if response.status!=206 or response.headers.get('Content-Range')!=f'bytes {offset}-{last}/{SIZE}':raise ValueError('Invalid server byte range')
                        block=response.read(last-offset+2)
                        if len(block)!=last-offset+1:raise ValueError('Incomplete byte range')
                        data.extend(block)
                with lock:
                    with target.open('r+b') as f:f.seek(start);f.write(data);f.flush();os.fsync(f.fileno())
                    state['completed'].append(start)
                    temp=journal.with_suffix('.tmp');temp.write_text(json.dumps(state));temp.replace(journal)
                    done=min(SIZE,state['prefix']+len(state['completed'])*CHUNK)
                    print(f'Completed {done:,}/{SIZE:,} bytes ({done/SIZE:.0%})',flush=True)
                return
            except Exception as e:
                if attempt==3:raise
                print(f'Retrying range {start}: {type(e).__name__}',flush=True);time.sleep(1)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for result in as_completed([pool.submit(transfer,span) for span in tasks]):result.result()
    if sha(target)!=WEIGHT_SHA:raise ValueError('Weight checksum failed; do not load')
    target.replace(MODEL/'model.safetensors')
    print('Complete: pinned SHA256 verified. Run prepare_model.py to finish tokenizer files.',flush=True)

if __name__=='__main__':main()
