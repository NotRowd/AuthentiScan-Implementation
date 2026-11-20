"""Private, network-isolated two-pass evaluation; never writes scan records."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.request
import evaluate_visual_candidate as evaluation
from qwen_service import prepare_image
from verified_review_candidate import two_pass_review

key=secrets.token_urlsafe(32)
os.environ['AUTHENTISCAN_CANDIDATE_KEY']=key
evaluation.ENDPOINT='http://127.0.0.1:5107/v1/chat/completions'
plan=json.loads(Path('/app/visual-candidate.json').read_text())
weights=Path('/app/weights')/plan['candidate_id']
command=['/usr/local/bin/llama-server','-m',str(weights/plan['files'][0]['name']),
 '--mmproj',str(weights/plan['files'][1]['name']),'--host','127.0.0.1','--port','5107',
 '--alias',evaluation.CANDIDATE,'--ctx-size','4096','--parallel','1',
 '--threads','2','--threads-batch','2','--batch-size','256','--ubatch-size','128',
 '--n-gpu-layers','0','--no-mmproj-offload','--no-webui','--timeout','240']
process=subprocess.Popen(command,env={**os.environ,'LLAMA_API_KEY':key},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 deadline=time.monotonic()+90
 while True:
  if process.poll() is not None:raise RuntimeError('Isolated runtime exited')
  try:
   request=urllib.request.Request('http://127.0.0.1:5107/health',headers={'Authorization':'Bearer '+key})
   with opener.open(request,timeout=2) as response:
    if response.status==200:break
  except OSError:pass
  if time.monotonic()>deadline:raise TimeoutError('Runtime startup exceeded bound')
  time.sleep(.5)
 for name in ['authentic.png','goated.png']:
  started=time.monotonic();print(json.dumps({'started':name}),flush=True)
  try:
   result=two_pass_review(prepare_image((Path('/eval')/name).read_bytes()))
   print(json.dumps({'sample':name,'seconds':round(time.monotonic()-started,1),'result':result,'accuracy_validated':False}),flush=True)
  except Exception as error:
   print(json.dumps({'sample':name,'failure':type(error).__name__,'seconds':round(time.monotonic()-started,1),'message':str(error) if isinstance(error,ValueError) else 'Candidate failed'}),flush=True)
finally:
 if process.poll() is None:
  process.terminate()
  try:process.wait(timeout=10)
  except subprocess.TimeoutExpired:process.kill();process.wait()
