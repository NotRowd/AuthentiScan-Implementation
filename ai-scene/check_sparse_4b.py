"""Evaluate existing 4B weights locally; never promotes or uploads anything."""
import argparse
import json
from pathlib import Path
import threading
import time
import evaluate_visual_candidate as evaluation
import qwen_service as worker
from run_visual_4b import require_memory, verify_candidate, memory_sample
from anomaly_review import request_anomaly_review, parse_anomaly_review

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--image',type=Path,action='append',required=True)
args=parser.parse_args()
available=require_memory()
root=Path(__file__).resolve().parent
plan=json.loads((root/'visual-4b-assessment.json').read_text())
directory=verify_candidate(plan)
executable=worker.verify_assets()
worker.PLAN=plan
worker.DEST=directory
worker.CANDIDATE=plan['candidate_id']
worker.verify_assets=lambda:executable
evaluation.CANDIDATE=plan['candidate_id']
args.output.mkdir()
rows=[]
stop=threading.Event()
with worker.runtime(stop) as process:
    print('Existing 4B model ready locally; production unchanged.',flush=True)
    for index,image in enumerate(args.image):
        def capture(png):
            raw=request_anomaly_review(png)
            (args.output/f'{index}.raw.json').write_text(raw,encoding='utf-8')
            return raw
        model=worker.QwenModel(capture,parser=parse_anomaly_review)
        start=time.monotonic()
        print('Reviewing '+image.name,flush=True)
        try:
            row=dict(image=image.name,review=model.features(image.read_bytes()),seconds=round(time.monotonic()-start,2),memory=memory_sample(process.pid))
        except Exception as error:
            row=dict(image=image.name,error=type(error).__name__,cause=str(error.__cause__) if error.__cause__ else str(error))
        rows.append(row)
        (args.output/'results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
        print(json.dumps(row),flush=True)
        if 'error' in row:
            raise SystemExit('Stopped after failure; no automatic retry.')
