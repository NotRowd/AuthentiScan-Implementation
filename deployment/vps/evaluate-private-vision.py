"""Run inside a network-isolated evaluation container; no production writes."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.request
import evaluate_visual_candidate as evaluation
from anomaly_review import request_anomaly_review,parse_anomaly_review

root=Path('/eval')
plan=json.loads((root/os.environ.get('MODEL_PLAN','gemma-evaluation.json')).read_text())
for item in plan['files']:
    path=root/item['name']
    digest=hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
    if path.stat().st_size!=item['bytes'] or digest!=item['sha256']:
        raise SystemExit('Model integrity check failed.')
key=secrets.token_urlsafe(32)
os.environ['AUTHENTISCAN_CANDIDATE_KEY']=key
evaluation.CANDIDATE='private-vision-candidate'
evaluation.ENDPOINT='http://127.0.0.1:5107/v1/chat/completions'
command=['/usr/local/bin/llama-server','-m',str(root/plan['files'][0]['name']),
    '--mmproj',str(root/plan['files'][1]['name']),'--host','127.0.0.1','--port','5107',
    '--alias',evaluation.CANDIDATE,'--ctx-size','4096','--parallel','1','--threads','2',
    '--threads-batch','2','--batch-size','512','--ubatch-size','512','--n-gpu-layers','0',
    '--no-mmproj-offload','--no-webui','--jinja','--timeout','300']
runtime_log=Path('/tmp/private-candidate-runtime.log').open('w')
process=subprocess.Popen(command,env={**os.environ,'LLAMA_API_KEY':key},stdout=runtime_log,stderr=subprocess.STDOUT)
try:
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline=time.monotonic()+90
    while True:
        if process.poll() is not None:
            raise RuntimeError('Candidate runtime exited during startup.')
        try:
            with opener.open(urllib.request.Request('http://127.0.0.1:5107/health',headers={'Authorization':'Bearer '+key}),timeout=2) as response:
                if response.status==200:break
        except OSError:pass
        if time.monotonic()>deadline:raise TimeoutError('Candidate startup exceeded 90 seconds.')
        time.sleep(.5)
    print('Private candidate loaded: '+plan['repository']+' @ '+plan['revision'],flush=True)
    case_limit=int(os.environ.get('EVAL_LIMIT','3'))
    if case_limit not in (1,2,3):raise ValueError('Invalid evaluation limit')
    for name in ['road.jpg','fence-original.png','logo.png'][:case_limit]:
        path=root/name
        original,png=evaluation.image_payload(path)
        started=time.monotonic()
        print(json.dumps({'started':name,'input_sha256':hashlib.sha256(original).hexdigest()}),flush=True)
        try:
            raw=request_anomaly_review(png)
        except Exception:
            time.sleep(.5)
            print('Candidate process exit code: '+str(process.poll()),flush=True)
            runtime_log.flush()
            print('\n'.join(Path('/tmp/private-candidate-runtime.log').read_text().splitlines()[-30:]),flush=True)
            print(Path('/sys/fs/cgroup/memory.events').read_text(),flush=True)
            raise
        parsed=parse_anomaly_review(raw)
        print(json.dumps({'sample':name,'seconds':round(time.monotonic()-started,2),'raw_response':raw,'parsed':parsed,'accuracy_validated':False}),flush=True)
    peak=Path('/sys/fs/cgroup/memory.peak')
    if peak.exists():print('Cgroup peak memory bytes: '+peak.read_text().strip(),flush=True)
finally:
    if process.poll() is None:
        process.terminate()
        try:process.wait(timeout=10)
        except subprocess.TimeoutExpired:process.kill();process.wait()
    runtime_log.close()
